/**
 * Release and publisher state transitions. Every transition is a
 * compare-and-set: the caller names the state it expects (`from`), and the
 * change applies only while the row is still in it; otherwise `409
 * state_conflict`. Every attempt by an authenticated actor on an existing
 * subject is audited in `release_state_audit` (`applied`, `stale`, `denied`
 * or `invalid`; see `release-state-cas.ts`). Nothing is deleted.
 *
 * Only `release_state`/`publishers.state` and the matching `*_at` timestamp
 * change. Bytes, digests, keys and manifests are never touched, so a yanked or
 * quarantined release keeps its digest under its version.
 *
 * Release edges are exactly the `skillx.release-status/v1` graph
 * (`RELEASE_STATE_TRANSITIONS`, repeats excluded), so every state history this
 * API creates can later be issued as signed statuses. Lifting a quarantine is
 * therefore two steps (`quarantined` -> `yanked` -> `published`). The one
 * composite is containment: an admin may quarantine a yanked release, which
 * applies `yanked` -> `published` -> `quarantined` in one atomic batch with
 * one audit row per edge, so the release is never observable as `published`.
 * A status issuer must advance the signed `sequence` by 2 for it (the v1 rule
 * accepts a state reachable in at most the sequence gap).
 *
 * Package owners may take `draft -> published` and `published -> yanked`;
 * every other edge, the containment composite and every publisher
 * transition are admin-only.
 */
import { RELEASE_STATE_TRANSITIONS, isOpenPackageVisibility } from "@skillx/contracts";
import type { ReleaseState } from "@skillx/contracts";
import { notFound } from "./release-access";
import { releaseError } from "./release-http";
import { compareAndSet, recordAttempt } from "./release-state-cas";
import type { Attempt, CasGuard, CasOutcome, SubjectKind } from "./release-state-cas";

export const PUBLISHER_STATES = ["active", "suspended", "revoked"] as const;
export type PublisherState = (typeof PUBLISHER_STATES)[number];

/** Publisher lifecycle (admin only): suspend, reinstate a suspension, or revoke a suspended publisher for good. */
export const PUBLISHER_STATE_TRANSITIONS: Readonly<Record<PublisherState, readonly PublisherState[]>> = {
  active: ["suspended"],
  suspended: ["active", "revoked"],
  revoked: [],
};

/** Release edges a package owner may take; every other edge is admin-only. */
const OWNER_RELEASE_EDGES: ReadonlySet<string> = new Set(["draft>published", "published>yanked"]);

/** Admin-only requests applied as several v1 edges in one atomic batch, keyed `from>to`. */
const COMPOSITE_RELEASE_PATHS: Readonly<Record<string, readonly ReleaseState[]>> = {
  "yanked>quarantined": ["yanked", "published", "quarantined"],
};

/**
 * `admin` is the shared `ADMIN_SECRET` (no individual identity); `user` is a session or account API key;
 * `publisher_key` is a `releases:publish:@handle` credential (scoped key id, or `oidc:<jti>`), accepted
 * only by channel promotion.
 */
export type TransitionActor = { kind: "admin"; id: "admin" } | { kind: "user"; id: string } | { kind: "publisher_key"; id: string };

export interface TransitionInput<S extends string> {
  from: S;
  to: S;
  reason: string | null;
  actor: TransitionActor;
  now: Date;
}

export interface ReleaseTransitionResult {
  identity: string;
  version: string;
  releaseDigest: string | null;
  from: ReleaseState;
  to: ReleaseState;
  changedAt: string;
}

export interface PublisherTransitionResult {
  handle: string;
  from: PublisherState;
  to: PublisherState;
  changedAt: string;
}

/** The timestamp a release state records on entry (`published_at` keeps the first publication). */
const RELEASE_ENTRY_TIMESTAMP: Partial<Record<ReleaseState, string>> = {
  published: ", published_at = COALESCE(published_at, ?)",
  yanked: ", yanked_at = ?",
  quarantined: ", quarantined_at = ?",
};

/** Re-checked inside the batch for owners, so a suspension or package delete landing after the pre-check still refuses the change. */
const ACTIVE_PUBLISHER_GUARD = `EXISTS (SELECT 1 FROM package_releases gr JOIN packages gp ON gp.id = gr.package_id
  JOIN publishers gpub ON gpub.id = gp.publisher_id WHERE gr.id = ? AND gpub.state = 'active' AND gp.deleted_at IS NULL)`;

const publisherInactive = () => releaseError(403, "publisher_revoked", "the publisher of this package is suspended or revoked");

