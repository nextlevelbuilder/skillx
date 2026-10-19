/**
 * HTTP boundary of the collections API (`/api/v1/collections[/...]`, see
 * docs/api-reference.md#collections). 404 everywhere while
 * `SKILLX_COLLECTIONS_API` is off. Reads accept an unscoped API key, the web
 * session or no credentials (public and unlisted collections only) and count
 * against `RELEASE_READ_LIMITER`; writes need an owner (session or unscoped
 * key, never the admin secret or a scoped key) and count against
 * `RELEASE_WRITE_LIMITER` (fail closed) before the body is read. A private
 * collection of someone else answers the same 404 as an unknown one. Every
 * answer is `no-store`; failures are `{error:{code,message}}`.
 */
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "~/lib/releases/release-http";
import { checkReleaseRateLimit, rateLimitCaller } from "~/lib/releases/release-rate-limit";
import { resolveViewer } from "~/lib/releases/release-read";
import { NO_STORE, failureHeaders, readJsonObject, resolveLimitedActor } from "~/lib/releases/release-state-http";

export type CollectionEnv = Env & { SKILLX_COLLECTIONS_API?: string };

/** A full revision (256 members) fits easily; larger bodies are refused before parsing. */
export const MAX_COLLECTION_BODY_BYTES = 256 * 1024;

export function collectionsApiEnabled(env: { SKILLX_COLLECTIONS_API?: string }): boolean {
  const value = (env.SKILLX_COLLECTIONS_API ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

export const collectionNotFound = () => releaseError(404, "not_found", "Not found");
export const badRequest = (message: string) => releaseError(400, "invalid_request", message);

export const json = (body: unknown, status = 200) => Response.json(body, { status, headers: NO_STORE });

/** A refusal that carries validation issues next to `code` and `message`. */
export class CollectionValidationError extends ReleaseHttpError {
  readonly issues: Array<{ path: string; code: string }>;

  constructor(issues: Array<{ path: string; code: string }>) {
    super(422, "collection.invalid", `invalid collection content: ${issues.map((i) => `${i.path} ${i.code}`).join(", ")}`);
    this.issues = issues;
  }
}

export interface CollectionCaller {
  /** The signed-in user, or null for an anonymous read. */
  userId: string | null;
  env: CollectionEnv;
  request: Request;
  now: Date;
}

export const readBody = (request: Request, fields: readonly string[]) => readJsonObject(request, new Set(fields), MAX_COLLECTION_BODY_BYTES);

export function requireRevisionNumber(raw: unknown, field = "expectedRevision"): number {
  if (typeof raw !== "number" || !Number.isSafeInteger(raw) || raw < 0) throw badRequest(`${field} must be a non-negative integer`);
  return raw;
}

/** Runs one endpoint: flag, caller and limit, then the handler; maps every failure to the error shape. */
export async function serveCollections(
  request: Request,
  env: CollectionEnv,
  access: "read" | "write",
  handler: (caller: CollectionCaller) => Promise<Response>,
  now: () => Date = () => new Date(),
): Promise<Response> {
  if (!collectionsApiEnabled(env)) return notFoundResponse();
  try {
    let userId: string | null;
    if (access === "read") {
      userId = await resolveViewer(request, env);
      const decision = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, rateLimitCaller(request, userId));
      if (!decision.allowed) {
        throw Object.assign(releaseError(429, "rate_limited", `too many requests; retry after ${decision.retryAfterSeconds} seconds`), { retryAfter: decision.retryAfterSeconds });
      }
    } else {
      const actor = await resolveLimitedActor(request, env);
      if (actor.kind !== "user") throw releaseError(403, "collection.owner_only", "collections are written by their owner, not by operators");
      userId = actor.id;
    }
    return await handler({ userId, env, request, now: now() });
  } catch (error) {
    if (error instanceof CollectionValidationError) {
      return Response.json({ error: { code: error.code, message: error.message, issues: error.issues } }, { status: 422, headers: NO_STORE });
    }
    if (error instanceof ReleaseHttpError) {
      const retry = (error as { retryAfter?: number }).retryAfter;
      return errorResponse(error, retry === undefined ? failureHeaders(error) : { "Retry-After": String(retry) });
    }
    console.error("collection request failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "collection.internal_error", "collection request failed"));
  }
}
