/**
 * Operator review of quarantined releases (admin only, `X-Admin-Secret`).
 *
 * - `GET /api/v1/admin/quarantine`: the review queue, quarantined releases
 *   oldest first with their last review decision.
 * - `POST /api/v1/packages/@handle/slug/releases/:version/review` with
 *   `{"decision": "approve" | "reject", "reason"?}`.
 *
 * `approve` lifts the quarantine and restores the state the release had
 * before it, read from the last two applied `release_state_audit` edges in
 * write order (rowid): a release quarantined while yanked (the composite
 * `yanked -> published -> quarantined` batch) goes back to `yanked` only, so
 * an owner's yank is never undone; `{"restoreTo": "published"}` publishes it
 * explicitly. Publishing runs `quarantined -> yanked -> published` (the v1
 * status graph has no direct edge, so the signed status sequence advances by
 * 2). One batch writes one audit row per edge and one `release_reviews` row,
 * all or nothing, guarded on `quarantined_at` being the value the approval
 * read, so a re-quarantine in between is `409`. `reject` confirms the
 * quarantine: the release stays `quarantined` (its bytes stay blocked in
 * every package)
 * and only a `release_reviews` row is written. Both are compare-and-set on
 * `quarantined`: a release that is no longer quarantined is `409
 * state_conflict`. Accounts get 403. Requests are counted on
 * `RELEASE_WRITE_LIMITER` first. 404 while `SKILLX_RELEASES_API` is off.
 */
import { notFound, parsePackageIdentity, parseReleaseVersion } from "./release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { compareAndSet } from "./release-state-cas";
import { listQuarantine } from "./release-review-queue";
import { NO_STORE, failureHeaders, invalidRequest, methodNotAllowed, parseReason, readJsonObject, resolveLimitedActor } from "./release-state-http";

export const REVIEW_DECISIONS = ["approve", "reject"] as const;
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number];
const BODY_FIELDS: ReadonlySet<string> = new Set(["decision", "reason", "restoreTo"]);
export const RESTORE_STATES = ["published", "yanked"] as const;
export type RestoreState = (typeof RESTORE_STATES)[number];

const REVIEW_COLUMNS = "id, release_id, release_digest, decision, actor_kind, actor_id, reason, created_at";
const reviewId = () => `rrv_${crypto.randomUUID()}`;

export interface ReviewResult {
  identity: string;
  version: string;
  releaseDigest: string | null;
  decision: ReviewDecision;
  state: RestoreState | "quarantined";
  reviewedAt: string;
}

type Subject = { id: string; release_state: string; release_digest: string | null; signed_manifest_key: string | null; quarantined_at: number | null };
type Edge = { from_state: string; to_state: string; created_at: number };

/**
 * The state a quarantined release had before its latest quarantine, read from
 * the last two applied audit edges in write order (rowid; the table is
 * append-only). Quarantining a yanked release is the one composite batch
 * `yanked -> published -> quarantined`, so exactly that pair, written by one
 * batch (same `created_at`), means `yanked`. Anything else counts as
 * `published`, including a release quarantined at publish time.
 */
async function stateBeforeQuarantine(db: D1Database, releaseId: string): Promise<RestoreState> {
  const { results } = await db
    .prepare(
      `SELECT from_state, to_state, created_at FROM release_state_audit
        WHERE subject_kind = 'release' AND subject_id = ? AND outcome = 'applied' ORDER BY rowid DESC LIMIT 2`,
    )
    .bind(releaseId)
    .all<Edge>();
  const [last, before] = results;
  if (last === undefined || last.to_state !== "quarantined") return "published";
  if (last.from_state === "yanked") return "yanked";
  const composite = last.from_state === "published" && before?.from_state === "yanked" && before.to_state === "published" && before.created_at === last.created_at;
  return composite ? "yanked" : "published";
}

export async function reviewRelease(
  db: D1Database,
  identity: string,
  version: string,
  input: { decision: ReviewDecision; reason: string | null; restoreTo?: RestoreState; now: Date },
): Promise<ReviewResult> {
  const subject = await db
    .prepare(
      `SELECT r.id, r.release_state, r.release_digest, r.signed_manifest_key, r.quarantined_at
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

  const target = input.restoreTo ?? (await stateBeforeQuarantine(db, subject.id));
  if (target === "published" && (subject.release_digest === null || subject.signed_manifest_key === null)) {
    throw releaseError(422, "release.incomplete", "a release without a tree digest and signed manifest cannot be published");
  }
  // `quarantined_at` is set by every move into quarantine, so it pins the quarantine this decision read.
  const guard = { sql: "EXISTS (SELECT 1 FROM package_releases WHERE id = ? AND quarantined_at IS ?)", binds: [subject.id, subject.quarantined_at] };
  const outcome = await compareAndSet(
    db,
    { kind: "release", subjectId: subject.id, input: { from: "quarantined", to: target, reason: input.reason, actor: { kind: "admin", id: "admin" }, now: input.now } },
    {
      path: target === "published" ? ["quarantined", "yanked", "published"] : ["quarantined", "yanked"],
      ...(target === "published" ? { extraSet: ", published_at = COALESCE(published_at, ?)", extraBinds: [at] } : {}),
      guard,
      alsoInsert: [
        {
          sql: `INSERT INTO release_reviews (${REVIEW_COLUMNS}) SELECT ?, ?, ?, ?, 'admin', 'admin', ?, ?`,
          binds: [reviewId(), subject.id, subject.release_digest, decided, input.reason, at],
        },
      ],
    },
  );
  if (outcome !== "applied") throw conflict();
  return result(target);
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
    if (body.restoreTo !== undefined && !(RESTORE_STATES as readonly unknown[]).includes(body.restoreTo)) {
      throw invalidRequest(`restoreTo must be one of: ${RESTORE_STATES.join(", ")}`);
    }
    if (body.restoreTo !== undefined && body.decision !== "approve") throw invalidRequest("restoreTo applies only to approve");
    const result = await reviewRelease(env.DB, identity, version, {
      decision: body.decision as ReviewDecision,
      reason: parseReason(body.reason),
      restoreTo: body.restoreTo as RestoreState | undefined,
      now: now(),
    });
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
