/**
 * D1 access of collections. A revision write is one batch: insert revision
 * `n + 1`, then move `latest_revision_number` from `n` to `n + 1`. The unique
 * `(collection_id, revision_number)` index makes two writers of the same `n`
 * collide, and the batch is atomic, so the loser writes nothing. Revisions
 * are never updated (the `collection_revisions_immutable` trigger aborts it).
 */
import { collectionRevisionDigest, sortCollectionMembers, validateCollectionContent } from "@skillx/contracts";
import type { CollectionConfig, CollectionMember } from "@skillx/contracts";
import { releaseError } from "~/lib/releases/release-http";
import { CollectionValidationError, collectionLimit, collectionNotFound } from "./collection-http";
import type { CollectionCaller } from "./collection-http";
import { isHidden } from "./collection-views";
import type { CollectionRevisionRow, CollectionRow } from "./collection-views";

export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const db = (c: CollectionCaller) => c.env.DB;

/** The collection when the caller may read it (owner, or not private and not hidden); otherwise the 404 of an unknown one. */
export async function readableCollection(c: CollectionCaller, id: string): Promise<CollectionRow> {
  const row = await db(c).prepare("SELECT * FROM collections WHERE id = ?").bind(id).first<CollectionRow>();
  if (row === null || (row.owner_id !== c.userId && (row.visibility === "private" || isHidden(row)))) throw collectionNotFound();
  return row;
}

/** The collection when the caller owns it; anyone else gets 404, even for a public one. */
export async function ownedCollection(c: CollectionCaller, id: string): Promise<CollectionRow> {
  const row = await readableCollection(c, id);
  if (row.owner_id !== c.userId) throw collectionNotFound();
  return row;
}

export async function findRevision(c: CollectionCaller, collectionId: string, number: number): Promise<CollectionRevisionRow> {
  const row = await db(c)
    .prepare("SELECT * FROM collection_revisions WHERE collection_id = ? AND revision_number = ?")
    .bind(collectionId, number)
    .first<CollectionRevisionRow>();
  if (row === null) throw collectionNotFound();
  return row;
}

export async function listRevisions(c: CollectionCaller, collectionId: string): Promise<CollectionRevisionRow[]> {
  const res = await db(c).prepare("SELECT * FROM collection_revisions WHERE collection_id = ? ORDER BY revision_number DESC LIMIT 100").bind(collectionId).all<CollectionRevisionRow>();
  return res.results;
}

/** Validated, sorted content of a new revision; 422 with the issue list otherwise. */
export async function prepareContent(members: unknown, config: unknown) {
  const result = validateCollectionContent({ members, config });
  if (!result.valid) throw new CollectionValidationError(result.issues.map((i) => ({ path: i.path, code: i.code })));
  const content = { members: sortCollectionMembers((members ?? []) as CollectionMember[]), config: (config ?? {}) as CollectionConfig };
  return { ...content, digest: await collectionRevisionDigest(content) };
}

type Content = Awaited<ReturnType<typeof prepareContent>>;

function insertRevision(c: CollectionCaller, collectionId: string, number: number, content: Content): { row: CollectionRevisionRow; statement: D1PreparedStatement } {
  const row: CollectionRevisionRow = {
    id: newId("colrev"),
    collection_id: collectionId,
    revision_number: number,
    members_json: JSON.stringify(content.members),
    config_json: JSON.stringify(content.config),
    revision_digest: content.digest,
    created_at: c.now.getTime(),
  };
  const statement = db(c)
    .prepare("INSERT INTO collection_revisions (id, collection_id, revision_number, members_json, config_json, revision_digest, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .bind(row.id, row.collection_id, row.revision_number, row.members_json, row.config_json, row.revision_digest, row.created_at);
  return { row, statement };
}

const isUniqueViolation = (error: unknown) => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);
const isForeignKeyViolation = (error: unknown) => error instanceof Error && /FOREIGN KEY constraint failed/i.test(error.message);
const limitReached = (limit: number) =>
  releaseError(409, "collection.limit_reached", `you already have ${limit} collections, the most one account may keep; delete one first`);

