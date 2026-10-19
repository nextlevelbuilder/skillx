/**
 * HTTP boundary of the state transition API:
 *
 * - `POST /api/v1/packages/@handle/slug/releases/:version/state`
 * - `POST /api/v1/publishers/@handle/state` (admin only)
 *
 * Body `{"from", "to", "reason"?}` as `application/json`. 404 while
 * `SKILLX_RELEASES_API` is off. The actor is the admin when `X-Admin-Secret`
 * matches the `ADMIN_SECRET` secret (a present but wrong secret is 401, never
 * a fall back), else the viewer of the read API: an unscoped account API key
 * or the web session. Scoped `releases:publish:@handle` keys are publish-only
 * credentials and are refused here (401), so a leaked CI key cannot yank.
 * Writes have their own limiter, `RELEASE_WRITE_LIMITER`: a request carrying
 * `X-Admin-Secret` is first counted by client IP, so secret guessing is
 * throttled, and every actor is then counted before the body is read and
 * before any state or audit write. A limited
 * request is 429 and leaves no audit row. For an account the write limiter
 * fails closed (503 when missing or failing); the admin is let through so
 * containment never depends on it.
 * Every answer is `no-store`.
 */
import { RELEASE_STATES, RELEASE_STATUS_REASON_MAX_BYTES, isReleaseState } from "@skillx/contracts";
import { parsePackageIdentity, parseReleaseVersion } from "./release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { RELEASE_WRITE_RATE_WINDOW_SECONDS, checkReleaseRateLimit, rateLimitCaller } from "./release-rate-limit";
import { resolveViewer } from "./release-read";
import { PUBLISHER_STATES, transitionPublisher, transitionRelease } from "./release-transitions";
import type { PublisherState, TransitionActor } from "./release-transitions";

/** `ADMIN_SECRET` is typed as set (workers/app.ts) but may be missing at runtime; then no admin exists. */
export type ReleaseStateEnv = Env;

/** Largest accepted request body; a reason is at most 512 UTF-8 bytes. */
export const MAX_STATE_BODY_BYTES = 4096;
const BODY_FIELDS: ReadonlySet<string> = new Set(["from", "to", "reason"]);
/** A publisher handle as stored in `publishers.handle`: lowercase, without the `@`. */
const HANDLE_SOURCE = "[a-z0-9][a-z0-9._-]{0,63}";
const PUBLISHER_HANDLE = new RegExp(`^@(${HANDLE_SOURCE})$`);
/** A bare publisher handle (no `@`), the form of `publishers.handle`. */
export const BARE_PUBLISHER_HANDLE = new RegExp(`^${HANDLE_SOURCE}$`);
/** Control, format (bidi included), line/paragraph separator and lone surrogate characters. */
const FORBIDDEN_REASON = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u;
export const NO_STORE = { "Cache-Control": "no-store" };

export const invalidRequest = (message: string) => releaseError(400, "invalid_request", message);

async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)));
}

/** Compares fixed-length hashes in constant time; an unset secret never matches. */
async function adminSecretMatches(presented: string, expected: string | undefined): Promise<boolean> {
  if (expected === undefined || expected === "") return false;
  const [a, b] = await Promise.all([sha256(presented), sha256(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

export async function resolveActor(request: Request, env: ReleaseStateEnv): Promise<Exclude<TransitionActor, { kind: "publisher_key" }>> {
  const presented = request.headers.get("X-Admin-Secret");
  if (presented !== null) {
    if (!(await adminSecretMatches(presented, env.ADMIN_SECRET))) throw releaseError(401, "invalid_admin_secret", "X-Admin-Secret is not valid");
    return { kind: "admin", id: "admin" };
  }
  const userId = await resolveViewer(request, env);
  if (userId === null) throw releaseError(401, "auth.required", "sign in, or send Authorization: Bearer <account API key>");
  return { kind: "user", id: userId };
}

async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") throw releaseError(415, "unsupported_media_type", "body must be application/json");
  const tooLarge = () => releaseError(413, "request_too_large", `body exceeds ${maxBytes} bytes`);
  if (Number(request.headers.get("Content-Length") ?? "0") > maxBytes) throw tooLarge();
  if (request.body === null) throw invalidRequest("body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    total += next.value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidRequest("body must be UTF-8 JSON");
  }
}

/** An optional audit reason: 1 to 512 UTF-8 bytes without control, format or separator characters. */
export function parseReason(raw: unknown): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== "string") throw invalidRequest("reason must be a string");
  const size = new TextEncoder().encode(raw).length;
  if (size === 0 || size > RELEASE_STATUS_REASON_MAX_BYTES) throw invalidRequest(`reason must be 1 to ${RELEASE_STATUS_REASON_MAX_BYTES} UTF-8 bytes`);
  if (FORBIDDEN_REASON.test(raw)) throw invalidRequest("reason must not contain control, format or line separator characters");
  return raw;
}

/**
 * Reads a capped `application/json` body that must be a JSON object holding
 * only `fields` (an unknown field is 400). Values are not checked here.
 * `maxBytes` defaults to the state API cap; other write APIs pass their own.
 */
export async function readJsonObject(request: Request, fields: ReadonlySet<string>, maxBytes = MAX_STATE_BODY_BYTES): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = JSON.parse(await readCappedText(request, maxBytes));
  } catch (error) {
    if (error instanceof ReleaseHttpError) throw error;
    throw invalidRequest("body must be a JSON object");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalidRequest("body must be a JSON object");
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !fields.has(key));
  if (unknown.length > 0) throw invalidRequest(`unknown field: ${unknown.join(", ")}`);
  return record;
}

