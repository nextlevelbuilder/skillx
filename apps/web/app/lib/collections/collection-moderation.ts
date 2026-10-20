/**
 * Operator moderation of collections (`/api/v1/collections/:id/moderation`,
 * admin secret only). `POST {from, to, reason?}` moves `moderation_state`
 * between `active` and `hidden` through the audited compare-and-set of
 * release states (`release_state_audit`, subject kind `collection`). A
 * `hidden` collection reads as 404 to everyone but its owner, whatever its
 * visibility, and its owner can neither clone nor delete it. `GET` answers the
 * state, the latest revision (operators read no other route) and the history.
 */
import { releaseError } from "~/lib/releases/release-http";
import { compareAndSet } from "~/lib/releases/release-state-cas";
import { readStateChange } from "~/lib/releases/release-state-http";
import { collectionNotFound, json } from "./collection-http";
import type { CollectionCaller } from "./collection-http";
import { findRevision } from "./collection-store";
import { collectionView, revisionView } from "./collection-views";
import type { CollectionRow } from "./collection-views";

export const MODERATION_STATES = ["active", "hidden"] as const;
export type ModerationState = (typeof MODERATION_STATES)[number];

const isModerationState = (value: unknown): value is ModerationState => (MODERATION_STATES as readonly unknown[]).includes(value);

interface AuditRow {
  from_state: string;
  to_state: string;
  outcome: string;
  reason: string | null;
  created_at: number;
}

async function anyCollection(c: CollectionCaller, id: string): Promise<CollectionRow> {
  const row = await c.env.DB.prepare("SELECT * FROM collections WHERE id = ?").bind(id).first<CollectionRow>();
  if (row === null) throw collectionNotFound();
  return row;
}

/** `GET .../moderation`: the collection as its owner sees it, its latest revision, and the newest 100 moderation attempts. */
export async function readModeration(c: CollectionCaller, id: string): Promise<Response> {
  const row = await anyCollection(c, id);
  const history = await c.env.DB.prepare(
    "SELECT from_state, to_state, outcome, reason, created_at FROM release_state_audit WHERE subject_kind = 'collection' AND subject_id = ? ORDER BY created_at DESC, rowid DESC LIMIT 100",
  )
    .bind(id)
    .all<AuditRow>();
  return json({
    collection: collectionView(row, row.owner_id),
    revision: revisionView(await findRevision(c, id, row.latest_revision_number)),
    history: history.results.map((h) => ({ from: h.from_state, to: h.to_state, outcome: h.outcome, reason: h.reason, at: new Date(h.created_at).toISOString() })),
  });
}

/** `POST .../moderation` with `{from, to, reason?}`; a stale `from` is audited and answers 409 `collection.moderation_conflict`. */
export async function moderateCollection(c: CollectionCaller, id: string): Promise<Response> {
  await anyCollection(c, id);
  const change = await readStateChange(c.request, isModerationState, MODERATION_STATES);
  if (change.from === change.to) throw releaseError(400, "invalid_request", "from and to must differ");
  const outcome = await compareAndSet(
    c.env.DB,
    { kind: "collection", subjectId: id, input: { ...change, actor: { kind: "admin", id: "admin" }, now: c.now } },
    { extraSet: ", moderation_reason = ?, moderated_at = ?", extraBinds: [change.reason, c.now.getTime()] },
  );
  const row = await anyCollection(c, id);
  if (outcome !== "applied") throw releaseError(409, "collection.moderation_conflict", `the collection is ${row.moderation_state}, not ${change.from}`);
  return json({ collection: collectionView(row, row.owner_id) });
}
