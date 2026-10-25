/**
 * D1 access of the private library: one keyset-paginated listing of the
 * packages the caller owns (through the publisher) or holds an unrevoked
 * entitlement for, plus, when personal kits are served, the caller's kits.
 *
 * Every row is decided by the caller id bound once in the `me` CTE, so no
 * other account's asset can reach the result. The latest release of a skill
 * follows the read gate: published only, not in a tree quarantined anywhere,
 * and, for an entitled caller, covered by the entitlement. A release-scoped
 * entitlement therefore never shows other releases of the package.
 *
 * Order is `(name, kind)`: stable while assets are added or removed, because a
 * cursor names a position in that order rather than an offset.
 */
import type { LibraryItem, LibraryKind } from "@skillx/contracts";

export interface LibraryQuery {
  userId: string;
  kind: LibraryKind | null;
  /** Lowercased name fragment; null for no filter. */
  q: string | null;
  after: { name: string; kind: LibraryKind } | null;
  /** Rows to return; one more is read to know whether a next page exists. */
  limit: number;
  includeKits: boolean;
}

interface Row {
  name: string;
  kind: LibraryKind;
  relation: "owner" | "entitled";
  visibility: string;
  package_kind: string | null;
  publisher_state: string;
  version: string | null;
  release_digest: string | null;
  rev_id: string | null;
  rev_number: number | null;
  rev_digest: string | null;
  rev_state: string | null;
  generation: number | null;
  latest_revision_number: number | null;
}

const OWNED = `(pub.owner_user_id IS NOT NULL AND pub.owner_user_id <> '' AND pub.owner_user_id = me.uid)`;

const SKILLS = `
  SELECT p.name AS name, 'skill' AS kind,
         CASE WHEN ${OWNED} THEN 'owner' ELSE 'entitled' END AS relation,
         p.visibility AS visibility, p.kind AS package_kind, pub.state AS publisher_state,
         r.version AS version, r.release_digest AS release_digest,
         NULL AS rev_id, NULL AS rev_number, NULL AS rev_digest, NULL AS rev_state,
         NULL AS generation, NULL AS latest_revision_number
    FROM me, packages p
    JOIN publishers pub ON pub.id = p.publisher_id
    LEFT JOIN package_releases r ON r.id = (
      SELECT x.id FROM package_releases x
       WHERE x.package_id = p.id AND x.release_state = 'published'
         AND x.release_digest IS NOT NULL AND x.signed_manifest_key IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM package_releases q WHERE q.release_digest = x.release_digest AND q.release_state = 'quarantined')
         AND (${OWNED} OR EXISTS (SELECT 1 FROM entitlements e
                                   WHERE e.subject_id = me.uid AND e.package_id = p.id AND e.revoked_at IS NULL
                                     AND (e.release_id IS NULL OR e.release_id = x.id)))
       ORDER BY x.created_at DESC, x.id DESC LIMIT 1)
   WHERE ${OWNED}
      OR EXISTS (SELECT 1 FROM entitlements e WHERE e.subject_id = me.uid AND e.package_id = p.id AND e.revoked_at IS NULL)`;

const KITS = `
  SELECT k.name AS name, 'kit' AS kind, 'owner' AS relation, k.visibility AS visibility,
         NULL AS package_kind, pub.state AS publisher_state, NULL AS version, NULL AS release_digest,
         v.id AS rev_id, v.revision_number AS rev_number, v.revision_digest AS rev_digest, v.state AS rev_state,
         k.generation AS generation, k.latest_revision_number AS latest_revision_number
    FROM me, personal_kits k
    JOIN publishers pub ON pub.id = k.publisher_id
    LEFT JOIN personal_kit_revisions v ON v.id = k.effective_revision_id
   WHERE k.owner_user_id = me.uid`;

export async function queryLibrary(db: D1Database, query: LibraryQuery): Promise<{ items: LibraryItem[]; hasMore: boolean }> {
  const sql = `
    WITH me AS (SELECT ? AS uid, ? AS q, ? AS kind, ? AS after_name, ? AS after_kind)
    SELECT u.* FROM (${SKILLS}${query.includeKits ? `\n UNION ALL ${KITS}` : ""}) u, me
     WHERE (me.q IS NULL OR u.name LIKE me.q ESCAPE '\\')
       AND (me.kind IS NULL OR u.kind = me.kind)
       AND (me.after_name IS NULL OR (u.name, u.kind) > (me.after_name, me.after_kind))
     ORDER BY u.name, u.kind
     LIMIT ?`;
  const { results } = await db
    .prepare(sql)
    .bind(
      query.userId,
      query.q === null ? null : `%${query.q.replace(/[\\%_]/g, "\\$&")}%`,
      query.kind,
      query.after?.name ?? null,
      query.after?.kind ?? null,
      query.limit + 1,
    )
    .all<Row>();
  return { items: results.slice(0, query.limit).map(toItem), hasMore: results.length > query.limit };
}

function toItem(row: Row): LibraryItem {
  const suspended = row.publisher_state !== "active";
  if (row.kind === "kit") {
    const effective = row.rev_id === null ? null : { id: row.rev_id, number: Number(row.rev_number), digest: row.rev_digest! };
    const state = suspended ? "publisher_suspended" : effective === null ? "no_active_revision" : row.rev_state === "quarantined" ? "quarantined" : "active";
    return {
      kind: "kit",
      identity: row.name,
      relation: row.relation,
      visibility: row.visibility,
      state,
      effectiveRevision: effective,
      generation: Number(row.generation),
      latestRevisionNumber: Number(row.latest_revision_number),
      installRef: state === "active" ? `kit:${row.name}#${effective!.id}` : null,
    };
  }
  const latest = suspended || row.version === null ? null : { version: row.version, releaseDigest: row.release_digest! };
  return {
    kind: "skill",
    identity: row.name,
    relation: row.relation,
    visibility: row.visibility,
    packageKind: row.package_kind ?? "skill",
    state: suspended ? "publisher_suspended" : latest === null ? "no_release" : "published",
    latest,
    installRef: latest === null ? null : `${row.name}@${latest.version}`,
  };
}
