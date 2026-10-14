/**
 * Admin-only publisher provisioning: `POST /api/v1/publishers`.
 *
 * Body `{"handle", "ownerUserId", "verifiedBy"?, "reason"?}` as
 * `application/json`, capped like a state change body; any other field is
 * 400. `handle` is the bare lowercase handle as stored in `publishers.handle`
 * (no `@`). `ownerUserId` is the id of an existing `user` row (else 404
 * `user.not_found`). `verifiedBy` may only be `admin`, its default: the
 * `publishers` table has no verification column and every signed release
 * manifest records `verifiedBy: "admin"`, so no other value could be honored.
 *
 * The caller must be the admin (`X-Admin-Secret`); an account is 403. The
 * request is counted on `RELEASE_WRITE_LIMITER` exactly like a state write
 * (client IP first, then `user:admin`) before the body is read.
 *
 * Creation is idempotent and race safe: the insert is `ON CONFLICT(handle) DO
 * NOTHING` and the publisher is read back afterwards. A new publisher is
 * `200 {created: true}`; a replay with the same owner is `200 {created:
 * false}` with the stored state and writes nothing; the same handle with
 * another owner is `409 publisher.conflict`. A creation writes one
 * `release_state_audit` row in the same batch (`subject_kind` `publisher`,
 * `from_state` `none`, `to_state` `active`, outcome `applied`).
 * Every answer is `no-store`.
 */
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import {
  BARE_PUBLISHER_HANDLE,
  NO_STORE,
  failureHeaders,
  invalidRequest,
  methodNotAllowed,
  parseReason,
  readJsonObject,
  resolveLimitedActor,
} from "./release-state-http";
import type { ReleaseStateEnv } from "./release-state-http";
import type { PublisherState } from "./release-transitions";

const BODY_FIELDS: ReadonlySet<string> = new Set(["handle", "ownerUserId", "verifiedBy", "reason"]);
/** The only verification the registry records today (see the module comment). */
const PROVISIONED_VERIFICATION = "admin";
/** Better Auth user ids are short printable ASCII; anything else cannot be a user. */
const USER_ID = /^[\x21-\x7e]{1,128}$/;
/** The `from_state` of the audit row that records a creation (no prior state). */
export const CREATION_FROM_STATE = "none";

export interface PublisherProvisionRequest {
  handle: string;
  ownerUserId: string;
  verifiedBy: typeof PROVISIONED_VERIFICATION;
  reason: string | null;
}

export interface PublisherProvisionResult {
  handle: string;
  ownerUserId: string;
  verifiedBy: typeof PROVISIONED_VERIFICATION;
  state: PublisherState;
  created: boolean;
}

/** Validates the provisioning body; every failure is 400 `invalid_request`. */
export async function readProvisionRequest(request: Request): Promise<PublisherProvisionRequest> {
  const record = await readJsonObject(request, BODY_FIELDS);
  if (typeof record.handle !== "string" || !BARE_PUBLISHER_HANDLE.test(record.handle)) {
    throw invalidRequest("handle must be a lowercase publisher handle without @ ([a-z0-9][a-z0-9._-]{0,63})");
  }
  if (typeof record.ownerUserId !== "string" || !USER_ID.test(record.ownerUserId)) {
    throw invalidRequest("ownerUserId must be the id of an existing user");
  }
  if (record.verifiedBy !== undefined && record.verifiedBy !== PROVISIONED_VERIFICATION) {
    throw invalidRequest(`verifiedBy must be ${PROVISIONED_VERIFICATION}`);
  }
  return { handle: record.handle, ownerUserId: record.ownerUserId, verifiedBy: PROVISIONED_VERIFICATION, reason: parseReason(record.reason) };
}

const AUDIT_COLUMNS = "id, subject_kind, subject_id, actor_kind, actor_id, from_state, to_state, outcome, reason, created_at";

type StoredPublisher = { id: string; owner_user_id: string | null; state: PublisherState };

/**
 * Creates the active publisher `input.handle` owned by `input.ownerUserId`,
 * or recognizes an identical earlier creation. One atomic batch: the insert
 * (skipped on a handle conflict or a missing user) and its audit row, which
 * is written only when this request's row exists, so a lost race or a
 * replay leaves no audit row.
 */
export async function provisionPublisher(db: D1Database, input: PublisherProvisionRequest, now: Date): Promise<PublisherProvisionResult> {
  const user = await db.prepare('SELECT 1 AS found FROM "user" WHERE id = ?').bind(input.ownerUserId).first<{ found: number }>();
  if (user === null) throw releaseError(404, "user.not_found", "ownerUserId does not name an existing user");

  const id = `pub_${crypto.randomUUID()}`;
  const at = now.getTime();
  await db.batch([
    db
      .prepare(
        `INSERT INTO publishers (id, handle, display_name, owner_user_id, state, created_at)
         SELECT ?, ?, ?, ?, 'active', ? WHERE EXISTS (SELECT 1 FROM "user" WHERE id = ?)
         ON CONFLICT(handle) DO NOTHING`,
      )
      .bind(id, input.handle, input.handle, input.ownerUserId, at, input.ownerUserId),
    db
      .prepare(
        `INSERT INTO release_state_audit (${AUDIT_COLUMNS})
         SELECT ?, 'publisher', ?, 'admin', 'admin', ?, 'active', 'applied', ?, ?
          WHERE EXISTS (SELECT 1 FROM publishers WHERE id = ?)`,
      )
      .bind(`rsa_${crypto.randomUUID()}`, id, CREATION_FROM_STATE, input.reason, at, id),
  ]);

  const stored = await db.prepare("SELECT id, owner_user_id, state FROM publishers WHERE handle = ?").bind(input.handle).first<StoredPublisher>();
  // No row: the owner was deleted between the check and the batch.
  if (stored === null) throw releaseError(404, "user.not_found", "ownerUserId does not name an existing user");
  const created = stored.id === id;
  if (!created && stored.owner_user_id !== input.ownerUserId) {
    throw releaseError(409, "publisher.conflict", `publisher @${input.handle} already exists with another owner`);
  }
  return { handle: input.handle, ownerUserId: input.ownerUserId, verifiedBy: input.verifiedBy, state: stored.state, created };
}

/** Serves one provisioning request. */
export async function servePublisherProvision(request: Request, env: ReleaseStateEnv, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const actor = await resolveLimitedActor(request, env);
    if (actor.kind !== "admin") throw releaseError(403, "publisher.admin_only", "only an admin may provision a publisher");
    const input = await readProvisionRequest(request);
    const result = await provisionPublisher(env.DB, input, now());
    if (result.created) console.info(`publisher provisioned: @${result.handle}`);
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("publisher provisioning failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "publisher provisioning failed"));
  }
}
