/**
 * HTTP boundary of the personal kit API (`/api/v1/kits/@handle/name/...`).
 * 404 `kit.api_disabled` while `SKILLX_PERSONAL_KITS_API` is off. The caller is the release
 * viewer: unscoped account API key, web session, or a scoped key acting as
 * its owner (reads: `library:read` or `kits:write:@<handle>`; writes:
 * `kits:write:@<handle>`; a key without any kit scope is 401
 * `invalid_api_key`, one scoped to another handle 403 `auth.scope_missing`
 * before any lookup). A kit is visible only to its owner, everyone else gets the same
 * 404 as an unknown kit. Reads count against `RELEASE_READ_LIMITER`, writes
 * against `RELEASE_WRITE_LIMITER` (fail closed) before the body is read.
 * Every answer is `no-store`; failures are `{error:{code,message}}`.
 */
import { PersonalKitError } from "@skillx/contracts";
import { IDENTITY_PATTERN, validateIdentity } from "@skillx/skill-tree";
import { ReleaseHttpError, errorResponse, releaseError } from "~/lib/releases/release-http";
import { checkReleaseRateLimit, rateLimitCaller } from "~/lib/releases/release-rate-limit";
import { LIBRARY_READ_SCOPE, grantsAnyKitRead, grantsAnyKitWrite, kitsWriteScope } from "~/lib/auth/api-key-scopes";
import { requireScope, resolveRequestCredential } from "~/lib/auth/scoped-viewer";
import { NO_STORE, failureHeaders, readJsonObject, resolveLimitedScopedActor } from "~/lib/releases/release-state-http";
import { newBaseCache } from "./base-loader";
import type { BaseCache } from "./base-loader";

export type KitEnv = Env & { SKILLX_PERSONAL_KITS_API?: string; SKILLX_SHARED_SKILL_ALIASES?: string };

/** Largest request body: a 1 MiB document plus the request envelope. */
export const MAX_KIT_BODY_BYTES = 1024 * 1024 + 64 * 1024;

export function personalKitsApiEnabled(env: { SKILLX_PERSONAL_KITS_API?: string }): boolean {
  const value = (env.SKILLX_PERSONAL_KITS_API ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

export const kitNotFound = () => releaseError(404, "not_found", "Not found");

/** Code of the flag-off answer. */
export const KIT_API_DISABLED = "kit.api_disabled";

/**
 * The flag-off answer. It stays a 404, so a client that only reads the
 * status keeps treating the API as absent, and its code tells a client the
 * deployment does not offer personal kits, so it can say so instead of
 * "no such kit". It is answered before any authentication or lookup and
 * names no kit, owner or state: only the deployment's flag, which the routes
 * do not hide either (other methods still get the framework's 405).
 */
export const kitApiDisabledResponse = () =>
  errorResponse(releaseError(404, KIT_API_DISABLED, "Personal kits are not enabled on this SkillX deployment"));
export const badRequest = (message: string) => releaseError(400, "invalid_request", message);
export const conflict = (code: string, message: string) => releaseError(409, code, message);

/**
 * Review and activation of a session-derived revision, and any activation
 * that makes a kit public: a human in a web session, never an API key.
 */
export function requireInteractive(caller: { interactive: boolean }, message = "approve session-derived revisions signed in on the web, not with an API key"): void {
  if (!caller.interactive) throw releaseError(403, "kit.interactive_approval_required", message);
}

/** `@handle/name` of the route; malformed is 400. */
export function parseKitName(scope: string | undefined, name: string | undefined): string {
  const kit = `${scope ?? ""}/${name ?? ""}`;
  if (!IDENTITY_PATTERN.test(kit)) throw releaseError(400, "identity.invalid", "kit must be @handle/name in lowercase");
  try {
    validateIdentity(kit);
  } catch (error) {
    throw releaseError(400, "identity.invalid", error instanceof Error ? error.message : "kit is not a valid identity");
  }
  return kit;
}

export const handleOfKit = (kit: string) => kit.slice(1, kit.indexOf("/"));

/** A contract failure as a client error that keeps the contract code. */
export function contractError(error: PersonalKitError): ReleaseHttpError {
  const status = error.code === "overlay.conflict" || error.code === "kit.composition_digest_mismatch" ? 409 : 422;
  return releaseError(status, error.code, error.path === "" ? error.detail : `${error.path}: ${error.detail}`);
}

export const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { ...headers, ...NO_STORE } });

