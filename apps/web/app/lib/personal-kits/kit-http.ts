/**
 * HTTP boundary of the personal kit API (`/api/v1/kits/@handle/name/...`).
 * 404 while `SKILLX_PERSONAL_KITS_API` is off. The caller is the release
 * viewer (unscoped account API key or web session; scoped publish keys are
 * refused); a kit is visible only to its owner, everyone else gets the same
 * 404 as an unknown kit. Reads count against `RELEASE_READ_LIMITER`, writes
 * against `RELEASE_WRITE_LIMITER` (fail closed) before the body is read.
 * Every answer is `no-store`; failures are `{error:{code,message}}`.
 */
import { PersonalKitError } from "@skillx/contracts";
import { IDENTITY_PATTERN, validateIdentity } from "@skillx/skill-tree";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "~/lib/releases/release-http";
import { checkReleaseRateLimit, rateLimitCaller } from "~/lib/releases/release-rate-limit";
import { resolveViewer } from "~/lib/releases/release-read";
import { NO_STORE, failureHeaders, readJsonObject, resolveLimitedActor } from "~/lib/releases/release-state-http";
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
export const badRequest = (message: string) => releaseError(400, "invalid_request", message);
export const conflict = (code: string, message: string) => releaseError(409, code, message);

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

export async function readKitBody(request: Request, fields: readonly string[]): Promise<Record<string, unknown>> {
  return readJsonObject(request, new Set(fields), MAX_KIT_BODY_BYTES);
}

export function requireGeneration(raw: unknown): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) throw badRequest("expectedGeneration must be a non-negative integer");
  return raw;
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

export interface KitCaller {
  userId: string;
  env: KitEnv;
  request: Request;
  now: Date;
  /** Release, manifest and blob reads shared by every phase of this request, with its budget. */
  bases: BaseCache;
}

async function readCaller(request: Request, env: KitEnv): Promise<string> {
  const userId = await resolveViewer(request, env);
  const decision = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, rateLimitCaller(request, userId));
  if (!decision.allowed) {
    throw Object.assign(releaseError(429, "rate_limited", `too many requests; retry after ${decision.retryAfterSeconds} seconds`), { retryAfter: decision.retryAfterSeconds });
  }
  if (userId === null) throw releaseError(401, "auth.required", "sign in, or send Authorization: Bearer <account API key>");
  return userId;
}

/** Runs one endpoint: flag, caller and limit, then the handler; maps every failure to the error shape. */
export async function serveKit(
  request: Request,
  env: KitEnv,
  write: boolean,
  handler: (caller: KitCaller) => Promise<Response>,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (!personalKitsApiEnabled(env)) return notFoundResponse();
  try {
    let userId: string;
    if (write) {
      const actor = await resolveLimitedActor(request, env);
      // The admin secret names no owner, so it sees no kit.
      if (actor.kind !== "user") throw kitNotFound();
      userId = actor.id;
    } else {
      userId = await readCaller(request, env);
    }
    return await handler({ userId, env, request, now: now(), bases: newBaseCache() });
  } catch (error) {
    if (error instanceof PersonalKitError) return errorResponse(contractError(error));
    if (error instanceof ReleaseHttpError) {
      const retry = (error as { retryAfter?: number }).retryAfter;
      return errorResponse(error, retry === undefined ? failureHeaders(error) : { "Retry-After": String(retry) });
    }
    console.error("personal kit request failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "kit.internal_error", "personal kit request failed"));
  }
}
