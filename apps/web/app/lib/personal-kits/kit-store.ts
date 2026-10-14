/**
 * D1 access of personal kits. Reads are plain queries; every mutation goes
 * through `commitKitMutation`: one D1 batch whose statements all carry the
 * same generation guard and whose kit update runs last, so a request with a
 * stale `expectedGeneration` writes nothing (not even audit), and two
 * concurrent writers of one generation cannot both succeed.
 */
import type { PersonalKitDocument } from "@skillx/contracts";
import { releaseError } from "~/lib/releases/release-http";
import { kitNotFound } from "./kit-http";

export interface KitRow {
  id: string;
  name: string;
  publisher_id: string;
  owner_user_id: string;
  local_id: string | null;
  visibility: string;
  generation: number;
  effective_revision_id: string | null;
  latest_revision_number: number;
  created_at: number;
  updated_at: number;
}

export interface RevisionRow {
  id: string;
  kit_id: string;
  revision_number: number;
  parent_revision_id: string | null;
  revision_digest: string;
  document_json: string;
  state: string;
  origin: string;
  author_user_id: string;
  idempotency_key: string;
  approval_json: string | null;
  created_at: number;
  reviewed_at: number | null;
  activated_at: number | null;
  rejected_at: number | null;
  quarantined_at: number | null;
}

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

export async function findKit(db: D1Database, name: string): Promise<KitRow | null> {
  return db.prepare("SELECT * FROM personal_kits WHERE name = ?").bind(name).first<KitRow>();
}

/** The kit of its owner; anyone else (and an unknown kit) gets the same 404. */
export async function ownedKit(db: D1Database, name: string, userId: string): Promise<KitRow> {
  const kit = await findKit(db, name);
  if (kit === null || kit.owner_user_id !== userId) throw kitNotFound();
  return kit;
}

/** The active publisher of `handle` owned by `userId`, or null. */
export async function ownedPublisher(db: D1Database, handle: string, userId: string): Promise<string | null> {
  const row = await db
    .prepare("SELECT id FROM publishers WHERE handle = ? AND owner_user_id = ? AND state = 'active'")
    .bind(handle, userId)
    .first<{ id: string }>();
  return row?.id ?? null;
}

/**
 * The owner's kit for a write: its publisher must still be active and owned
 * by the caller (checked on every write, not only on create). Transferring a
 * kit to another owner is not supported.
 */
export async function writableKit(db: D1Database, name: string, userId: string): Promise<KitRow> {
  const kit = await ownedKit(db, name, userId);
  await requireActivePublisher(db, kit, userId);
  return kit;
}

export async function requireActivePublisher(db: D1Database, kit: KitRow, userId: string): Promise<void> {
  const row = await db
    .prepare("SELECT 1 AS ok FROM publishers WHERE id = ? AND owner_user_id = ? AND state = 'active'")
    .bind(kit.publisher_id, userId)
    .first<{ ok: number }>();
  if (row === null) throw releaseError(403, "kit.publisher_not_owned", "the kit's publisher is not active or not owned by you");
}

export async function getRevision(db: D1Database, kitId: string, id: string): Promise<RevisionRow> {
  const row = await db.prepare("SELECT * FROM personal_kit_revisions WHERE kit_id = ? AND id = ?").bind(kitId, id).first<RevisionRow>();
  if (row === null) throw kitNotFound();
  return row;
}

/**
 * Refuses a revision that may not seed a new revision (proposal or rebase):
 * a rejected or quarantined one, and an unreviewed proposal, since building
 * on it would carry its content and permissions past review.
 */
export function assertSeedRevision(from: RevisionRow): void {
  if (from.state === "rejected" || from.state === "quarantined") throw releaseError(409, "kit.revision_unusable", `the from revision is ${from.state}`);
  if (from.state === "proposed" || (from.origin === "session-derived" && from.state !== "reviewed")) {
    throw releaseError(409, "kit.review_required", "the from revision is an unreviewed proposal; review it first");
  }
}

/** The live (not rejected) revision of `digest`; a rejected document may be stored again as a new revision. */
export async function revisionByDigest(db: D1Database, kitId: string, digest: string): Promise<RevisionRow | null> {
  return db
    .prepare("SELECT * FROM personal_kit_revisions WHERE kit_id = ? AND revision_digest = ? AND state <> 'rejected' ORDER BY revision_number DESC LIMIT 1")
    .bind(kitId, digest)
    .first<RevisionRow>();
}

