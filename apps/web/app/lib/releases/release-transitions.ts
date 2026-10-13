/**
 * Release and publisher state transitions. Every transition is a
 * compare-and-set: the caller names the state it expects (`from`), and the
 * change applies only while the row is still in it; otherwise `409
 * state_conflict`. Every attempt by an authenticated actor on an existing
 * subject leaves one append-only `release_state_audit` row (`applied`,
 * `stale`, `denied` or `invalid`), written in the same D1 batch as the change
 * itself, so the audit and the state never disagree. Nothing is deleted.
 *
 * Only `release_state`/`publishers.state` and the matching `*_at` timestamp
 * change. Bytes, digests, keys and manifests are never touched, so a yanked or
 * quarantined release keeps its digest under its version.
 *
 * Release edges are exactly the `skillx.release-status/v1` graph
 * (`RELEASE_STATE_TRANSITIONS`, repeats excluded), so every state history this
 * API creates can later be issued as signed statuses. Lifting a quarantine is
 * therefore two steps (`quarantined` -> `yanked` -> `published`). Package
 * owners may take `draft -> published` and `published -> yanked`; every other
 * edge, and every publisher transition, is admin-only.
 */
import { RELEASE_STATE_TRANSITIONS } from "@skillx/contracts";
import type { ReleaseState } from "@skillx/contracts";
import { notFound } from "./release-access";
import { releaseError } from "./release-http";

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

/** `admin` is the shared `ADMIN_SECRET` (no individual identity); `user` is a session or account API key. */
export type TransitionActor = { kind: "admin"; id: "admin" } | { kind: "user"; id: string };

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

type SubjectKind = "release" | "publisher";
type AttemptOutcome = "denied" | "invalid";

interface Attempt {
  kind: SubjectKind;
  subjectId: string;
  input: TransitionInput<string>;
}

/** Fixed table and column of each subject kind; never built from input. */
const TARGETS = {
  release: { table: "package_releases", column: "release_state" },
  publisher: { table: "publishers", column: "state" },
} as const;

/** The timestamp a release state records on entry (`published_at` keeps the first publication). */
const RELEASE_ENTRY_TIMESTAMP: Partial<Record<ReleaseState, string>> = {
  published: ", published_at = COALESCE(published_at, ?)",
  yanked: ", yanked_at = ?",
  quarantined: ", quarantined_at = ?",
};

const AUDIT_COLUMNS = "id, subject_kind, subject_id, actor_kind, actor_id, from_state, to_state, outcome, reason, created_at";

function auditValues({ kind, subjectId, input }: Attempt): unknown[] {
  return [kind, subjectId, input.actor.kind, input.actor.id, input.from, input.to];
}

/** Records an attempt that never reached the compare-and-set. */
async function recordAttempt(db: D1Database, attempt: Attempt, outcome: AttemptOutcome): Promise<void> {
  await db
    .prepare(`INSERT INTO release_state_audit (${AUDIT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(`rsa_${crypto.randomUUID()}`, ...auditValues(attempt), outcome, attempt.input.reason, attempt.input.now.getTime())
    .run();
}

/**
 * One atomic batch: the audit row decides `applied` or `stale` from the
 * current state, and the update applies only when that row says `applied`.
 * D1 runs a batch as one transaction, so no other write lands in between.
 */
async function compareAndSet(db: D1Database, attempt: Attempt, extraSet = "", extraBinds: unknown[] = []): Promise<boolean> {
  const { table, column } = TARGETS[attempt.kind];
  const auditId = `rsa_${crypto.randomUUID()}`;
  const { input, subjectId } = attempt;
  const record = db
    .prepare(
      `INSERT INTO release_state_audit (${AUDIT_COLUMNS})
       SELECT ?, ?, ?, ?, ?, ?, ?,
              CASE WHEN EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND ${column} = ?) THEN 'applied' ELSE 'stale' END, ?, ?`,
    )
    .bind(auditId, ...auditValues(attempt), subjectId, input.from, input.reason, input.now.getTime());
  const update = db
    .prepare(
      `UPDATE ${table} SET ${column} = ?${extraSet}
        WHERE id = ? AND ${column} = ?
          AND EXISTS (SELECT 1 FROM release_state_audit WHERE id = ? AND outcome = 'applied')`,
    )
    .bind(input.to, ...extraBinds, subjectId, input.from, auditId);
  const results = await db.batch([record, update]);
  return (results[1]?.meta.changes ?? 0) === 1;
}

function staleState(kind: SubjectKind, from: string): never {
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
        WHERE p.name = ? AND r.version = ?`,
    )
    .bind(identity, version)
    .first<ReleaseSubject>();
  if (subject === null) throw notFound();
  const attempt: Attempt = { kind: "release", subjectId: subject.id, input };
  const { from, to, actor } = input;

  if (actor.kind !== "admin") {
    if (subject.owner_user_id === null || subject.owner_user_id !== actor.id) {
      // A private package stays indistinguishable from an unknown one.
      await denied(db, attempt, subject.visibility === "public" ? releaseError(403, "transition.not_owner", `only the owner of ${identity} or an admin may change its state`) : notFound());
    }
  }
  if (from === to || !RELEASE_STATE_TRANSITIONS[from].includes(to)) await invalidTransition(db, attempt);
  if (actor.kind !== "admin") {
    if (subject.publisher_state !== "active") {
      await denied(db, attempt, releaseError(403, "publisher_revoked", "the publisher of this package is suspended or revoked"));
    }
    if (!OWNER_RELEASE_EDGES.has(`${from}>${to}`)) {
      await denied(db, attempt, releaseError(403, "transition.admin_only", `only an admin may move a release from ${from} to ${to}`));
    }
  }
  if (to === "published" && (subject.release_digest === null || subject.signed_manifest_key === null)) {
    await recordAttempt(db, attempt, "invalid");
    throw releaseError(422, "release.incomplete", "a release without a tree digest and signed manifest cannot be published");
  }

  const timestamp = RELEASE_ENTRY_TIMESTAMP[to];
  const applied = await compareAndSet(db, attempt, timestamp ?? "", timestamp === undefined ? [] : [input.now.getTime()]);
  if (!applied) staleState("release", from);
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
  if (!(await compareAndSet(db, attempt))) staleState("publisher", from);
  return { handle, from, to, changedAt: input.now.toISOString() };
}