/** Deepest JSON nesting a kit request may carry (documents and overlays need far less). */
export const MAX_JSON_DEPTH = 32;

/** 400 when `value` nests deeper than `max` (iterative, so hostile depth cannot exhaust the stack). */
export function assertJsonDepth(value: unknown, max = MAX_JSON_DEPTH): void {
  const stack: Array<[unknown, number]> = [[value, 1]];
  while (stack.length > 0) {
    const [v, depth] = stack.pop()!;
    if (typeof v !== "object" || v === null) continue;
    if (depth > max) throw badRequest(`body nests deeper than ${max} levels`);
    for (const child of Array.isArray(v) ? v : Object.values(v)) stack.push([child, depth + 1]);
  }
}

export async function readKitBody(request: Request, fields: readonly string[]): Promise<Record<string, unknown>> {
  const body = await readJsonObject(request, new Set(fields), MAX_KIT_BODY_BYTES);
  assertJsonDepth(body);
  return body;
}

export function requireGeneration(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) throw badRequest("expectedGeneration must be a non-negative integer");
  return raw;
}

/**
 * `If-Match: "g<n>"` (the kit's ETag), `"<n>"` or `<n>`. A `W/` prefix is
 * accepted because Cloudflare weakens the strong ETag when it compresses the
 * `GET`, and clients echo the header they received; the generation still has
 * to match exactly.
 */
const IF_MATCH = /^(?:(?:W\/)?"g?(\d{1,15})"|(\d{1,15}))$/;

/**
 * The expected generation of a write, from `If-Match` or the body's
 * `expectedGeneration` (kept for compatibility). Both may be sent only when
 * they agree. A stale generation is 412 when it came with `If-Match` (see
 * `serveKit`), 409 `kit.generation_conflict` otherwise.
 */
export function withIfMatch(request: Request, body: Record<string, unknown>): Record<string, unknown> {
  const raw = request.headers.get("If-Match");
  if (raw === null) return body;
  const m = IF_MATCH.exec(raw.trim());
  if (m === null) throw badRequest('If-Match must be one kit generation, as its ETag "g<n>" (or W/"g<n>") or <n>');
  const generation = Number(m[1] ?? m[2]);
  if (body.expectedGeneration !== undefined && body.expectedGeneration !== generation) throw badRequest("If-Match and expectedGeneration name different generations");
  return { ...body, expectedGeneration: generation };
}

const IDEMPOTENCY = /^[A-Za-z0-9._:-]{8,128}$/;
export function requireIdempotencyKey(raw: unknown): string {
  if (typeof raw !== "string" || !IDEMPOTENCY.test(raw)) throw badRequest("idempotencyKey must be 8 to 128 characters of [A-Za-z0-9._:-]");
  return raw;
}

export function requireId(raw: unknown, field: string): string {
  if (typeof raw !== "string" || !/^[a-z]+_[0-9a-f-]{36}$/.test(raw)) throw badRequest(`${field} must be a revision or conflict id`);
  return raw;
}

/** A refusal that carries machine-readable fields next to `code` and `message` (never content). */
export class DetailedKitError extends ReleaseHttpError {
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown>) {
    super(status, code, message);
    this.details = details;
  }
}

export interface KitCaller {
  /** The owner acting; `"admin"` for an operator call (admin routes only). */
  userId: string;
  admin: boolean;
  /** A signed-in web session (no API key, no admin secret): a human at the browser. */
  interactive: boolean;
  /** Scopes of a scoped API key; null for a session, an unscoped key or the admin (see `requireKitScope`). */
  scopes: readonly string[] | null;
  env: KitEnv;
  request: Request;
  now: Date;
  /** Release, manifest and blob reads shared by every phase of this request, with its budget. */
  bases: BaseCache;
}

