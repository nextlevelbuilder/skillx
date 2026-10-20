/**
 * The audited compare-and-set behind every state transition. Each attempt
 * leaves `release_state_audit` rows written in the same D1 batch as the
 * change itself, so the audit and the state never disagree. D1 runs a batch
 * as one transaction, so no other write lands between the rows and the
 * update, and no reader ever sees a state between `from` and `to`.
 */
import type { TransitionInput } from "./release-transitions";

export type SubjectKind = "release" | "publisher" | "release_channel";
export type AttemptOutcome = "denied" | "invalid";
export type CasOutcome = "applied" | "stale" | "denied";

export interface Attempt {
  kind: SubjectKind;
  subjectId: string;
  input: TransitionInput<string>;
}

/** A SQL condition that must hold when the batch runs; an attempt that fails it is `denied`. */
export interface CasGuard {
  sql: string;
  binds: unknown[];
}

export interface CasPlan {
  /** States from `input.from` to `input.to`; one `applied` row per edge. Defaults to the single requested edge. */
  path?: readonly string[];
  /** Extra `, column = ?` assignments of the update and their values. */
  extraSet?: string;
  extraBinds?: unknown[];
  guard?: CasGuard;
  /**
   * Extra `INSERT ... SELECT ...` statements of the same batch that must apply
   * only with the change: each runs after the update, with `WHERE <applied>`
   * appended (so its SQL must end in a `SELECT` without a `WHERE` clause).
   */
  alsoInsert?: CasGuard[];
}

/** Fixed table and column of each subject kind; never built from input. */
const TARGETS = {
  release: { table: "package_releases", column: "release_state" },
  publisher: { table: "publishers", column: "state" },
  release_channel: { table: "package_releases", column: "channel" },
} as const;

export const AUDIT_COLUMNS = "id, subject_kind, subject_id, actor_kind, actor_id, from_state, to_state, outcome, reason, created_at";
const auditId = () => `rsa_${crypto.randomUUID()}`;

/** Records an attempt that never reached the compare-and-set. */
export async function recordAttempt(db: D1Database, attempt: Attempt, outcome: AttemptOutcome): Promise<void> {
  const { kind, subjectId, input } = attempt;
  await db
    .prepare(`INSERT INTO release_state_audit (${AUDIT_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(auditId(), kind, subjectId, input.actor.kind, input.actor.id, input.from, input.to, outcome, input.reason, input.now.getTime())
    .run();
}

/**
 * One atomic batch. Every insert decides from the same snapshot (the update
 * runs last): when the subject is still in `from` and the guard holds, one
 * `applied` row per edge of the path is written and the update moves the
 * subject straight to `to`; otherwise a single `stale` (or, when the guard
 * fails, `denied`) row of the requested edge is written and nothing changes.
 */
export async function compareAndSet(db: D1Database, attempt: Attempt, plan: CasPlan = {}): Promise<CasOutcome> {
  const { table, column } = TARGETS[attempt.kind];
  const { kind, subjectId, input } = attempt;
  const path = plan.path ?? [input.from, input.to];
  if (path.length < 2 || path[0] !== input.from || path[path.length - 1] !== input.to) {
    throw new Error("compare-and-set path must run from the requested state to the target state");
  }
  const guard = plan.guard ?? { sql: "1", binds: [] };
  const current = `EXISTS (SELECT 1 FROM ${table} WHERE id = ? AND ${column} = ?)`;
  const currentBinds = [subjectId, input.from];
  const actor = [input.actor.kind, input.actor.id];
  const at = input.now.getTime();

  const requestRowId = auditId();
  const refused = db
    .prepare(
      `INSERT INTO release_state_audit (${AUDIT_COLUMNS})
       SELECT ?, ?, ?, ?, ?, ?, ?, CASE WHEN (${guard.sql}) THEN 'stale' ELSE 'denied' END, ?, ?
        WHERE NOT ((${guard.sql}) AND ${current})`,
    )
    .bind(requestRowId, kind, subjectId, ...actor, input.from, input.to, ...guard.binds, input.reason, at, ...guard.binds, ...currentBinds);
  const edgeIds = path.slice(1).map(() => auditId());
  const edges = edgeIds.map((id, i) =>
    db
      .prepare(
        `INSERT INTO release_state_audit (${AUDIT_COLUMNS})
         SELECT ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?
          WHERE (${guard.sql}) AND ${current}`,
      )
      .bind(id, kind, subjectId, ...actor, path[i], path[i + 1], input.reason, at, ...guard.binds, ...currentBinds),
  );
  const update = db
    .prepare(
      `UPDATE ${table} SET ${column} = ?${plan.extraSet ?? ""}
        WHERE id = ? AND ${column} = ?
          AND (SELECT count(*) FROM release_state_audit WHERE id IN (${edgeIds.map(() => "?").join(", ")}) AND outcome = 'applied') = ?`,
    )
    .bind(input.to, ...(plan.extraBinds ?? []), subjectId, input.from, ...edgeIds, edgeIds.length);
  const applied = `(SELECT count(*) FROM release_state_audit WHERE id IN (${edgeIds.map(() => "?").join(", ")}) AND outcome = 'applied') = ?`;
  const also = (plan.alsoInsert ?? []).map((insert) => db.prepare(`${insert.sql} WHERE ${applied}`).bind(...insert.binds, ...edgeIds, edgeIds.length));
  await db.batch([refused, ...edges, update, ...also]);
  // Decide from the audit rows, not `meta.changes`: the batch is one transaction, so a
  // missing refused row means every edge row and the update were applied together.
  const row = await db.prepare("SELECT outcome FROM release_state_audit WHERE id = ?").bind(requestRowId).first<{ outcome: string }>();
  if (!row) return "applied";
  return row.outcome === "denied" ? "denied" : "stale";
}
