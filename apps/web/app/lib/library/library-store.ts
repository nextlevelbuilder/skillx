/**
 * D1 access of the private library: one keyset-paginated listing of the
 * packages the caller owns (through the publisher) or holds an unrevoked
 * entitlement for, plus, when personal kits are served, the caller's kits.
 *
 * Every row is decided by the caller id bound once in the `me` CTE, so no
 * other account's asset can reach the result. Candidate packages come from the
 * caller's own ids (`idx_publishers_owner` and `idx_entitlements_subject`), so
 * the cost follows the size of the caller's library, never of the registry.
 *
 * The latest release of a skill follows the read gate: published only, not in
 * a tree quarantined anywhere, and readable by the caller. Every release of a
 * public or unlisted package is readable; for a private package the owner reads all of
 * them and an entitled caller reads those the entitlement covers (a
 * release-scoped entitlement never shows other releases). Among the readable
 * releases the newest is chosen by the CLI install rule (highest semver, stable
 * before prerelease), so a library `installRef` is what a bare install resolves.
 *
 * Deleted packages and kits (`deleted_at` set) are never listed.
 *
 * Order is `(name, kind)`: stable while assets are added or removed, because a
 * cursor names a position in that order rather than an offset.
 */
import { newestVersion } from "@skillx/contracts";
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
  package_id: string | null;
  package_kind: string | null;
  publisher_state: string;
  rev_id: string | null;
  rev_number: number | null;
  rev_digest: string | null;
  rev_state: string | null;
  generation: number | null;
  latest_revision_number: number | null;
}

interface Release {
  package_id: string;
  version: string;
  release_digest: string;
  created_at: number;
  id: string;
}

const OWNED = `(pub.owner_user_id IS NOT NULL AND pub.owner_user_id <> '' AND pub.owner_user_id = me.uid)`;

const SKILLS = `
  SELECT p.name AS name, 'skill' AS kind,
         CASE WHEN ${OWNED} THEN 'owner' ELSE 'entitled' END AS relation,
         p.visibility AS visibility, p.id AS package_id, p.kind AS package_kind, pub.state AS publisher_state,
         NULL AS rev_id, NULL AS rev_number, NULL AS rev_digest, NULL AS rev_state,
         NULL AS generation, NULL AS latest_revision_number
    FROM me, packages p
    JOIN publishers pub ON pub.id = p.publisher_id
   WHERE p.id IN (
           SELECT p2.id FROM publishers o JOIN packages p2 ON p2.publisher_id = o.id
            WHERE o.owner_user_id = me.uid AND o.owner_user_id <> ''
           UNION
           SELECT e.package_id FROM entitlements e WHERE e.subject_id = me.uid AND e.revoked_at IS NULL)
     AND p.deleted_at IS NULL`;

const KITS = `
  SELECT k.name AS name, 'kit' AS kind, 'owner' AS relation, k.visibility AS visibility,
         NULL AS package_id, NULL AS package_kind, pub.state AS publisher_state,
         v.id AS rev_id, v.revision_number AS rev_number, v.revision_digest AS rev_digest, v.state AS rev_state,
         k.generation AS generation, k.latest_revision_number AS latest_revision_number
    FROM me, personal_kits k
    JOIN publishers pub ON pub.id = k.publisher_id
    LEFT JOIN personal_kit_revisions v ON v.id = k.effective_revision_id
   WHERE k.owner_user_id = me.uid AND k.deleted_at IS NULL`;

/**
 * The releases of the listed packages the caller can read and install. `+x.release_state`
 * keeps the planner on `idx_package_releases_version (package_id=?)` instead of walking
 * every published release of the registry.
 */
const READABLE_RELEASES = `
  WITH me AS (SELECT ? AS uid)
  SELECT x.package_id AS package_id, x.id AS id, x.version AS version,
         x.release_digest AS release_digest, x.created_at AS created_at
    FROM me, packages p
    JOIN publishers pub ON pub.id = p.publisher_id
    JOIN package_releases x ON x.package_id = p.id
   WHERE p.id IN (SELECT value FROM json_each(?))
     AND +x.release_state = 'published'
     AND x.release_digest IS NOT NULL AND x.signed_manifest_key IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM package_releases q WHERE q.release_digest = x.release_digest AND q.release_state = 'quarantined')
     AND (p.visibility IN ('public', 'unlisted') OR ${OWNED}
          OR EXISTS (SELECT 1 FROM entitlements e
                      WHERE e.subject_id = me.uid AND e.package_id = p.id AND e.revoked_at IS NULL
                        AND (e.release_id IS NULL OR e.release_id = x.id)))`;

/** The listing statement; exported so a test can check its query plan. */
export function librarySql(includeKits: boolean): string {
  return `
    WITH me AS (SELECT ? AS uid, ? AS q, ? AS kind, ? AS after_name, ? AS after_kind)
    SELECT u.* FROM (${SKILLS}${includeKits ? `\n UNION ALL ${KITS}` : ""}) u, me
     WHERE (me.q IS NULL OR u.name LIKE me.q ESCAPE '\\')
       AND (me.kind IS NULL OR u.kind = me.kind)
       AND (me.after_name IS NULL OR (u.name, u.kind) > (me.after_name, me.after_kind))
     ORDER BY u.name, u.kind
     LIMIT ?`;
}

/** The readable-release statement; exported so a test can check its query plan. */
export const libraryReleasesSql = READABLE_RELEASES;

/** Newest readable release per package, by the CLI install rule; ties follow `listPackageReleases` (earliest id). */
function pickLatest(releases: Release[]): Map<string, Release> {
  const byPackage = new Map<string, Release[]>();
  for (const r of releases) byPackage.set(r.package_id, [...(byPackage.get(r.package_id) ?? []), r]);
  const latest = new Map<string, Release>();
  for (const [packageId, list] of byPackage) {
    const version = newestVersion(list.map((r) => r.version));
    const winner = list
      .filter((r) => r.version === version)
      .sort((a, b) => b.created_at - a.created_at || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    if (winner !== undefined) latest.set(packageId, winner);
  }
  return latest;
}

export async function queryLibrary(db: D1Database, query: LibraryQuery): Promise<{ items: LibraryItem[]; hasMore: boolean }> {
  const { results } = await db
    .prepare(librarySql(query.includeKits))
    .bind(
      query.userId,
      query.q === null ? null : `%${query.q.replace(/[\\%_]/g, "\\$&")}%`,
      query.kind,
      query.after?.name ?? null,
      query.after?.kind ?? null,
      query.limit + 1,
    )
    .all<Row>();
  const page = results.slice(0, query.limit);
  const packageIds = page.filter((r) => r.kind === "skill" && r.publisher_state === "active").map((r) => r.package_id!);
  let latest = new Map<string, Release>();
  if (packageIds.length > 0) {
    const releases = await db.prepare(READABLE_RELEASES).bind(query.userId, JSON.stringify(packageIds)).all<Release>();
    latest = pickLatest(releases.results);
  }
  return { items: page.map((row) => toItem(row, row.package_id === null ? undefined : latest.get(row.package_id))), hasMore: results.length > query.limit };
}

function toItem(row: Row, release: Release | undefined): LibraryItem {
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
  const latest = suspended || release === undefined ? null : { version: release.version, releaseDigest: release.release_digest };
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