/** `read` (viewer), `write` (owner) or `admin` (operator secret only). */
export type KitAccess = "read" | "write" | "admin";

async function readCaller(request: Request, env: KitEnv): Promise<{ userId: string; scopes: readonly string[] | null }> {
  const { userId, scopes } = await resolveRequestCredential(request, env, grantsAnyKitRead);
  const decision = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, rateLimitCaller(request, userId));
  if (!decision.allowed) {
    throw Object.assign(releaseError(429, "rate_limited", `too many requests; retry after ${decision.retryAfterSeconds} seconds`), { retryAfter: decision.retryAfterSeconds });
  }
  if (userId === null) throw releaseError(401, "auth.required", "sign in, or send Authorization: Bearer <account API key>");
  return { userId, scopes };
}

const kitScopes = (kit: string, access: KitAccess) => {
  const write = kitsWriteScope(handleOfKit(kit));
  return access === "read" ? [LIBRARY_READ_SCOPE, write] : [write];
};

/**
 * The scope a scoped key needs on `kit`: `library:read` or
 * `kits:write:@<handle>` to read, `kits:write:@<handle>` to write. Sessions
 * and unscoped keys pass. Ownership is still checked by every handler.
 */
export function requireKitScope(caller: Pick<KitCaller, "scopes" | "admin">, kit: string, access: KitAccess): void {
  if (caller.admin) return;
  requireScope(caller, kitScopes(kit, access));
}

/** True when the caller may read `kit` by its scopes (sessions, unscoped keys and the admin always may); ownership is separate. */
export const scopeReadsKit = (caller: Pick<KitCaller, "scopes" | "admin">, kit: string): boolean =>
  caller.admin || caller.scopes === null || kitScopes(kit, "read").some((scope) => caller.scopes!.includes(scope));

/** Runs one endpoint: flag, caller and limit, then the handler; maps every failure to the error shape. */
export async function serveKit(
  request: Request,
  env: KitEnv,
  access: KitAccess,
  handler: (caller: KitCaller) => Promise<Response>,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (!personalKitsApiEnabled(env)) return kitApiDisabledResponse();
  try {
    let userId: string;
    let scopes: readonly string[] | null;
    if (access === "read") {
      ({ userId, scopes } = await readCaller(request, env));
    } else {
      // Only a key holding some kits:write scope gets past here; admin routes accept no scoped key.
      const resolved = await resolveLimitedScopedActor(request, env, access === "write" ? grantsAnyKitWrite : undefined);
      const { actor } = resolved;
      // The admin secret names no owner, so it sees no kit except on an admin route.
      if (access === "admin" && actor.kind !== "admin") throw releaseError(403, "kit.admin_only", "this action is reserved to operators");
      if (access === "write" && actor.kind !== "user") throw kitNotFound();
      userId = actor.id;
      scopes = resolved.scopes;
    }
    // The API key decides whenever Authorization is present, the session otherwise.
    const interactive = access !== "admin" && !request.headers.has("Authorization") && !request.headers.has("X-Admin-Secret");
    return await handler({ userId, admin: access === "admin", interactive, scopes, env, request, now: now(), bases: newBaseCache() });
  } catch (error) {
    if (error instanceof PersonalKitError) return errorResponse(contractError(error));
    if (error instanceof DetailedKitError) {
      return json({ error: { code: error.code, message: error.message, ...error.details } }, error.status);
    }
    if (error instanceof ReleaseHttpError && error.code === "kit.generation_conflict" && request.headers.has("If-Match")) {
      return errorResponse(releaseError(412, error.code, error.message));
    }
    if (error instanceof ReleaseHttpError) {
      const retry = (error as { retryAfter?: number }).retryAfter;
      return errorResponse(error, retry === undefined ? failureHeaders(error, env) : { "Retry-After": String(retry) });
    }
    console.error("personal kit request failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "kit.internal_error", "personal kit request failed"));
  }
}