function failedChange(kind: SubjectKind, from: string, outcome: Exclude<CasOutcome, "applied">): never {
  if (outcome === "denied") throw publisherInactive();
  throw releaseError(409, "state_conflict", `the ${kind} is no longer ${from}; read its current state and retry`);
}

async function invalidTransition(db: D1Database, attempt: Attempt): Promise<never> {
  await recordAttempt(db, attempt, "invalid");
  throw releaseError(422, "transition.invalid", `a ${attempt.kind} cannot move from ${attempt.input.from} to ${attempt.input.to}`);
}

async function denied(db: D1Database, attempt: Attempt, error: Error): Promise<never> {
  await recordAttempt(db, attempt, "denied");
  throw error;
}

interface ReleaseSubject {
  id: string;
  release_digest: string | null;
  signed_manifest_key: string | null;
  visibility: string;
  owner_user_id: string | null;
  publisher_state: string;
}

/** Changes the state of `identity@version`. */
export async function transitionRelease(
  db: D1Database,
  identity: string,
  version: string,
  input: TransitionInput<ReleaseState>,
): Promise<ReleaseTransitionResult> {
  const subject = await db
    .prepare(
      `SELECT r.id, r.release_digest, r.signed_manifest_key, p.visibility, pub.owner_user_id, pub.state AS publisher_state
         FROM package_releases r
         JOIN packages p ON p.id = r.package_id
         JOIN publishers pub ON pub.id = p.publisher_id
        WHERE p.name = ? AND r.version = ? AND p.deleted_at IS NULL`,
    )
    .bind(identity, version)
    .first<ReleaseSubject>();
  // A deleted package's releases do not exist here, for the admin too.
  if (subject === null) throw notFound();
  const attempt: Attempt = { kind: "release", subjectId: subject.id, input };
  const { from, to, actor } = input;
  const edge = `${from}>${to}`;
  const composite = COMPOSITE_RELEASE_PATHS[edge];

  // Authorization first: ownership, then the publisher's standing, then the graph.
  if (actor.kind !== "admin") {
    if (subject.owner_user_id === null || subject.owner_user_id !== actor.id) {
      // A private package stays indistinguishable from an unknown one; public and unlisted ones are readable anyway.
      await denied(db, attempt, isOpenPackageVisibility(subject.visibility) ? releaseError(403, "transition.not_owner", `only the owner of ${identity} or an admin may change its state`) : notFound());
    }
    if (subject.publisher_state !== "active") await denied(db, attempt, publisherInactive());
  }
  if (from === to || (composite === undefined && !RELEASE_STATE_TRANSITIONS[from].includes(to))) await invalidTransition(db, attempt);
  if (actor.kind !== "admin" && !OWNER_RELEASE_EDGES.has(edge)) {
    await denied(db, attempt, releaseError(403, "transition.admin_only", `only an admin may move a release from ${from} to ${to}`));
  }
  if (to === "published" && (subject.release_digest === null || subject.signed_manifest_key === null)) {
    await recordAttempt(db, attempt, "invalid");
    throw releaseError(422, "release.incomplete", "a release without a tree digest and signed manifest cannot be published");
  }

  const timestamp = RELEASE_ENTRY_TIMESTAMP[to];
  const guard: CasGuard | undefined = actor.kind === "admin" ? undefined : { sql: ACTIVE_PUBLISHER_GUARD, binds: [subject.id] };
  const outcome = await compareAndSet(db, attempt, {
    path: composite,
    extraSet: timestamp,
    extraBinds: timestamp === undefined ? [] : [input.now.getTime()],
    guard,
  });
  if (outcome !== "applied") failedChange("release", from, outcome);
  return { identity, version, releaseDigest: subject.release_digest, from, to, changedAt: input.now.toISOString() };
}

/** Changes the state of publisher `handle` (admin only). */
export async function transitionPublisher(
  db: D1Database,
  handle: string,
  input: TransitionInput<PublisherState>,
): Promise<PublisherTransitionResult> {
  const subject = await db.prepare("SELECT id FROM publishers WHERE handle = ?").bind(handle).first<{ id: string }>();
  if (subject === null) throw notFound();
  const attempt: Attempt = { kind: "publisher", subjectId: subject.id, input };
  const { from, to } = input;
  if (input.actor.kind !== "admin") {
    await denied(db, attempt, releaseError(403, "transition.admin_only", "only an admin may change a publisher's state"));
  }
  if (!PUBLISHER_STATE_TRANSITIONS[from].includes(to)) await invalidTransition(db, attempt);
  const outcome = await compareAndSet(db, attempt);
  if (outcome !== "applied") failedChange("publisher", from, outcome);
  return { handle, from, to, changedAt: input.now.toISOString() };
}