/**
 * Creates a collection with revision 1. A slug the owner already uses is 409
 * `collection.slug_exists`; an owner at the cap is 409 `collection.limit_reached`.
 * The cap is checked by the insert itself, so concurrent creates cannot pass it:
 * a refused collection insert leaves the revision without its parent, the
 * foreign key fails the batch, and nothing is written.
 */
export async function insertCollection(
  c: CollectionCaller,
  fields: { slug: string; name: string; visibility: string; clonedFrom: string | null },
  content: Content,
): Promise<{ collection: CollectionRow; revision: CollectionRevisionRow }> {
  const limit = collectionLimit(c.env);
  const now = c.now.getTime();
  const collection: CollectionRow = {
    id: newId("col"),
    owner_id: c.userId!,
    slug: fields.slug,
    name: fields.name,
    visibility: fields.visibility,
    latest_revision_number: 1,
    cloned_from_revision_id: fields.clonedFrom,
    created_at: now,
    updated_at: now,
  };
  const revision = insertRevision(c, collection.id, 1, content);
  try {
    await db(c).batch([
      db(c)
        .prepare(
          "INSERT INTO collections (id, owner_id, slug, name, visibility, latest_revision_number, cloned_from_revision_id, created_at, updated_at) SELECT ?, ?, ?, ?, ?, 1, ?, ?, ? WHERE (SELECT count(*) FROM collections WHERE owner_id = ?) < ?",
        )
        .bind(collection.id, collection.owner_id, collection.slug, collection.name, collection.visibility, collection.cloned_from_revision_id, now, now, collection.owner_id, limit),
      revision.statement,
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw releaseError(409, "collection.slug_exists", `you already have a collection named ${fields.slug}`);
    if (isForeignKeyViolation(error)) throw limitReached(limit);
    throw error;
  }
  return { collection, revision: revision.row };
}

/** Appends revision `expected + 1`; a stale `expected` is 409 `collection.revision_conflict`. */
export async function appendRevision(c: CollectionCaller, row: CollectionRow, expected: number, content: Content): Promise<CollectionRevisionRow> {
  const conflict = () => releaseError(409, "collection.revision_conflict", `the latest revision is ${row.latest_revision_number}, not ${expected}`);
  if (row.latest_revision_number !== expected) throw conflict();
  const next = expected + 1;
  const revision = insertRevision(c, row.id, next, content);
  try {
    await db(c).batch([
      revision.statement,
      db(c)
        .prepare("UPDATE collections SET latest_revision_number = ?, updated_at = ? WHERE id = ? AND latest_revision_number = ?")
        .bind(next, c.now.getTime(), row.id, expected),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) throw conflict();
    throw error;
  }
  return revision.row;
}

export async function updateMetadata(c: CollectionCaller, row: CollectionRow, name: string, visibility: string): Promise<CollectionRow> {
  await db(c).prepare("UPDATE collections SET name = ?, visibility = ?, updated_at = ? WHERE id = ?").bind(name, visibility, c.now.getTime(), row.id).run();
  return { ...row, name, visibility, updated_at: c.now.getTime() };
}

export async function deleteCollection(c: CollectionCaller, row: CollectionRow): Promise<void> {
  await db(c).batch([
    db(c).prepare("DELETE FROM collection_revisions WHERE collection_id = ?").bind(row.id),
    db(c).prepare("DELETE FROM collections WHERE id = ?").bind(row.id),
  ]);
}

export async function listOwned(c: CollectionCaller): Promise<CollectionRow[]> {
  const res = await db(c).prepare("SELECT * FROM collections WHERE owner_id = ? ORDER BY updated_at DESC LIMIT 200").bind(c.userId).all<CollectionRow>();
  return res.results;
}