export async function revisionByIdempotency(db: D1Database, kitId: string, key: string): Promise<RevisionRow | null> {
  return db.prepare("SELECT * FROM personal_kit_revisions WHERE kit_id = ? AND idempotency_key = ?").bind(kitId, key).first<RevisionRow>();
}

export async function listRevisions(db: D1Database, kitId: string, limit = 200): Promise<RevisionRow[]> {
  const { results } = await db
    .prepare("SELECT * FROM personal_kit_revisions WHERE kit_id = ? ORDER BY revision_number DESC LIMIT ?")
    .bind(kitId, limit)
    .all<RevisionRow>();
  return results;
}

export const documentOf = (row: RevisionRow) => JSON.parse(row.document_json) as PersonalKitDocument;

export function revisionView(row: RevisionRow, withDocument = false) {
  const at = (ms: number | null) => (ms === null ? null : new Date(Number(ms)).toISOString());
  return {
    id: row.id,
    number: Number(row.revision_number),
    digest: row.revision_digest,
    parentRevisionId: row.parent_revision_id,
    state: row.state,
    origin: row.origin,
    createdAt: at(row.created_at),
    reviewedAt: at(row.reviewed_at),
    activatedAt: at(row.activated_at),
    rejectedAt: at(row.rejected_at),
    quarantinedAt: at(row.quarantined_at),
    ...(withDocument ? { document: documentOf(row) } : {}),
  };
}

/** One SQL statement of a mutation; `{guard}` marks where the generation guard goes. */
export interface GuardedStatement {
  sql: string;
  binds: unknown[];
}

export interface KitMutation {
  kitId: string;
  generation: number;
  /** Statements run before the kit update, each with `{guard}` in its WHERE clause. */
  statements: GuardedStatement[];
  /** Extra `, column = ?` assignments of the kit update. */
  kitSet?: string;
  kitBinds?: unknown[];
  audit: { actorKind: string; actorId: string; action: string; revisionId: string | null; detail: string | null; at: number };
  /** Creates the kit row in the same batch (first revision of a new kit). */
  create?: { name: string; publisherId: string; ownerUserId: string; localId: string | null; visibility: string };
}

const GUARD = "EXISTS (SELECT 1 FROM personal_kits WHERE id = ? AND generation = ?)";

/** Applies a mutation atomically. Returns false when the generation is stale (nothing written). */
export async function commitKitMutation(db: D1Database, m: KitMutation): Promise<boolean> {
  const guarded = (s: GuardedStatement) => db.prepare(s.sql.replace("{guard}", GUARD)).bind(...s.binds, m.kitId, m.generation);
  const auditId = newId("pka");
  const batch: D1PreparedStatement[] = [];
  if (m.create !== undefined) {
    const c = m.create;
    batch.push(
      db
        .prepare(
          `INSERT INTO personal_kits (id, name, publisher_id, owner_user_id, local_id, visibility, generation, latest_revision_number, created_at, updated_at)
           SELECT ?, ?, ?, ?, ?, ?, 0, 0, ?, ? WHERE NOT EXISTS (SELECT 1 FROM personal_kits WHERE name = ?)`,
        )
        .bind(m.kitId, c.name, c.publisherId, c.ownerUserId, c.localId, c.visibility, m.audit.at, m.audit.at, c.name),
    );
  }
  batch.push(...m.statements.map(guarded));
  batch.push(
    guarded({
      sql: `INSERT INTO personal_kit_audit (id, kit_id, actor_kind, actor_id, action, revision_id, detail, created_at)
            SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE {guard}`,
      binds: [auditId, m.kitId, m.audit.actorKind, m.audit.actorId, m.audit.action, m.audit.revisionId, m.audit.detail, m.audit.at],
    }),
  );
  batch.push(
    db
      .prepare(`UPDATE personal_kits SET generation = generation + 1, updated_at = ?${m.kitSet ?? ""} WHERE id = ? AND generation = ?`)
      .bind(m.audit.at, ...(m.kitBinds ?? []), m.kitId, m.generation),
  );
  await db.batch(batch);
  const row = await db.prepare("SELECT 1 AS ok FROM personal_kit_audit WHERE id = ?").bind(auditId).first<{ ok: number }>();
  return row !== null;
}
