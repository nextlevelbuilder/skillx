/**
 * Audited owner management writes (visibility, delete, restore) of packages
 * and personal kits, and the shared soft-delete lifecycle.
 *
 * Every applied change writes one append-only `package_audit` row in the same
 * D1 batch as the change. Both statements carry the same compare-and-set
 * guard and run in one transaction, so the audit row exists exactly when the
 * change applied: a lost race writes neither.
 *
 * Soft delete sets `deleted_at`; the subject then does not exist for any read
 * path. Restore clears it within `RESTORE_WINDOW_MS`; after that the answer is
 * `410 restore_window_expired` and the tombstone stays for good (no hard purge,
 * the name is never reused).
 */
import { releaseError } from "~/lib/releases/release-http";
import type { RequestActor } from "~/lib/releases/release-state-http";

/** How long a deleted package or kit may be restored. */
export const RESTORE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export const restoreDeadline = (deletedAt: number) => deletedAt + RESTORE_WINDOW_MS;

export type AuditSubjectKind = "package" | "kit";
export type AuditAction = "visibility" | "delete" | "restore";

export interface AuditEntry {
  subjectKind: AuditSubjectKind;
  subjectId: string;
  subjectName: string;
  actor: RequestActor;
  action: AuditAction;
  from: string | null;
  to: string | null;
  at: number;
}

/** A SQL condition with its binds. */
export interface Guarded {
  sql: string;
  binds: unknown[];
}

/**
 * Applies `update` and its audit row atomically under `guard`. Returns false
 * (nothing written) when the guard no longer holds.
 */
export async function applyAudited(db: D1Database, entry: AuditEntry, guard: Guarded, update: Guarded): Promise<boolean> {
  const audit = db
    .prepare(
      `INSERT INTO package_audit (id, subject_kind, subject_id, subject_name, actor_kind, actor_id, action, from_value, to_value, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard.sql}`,
    )
    .bind(
      `pau_${crypto.randomUUID()}`,
      entry.subjectKind,
      entry.subjectId,
      entry.subjectName,
      entry.actor.kind,
      entry.actor.id,
      entry.action,
      entry.from,
      entry.to,
      entry.at,
      ...guard.binds,
    );
  const results = await db.batch([audit, db.prepare(update.sql).bind(...update.binds)]);
  return Number(results[1]?.meta.changes ?? 0) === 1;
}

/** A package or kit row as the lifecycle sees it. */
export interface LifecycleSubject {
  kind: AuditSubjectKind;
  table: "packages" | "personal_kits";
  id: string;
  name: string;
  deletedAt: number | null;
  /** Extra `, column = ...` assignments written with every lifecycle change (a kit bumps its generation). */
  extraSet?: string;
}

const lifecycleConflict = (s: LifecycleSubject) =>
  releaseError(409, `${s.kind}.state_conflict`, `the ${s.kind} changed while the request ran; reload it and retry`);

/** Soft-deletes the subject; 409 `<kind>.deleted` when it already is. */
export async function softDelete(db: D1Database, s: LifecycleSubject, actor: RequestActor, now: Date): Promise<{ deletedAt: number; restoreDeadline: number }> {
  if (s.deletedAt !== null) throw releaseError(409, `${s.kind}.deleted`, `${s.name} is already deleted`);
  const at = now.getTime();
  const ok = await applyAudited(
    db,
    { subjectKind: s.kind, subjectId: s.id, subjectName: s.name, actor, action: "delete", from: "live", to: "deleted", at },
    { sql: `EXISTS (SELECT 1 FROM ${s.table} WHERE id = ? AND deleted_at IS NULL)`, binds: [s.id] },
    { sql: `UPDATE ${s.table} SET deleted_at = ?, updated_at = ?${s.extraSet ?? ""} WHERE id = ? AND deleted_at IS NULL`, binds: [at, at, s.id] },
  );
  if (!ok) throw lifecycleConflict(s);
  return { deletedAt: at, restoreDeadline: restoreDeadline(at) };
}

/** Restores a deleted subject within the window; 409 when not deleted, 410 after the window. */
export async function restoreDeleted(db: D1Database, s: LifecycleSubject, actor: RequestActor, now: Date): Promise<{ restoredAt: number }> {
  if (s.deletedAt === null) throw releaseError(409, `${s.kind}.not_deleted`, `${s.name} is not deleted`);
  const at = now.getTime();
  if (at > restoreDeadline(s.deletedAt)) {
    throw releaseError(410, "restore_window_expired", `${s.name} was deleted more than 30 days ago and can no longer be restored; the name stays reserved`);
  }
  const ok = await applyAudited(
    db,
    { subjectKind: s.kind, subjectId: s.id, subjectName: s.name, actor, action: "restore", from: "deleted", to: "live", at },
    { sql: `EXISTS (SELECT 1 FROM ${s.table} WHERE id = ? AND deleted_at = ?)`, binds: [s.id, s.deletedAt] },
    { sql: `UPDATE ${s.table} SET deleted_at = NULL, updated_at = ?${s.extraSet ?? ""} WHERE id = ? AND deleted_at = ?`, binds: [at, s.id, s.deletedAt] },
  );
  if (!ok) throw lifecycleConflict(s);
  return { restoredAt: at };
}
