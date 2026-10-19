/**
 * `Idempotency-Key` on the release publish route.
 *
 * Without the header a publish runs exactly as before (it is already safe to
 * retry: the same version with the same tree answers `created: false`). With
 * it, the key is bound to one exact request per publisher, stored in D1
 * (`release_publish_idempotency`) for 24 hours:
 *
 * - same key, same request (package name, parsed metadata, body sha256):
 *   the stored answer is replayed verbatim (status and JSON body) with
 *   `Idempotent-Replayed: true`; nothing is re-read or re-written;
 * - same key, different request: `422 idempotency.key_reused`;
 * - same key while the first request still runs: `409 idempotency.in_progress`.
 *
 * Authentication, the name and the metadata are checked before the key is
 * claimed, so a rejected credential never consumes a key. Answers below 500
 * are stored (they are deterministic for the same bytes); a 5xx releases the
 * claim so the client may retry with the same key. A claim left pending by a
 * crashed request is taken over by the same request after 5 minutes.
 */
import { ingestRelease } from "./ingest-release";
import type { IngestDeps } from "./ingest-release";
import { authorizeReleasePublisher } from "./release-auth";
import { ReleaseHttpError, errorResponse, releaseError } from "./release-http";
import { MAX_RELEASE_UPLOAD_BYTES } from "./release-limits";
import { RELEASE_METADATA_HEADER, parseReleaseMetadata, parseReleaseName, readUploadBody } from "./release-request";
import type { ReleaseMetadata } from "./release-request";

export const IDEMPOTENCY_HEADER = "Idempotency-Key";
export const IDEMPOTENCY_TTL_MS = 24 * 60 * 60_000;
export const IDEMPOTENCY_PENDING_TIMEOUT_MS = 5 * 60_000;
/** Printable ASCII without spaces, 1 to 255 characters; an RFC 8941 quoted string is unwrapped. */
const KEY_PATTERN = /^[\x21-\x7e]{1,255}$/;

/** The key of the request, null without the header, 400 when malformed. */
export function parseIdempotencyKey(request: Request): string | null {
  const raw = request.headers.get(IDEMPOTENCY_HEADER);
  if (raw === null) return null;
  const trimmed = raw.trim();
  const key = trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
  if (!KEY_PATTERN.test(key) || key.includes('"')) {
    throw releaseError(400, "idempotency.invalid_key", `${IDEMPOTENCY_HEADER} must be 1 to 255 printable ASCII characters without spaces`);
  }
  return key;
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Binds a key to the package, the parsed metadata (fixed field order) and the exact body bytes. */
export async function requestFingerprint(identity: string, metadata: ReleaseMetadata, body: Uint8Array): Promise<string> {
  const { version, channel, kind, sourceProvenance, declaredScripts } = metadata;
  const text = JSON.stringify([identity, version, channel, kind, sourceProvenance, declaredScripts, await sha256Hex(body)]);
  return `sha256:${await sha256Hex(new TextEncoder().encode(text))}`;
}

type StoredKey = { request_fingerprint: string; status: string; response_status: number | null; response_body: string | null };

/** Claims the key for this request; on conflict reports what holds it. */
async function claim(db: D1Database, publisherId: string, key: string, fingerprint: string, now: number): Promise<StoredKey | null> {
  const result = await db
    .prepare(
      `INSERT INTO release_publish_idempotency (publisher_id, idempotency_key, request_fingerprint, status, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?)
       ON CONFLICT(publisher_id, idempotency_key) DO UPDATE SET
         request_fingerprint = excluded.request_fingerprint, status = 'pending', response_status = NULL,
         response_body = NULL, created_at = excluded.created_at, expires_at = excluded.expires_at
       WHERE release_publish_idempotency.expires_at <= excluded.created_at
          OR (release_publish_idempotency.status = 'pending' AND release_publish_idempotency.created_at <= ?
              AND release_publish_idempotency.request_fingerprint = excluded.request_fingerprint)`,
    )
    .bind(publisherId, key, fingerprint, now, now + IDEMPOTENCY_TTL_MS, now - IDEMPOTENCY_PENDING_TIMEOUT_MS)
    .run();
  if ((result.meta.changes ?? 0) === 1) return null;
  const held = await db
    .prepare("SELECT request_fingerprint, status, response_status, response_body FROM release_publish_idempotency WHERE publisher_id = ? AND idempotency_key = ?")
    .bind(publisherId, key)
    .first<StoredKey>();
  // Vanished between the two statements (a 5xx released it): treat as in progress, the client retries.
  return held ?? { request_fingerprint: fingerprint, status: "pending", response_status: null, response_body: null };
}

const NO_STORE = { "Cache-Control": "no-store" };

function replay(stored: StoredKey): Response {
  return new Response(stored.response_body, {
    status: stored.response_status ?? 200,
    headers: { "Content-Type": "application/json", "Idempotent-Replayed": "true", ...NO_STORE },
  });
}

async function publishOnce(request: Request, params: { scope?: string; slug?: string }, deps: IngestDeps, key: string): Promise<Response> {
  const now = deps.now?.() ?? new Date();
  const name = parseReleaseName(params.scope, params.slug);
  const auth = await authorizeReleasePublisher(deps.db, request, name.handle, { tokenSecret: deps.tokenSecret, now });
  const metadata = parseReleaseMetadata(request.headers.get(RELEASE_METADATA_HEADER));
  const body = await readUploadBody(request, MAX_RELEASE_UPLOAD_BYTES);
  const fingerprint = await requestFingerprint(name.identity, metadata, body);

  const held = await claim(deps.db, auth.publisherId, key, fingerprint, now.getTime());
  if (held !== null) {
    if (held.request_fingerprint !== fingerprint) {
      throw releaseError(422, "idempotency.key_reused", `${IDEMPOTENCY_HEADER} was already used for a different request`);
    }
    if (held.status !== "complete") throw releaseError(409, "idempotency.in_progress", "a request with this Idempotency-Key is still in progress; retry later");
    return replay(held);
  }

  const forwarded = new Request(request.url, { method: "POST", headers: request.headers, body: body as Uint8Array<ArrayBuffer> });
  const response = await ingestRelease(forwarded, params, deps);
  const text = await response.text();
  const where = "WHERE publisher_id = ? AND idempotency_key = ? AND request_fingerprint = ? AND status = 'pending'";
  if (response.status >= 500) {
    await deps.db.prepare(`DELETE FROM release_publish_idempotency ${where}`).bind(auth.publisherId, key, fingerprint).run();
  } else {
    await deps.db
      .prepare(`UPDATE release_publish_idempotency SET status = 'complete', response_status = ?, response_body = ? ${where}`)
      .bind(response.status, text, auth.publisherId, key, fingerprint)
      .run();
  }
  return new Response(text, { status: response.status, headers: response.headers });
}

/** The publish route: idempotent when the request carries `Idempotency-Key`. */
export async function publishRelease(request: Request, params: { scope?: string; slug?: string }, deps: IngestDeps): Promise<Response> {
  try {
    const key = parseIdempotencyKey(request);
    if (key === null) return await ingestRelease(request, params, deps);
    return await publishOnce(request, params, deps, key);
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error);
    console.error("release publish failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release publish failed"));
  }
}