/** Reads `{from, to, reason?}`; `from` and `to` must be states of the subject. */
export async function readStateChange<S extends string>(
  request: Request,
  isState: (value: unknown) => value is S,
  states: readonly string[],
): Promise<{ from: S; to: S; reason: string | null }> {
  const record = await readJsonObject(request, BODY_FIELDS);
  if (!isState(record.from) || !isState(record.to)) throw invalidRequest(`from and to must be one of: ${states.join(", ")}`);
  return { from: record.from, to: record.to, reason: parseReason(record.reason) };
}

const isPublisherState = (value: unknown): value is PublisherState =>
  typeof value === "string" && (PUBLISHER_STATES as readonly string[]).includes(value);

function parsePublisherHandle(raw: string | undefined): string {
  const match = PUBLISHER_HANDLE.exec(raw ?? "");
  if (match === null) throw releaseError(400, "identity.invalid", "publisher must be @handle in lowercase");
  return match[1]!;
}

export const methodNotAllowed = () =>
  Response.json({ error: { code: "method_not_allowed", message: "use POST" } }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });

type Params = Record<string, string | undefined>;

/** 429 with the same body and `Retry-After` as the read routes. */
class RateLimitedError extends ReleaseHttpError {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(429, "rate_limited", `too many requests; retry after ${retryAfterSeconds} seconds`);
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Counts one write of `caller`; throws 429 when limited, 503 when a fail-closed limiter is unavailable. */
export async function enforceWriteLimit(env: ReleaseStateEnv, caller: string, failClosed: boolean): Promise<void> {
  const decision = await checkReleaseRateLimit(env.RELEASE_WRITE_LIMITER, caller, {
    binding: "RELEASE_WRITE_LIMITER",
    windowSeconds: RELEASE_WRITE_RATE_WINDOW_SECONDS,
    failClosed,
  });
  if (decision.allowed) return;
  if (decision.unavailable) throw releaseError(503, "rate_limit_unavailable", "state changes are unavailable; retry later");
  throw new RateLimitedError(decision.retryAfterSeconds);
}

/**
 * Resolves the actor and counts the request against the write limit (admin
 * included, keyed `user:admin`). It runs before any state or audit write
 * (an API key's `last_used_at` may already be touched), so a limited
 * request leaves no audit row: the append-only audit cannot be flooded faster
 * than the limit allows.
 */
export async function resolveLimitedActor(request: Request, env: ReleaseStateEnv): Promise<Exclude<TransitionActor, { kind: "publisher_key" }>> {
  if (request.headers.get("X-Admin-Secret") !== null) await enforceWriteLimit(env, rateLimitCaller(request, null), false);
  const actor = await resolveActor(request, env);
  await enforceWriteLimit(env, rateLimitCaller(request, actor.id), actor.kind !== "admin");
  return actor;
}

/** `Retry-After` for a 429, `WWW-Authenticate` for a 401. */
export function failureHeaders(error: ReleaseHttpError): Record<string, string> {
  if (error instanceof RateLimitedError) return { "Retry-After": String(error.retryAfterSeconds) };
  return error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {};
}

/** Serves one transition request; `params.handle` selects the publisher route. */
export async function serveStateChange(request: Request, env: ReleaseStateEnv, params: Params, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") return methodNotAllowed();
  const ok = (result: { to: string }) => Response.json({ ...result, state: result.to }, { headers: NO_STORE });
  try {
    if (params.handle !== undefined) {
      const handle = parsePublisherHandle(params.handle);
      const actor = await resolveLimitedActor(request, env);
      const change = await readStateChange(request, isPublisherState, PUBLISHER_STATES);
      return ok(await transitionPublisher(env.DB, handle, { ...change, actor, now: now() }));
    }
    const identity = parsePackageIdentity(params.scope, params.slug);
    const version = parseReleaseVersion(params.version);
    const actor = await resolveLimitedActor(request, env);
    const change = await readStateChange(request, isReleaseState, RELEASE_STATES);
    return ok(await transitionRelease(env.DB, identity, version, { ...change, actor, now: now() }));
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("release state change failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release state change failed"));
  }
}
