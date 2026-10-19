/**
 * Operator review of quarantined releases (admin only, `X-Admin-Secret`).
 *
 * - `GET /api/v1/admin/quarantine`: the review queue, quarantined releases
 *   oldest first with their last review decision.
 * - `POST /api/v1/packages/@handle/slug/releases/:version/review` with
 *   `{"decision": "approve" | "reject", "reason"?}`.
 *
 * `approve` lifts the quarantine: `quarantined -> yanked -> published` in one
 * atomic batch (the v1 status graph has no direct edge, so the signed status
 * sequence advances by 2), one `release_state_audit` row per edge and one
 * `release_reviews` row, all or nothing. `reject` confirms the quarantine:
 * the release stays `quarantined` (its bytes stay blocked in every package)
 * and only a `release_reviews` row is written. Both are compare-and-set on
 * `quarantined`: a release that is no longer quarantined is `409
 * state_conflict`. Accounts get 403. Requests are counted on
 * `RELEASE_WRITE_LIMITER` first. 404 while `SKILLX_RELEASES_API` is off.
 */
import { notFound, parsePackageIdentity, parseReleaseVersion } from "./release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { compareAndSet } from "./release-state-cas";
import { NO_STORE, failureHeaders, invalidRequest, methodNotAllowed, parseReason, readJsonObject, resolveLimitedActor } from "./release-state-http";

export const REVIEW_DECISIONS = ["approve", "reject"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
const BODY_FIELDS: ReadonlySet<string> = new Set(["decision", "reason"]);
/** Most queue entries one listing returns. */
export const MAX_QUEUE_ENTRIES = 200;

const REVIEW_COLUMNS = "id, release_id, release_digest, decision, actor_kind, actor_id, reason, created_at";
const reviewId = () => `rrv_${crypto.randomUUID()}`;

export interface ReviewResult {
  identity: string;
  version: string;
  releaseDigest: string | null;
  decision: ReviewDecision;
  state: "published" | "quarantined";
  reviewedAt: string;
}

type Subject = { id: string; release_state: string; release_digest: string | null; signed_manifest_key: string | null };

export async function reviewRelease(
  db: D1Database,
  identity: string,
  version: string,
  input: { decision: ReviewDecision; reason: string | null; now: Date },
): Promise<ReviewResult> {
  const subject = await db
    .prepare(
      `SELECT r.id, r.release_state, r.release_digest, r.signed_manifest_key
         FROM package_releases r JOIN packages p ON p.id = r.package_id WHERE p.name = ? AND r.version = ?`,
    )
    .bind(identity, version)
    .first<Subject>();
  if (subject === null) throw notFound();
  const conflict = () => releaseError(409, "state_conflict", `the release is ${subject.release_state === "quarantined" ? "no longer" : "not"} quarantined; read its current state`);
  if (subject.release_state !== "quarantined") throw conflict();
  const at = input.now.getTime();
  const decided = input.decision === "approve" ? "approved" : "rejected";
  const result = (state: ReviewResult["state"]): ReviewResult => ({
    identity,
    version,
    releaseDigest: subject.release_digest,
    decision: input.decision,
    state,
    reviewedAt: input.now.toISOString(),
  });

  if (input.decision === "reject") {
    const insert = await db
      .prepare(
        `INSERT INTO release_reviews (${REVIEW_COLUMNS})
         SELECT ?, ?, ?, ?, 'admin', 'admin', ?, ? WHERE EXISTS (SELECT 1 FROM package_releases WHERE id = ? AND release_state = 'quarantined')`,
      )
      .bind(reviewId(), subject.id, subject.release_digest, decided, input.reason, at, subject.id)
      .run();
    if ((insert.meta.changes ?? 0) !== 1) throw conflict();
    return result("quarantined");
  }

  if (subject.release_digest === null || subject.signed_manifest_key === null) {
    throw releaseError(422, "release.incomplete", "a release without a tree digest and signed manifest cannot be published");
  }
  const outcome = await compareAndSet(
    db,
    { kind: "release", subjectId: subject.id, input: { from: "quarantined", to: "published", reason: input.reason, actor: { kind: "admin", id: "admin" }, now: input.now } },
    {
      path: ["quarantined", "yanked", "published"],
      extraSet: ", published_at = COALESCE(published_at, ?)",
      extraBinds: [at],
      alsoInsert: [
        {
          sql: `INSERT INTO release_reviews (${REVIEW_COLUMNS}) SELECT ?, ?, ?, ?, 'admin', 'admin', ?, ?`,
          binds: [reviewId(), subject.id, subject.release_digest, decided, input.reason, at],
        },
      ],
    },
  );
  if (outcome !== "applied") throw conflict();
  return result("published");
}

type QueueRow = {
  name: string;
  version: string;
  channel: string;
  release_digest: string | null;
  quarantined_at: number | null;
  decision: string | null;
  review_reason: string | null;
  reviewed_at: number | null;
};

/** Quarantined releases, oldest quarantine first, each with its latest review (if any). */
export async function listQuarantine(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT p.name, r.version, r.channel, r.release_digest, r.quarantined_at,
              rv.decision, rv.reason AS review_reason, rv.created_at AS reviewed_at
         FROM package_releases r
         JOIN packages p ON p.id = r.package_id
         LEFT JOIN release_reviews rv ON rv.id = (
           SELECT id FROM release_reviews WHERE release_id = r.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
        WHERE r.release_state = 'quarantined'
        ORDER BY r.quarantined_at, r.id LIMIT ?`,
    )
    .bind(MAX_QUEUE_ENTRIES)
    .all<QueueRow>();
  const iso = (ms: number | null) => (ms === null ? null : new Date(Number(ms)).toISOString());
  return results.map((row) => ({
    identity: row.name,
    version: row.version,
    channel: row.channel,
    releaseDigest: row.release_digest,
    quarantinedAt: iso(row.quarantined_at),
    lastReview: row.decision === null ? null : { decision: row.decision, reason: row.review_reason, reviewedAt: iso(row.reviewed_at) },
  }));
}

async function requireAdmin(request: Request, env: Env): Promise<void> {
  const actor = await resolveLimitedActor(request, env);
  if (actor.kind !== "admin") throw releaseError(403, "review.admin_only", "only an admin may review quarantined releases");
}

async function serve(env: Env, run: () => Promise<Response>): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  try {
    return await run();
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("release review failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release review failed"));
  }
}

/** `POST .../releases/:version/review` */
export function serveReview(request: Request, env: Env, params: Record<string, string | undefined>, now: () => Date = () => new Date()): Promise<Response> {
  return serve(env, async () => {
    if (request.method !== "POST") return methodNotAllowed();
    const identity = parsePackageIdentity(params.scope, params.slug);
    const version = parseReleaseVersion(params.version);
    await requireAdmin(request, env);
    const body = await readJsonObject(request, BODY_FIELDS);
    if (!(REVIEW_DECISIONS as readonly unknown[]).includes(body.decision)) throw invalidRequest(`decision must be one of: ${REVIEW_DECISIONS.join(", ")}`);
    const result = await reviewRelease(env.DB, identity, version, { decision: body.decision as ReviewDecision, reason: parseReason(body.reason), now: now() });
    return Response.json(result, { headers: NO_STORE });
  });
}

/** `GET /api/v1/admin/quarantine` */
export function serveQuarantineQueue(request: Request, env: Env): Promise<Response> {
  return serve(env, async () => {
    await requireAdmin(request, env);
    return Response.json({ releases: await listQuarantine(env.DB) }, { headers: NO_STORE });
  });
}
