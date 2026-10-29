/**
 * Owner dashboard data: every package of every publisher the user owns and
 * every personal kit the user owns, deleted ones included (with their restore
 * deadline). Owner-only by construction: every query is keyed by the user id,
 * so quarantined and draft releases, which no read endpoint offers, are shown
 * here as states to their owner and to nobody else.
 *
 * Bounded: at most `DASHBOARD_PACKAGE_LIMIT` packages and `DASHBOARD_KIT_LIMIT`
 * kits (by name; `truncated` says more exist), the newest
 * `DASHBOARD_RELEASES_PER_PACKAGE` releases of each package and the newest
 * `DASHBOARD_REVISIONS_PER_KIT` revisions of each kit.
 */
import { restoreDeadline } from "./owner-audit";

export const DASHBOARD_PACKAGE_LIMIT = 200;
export const DASHBOARD_KIT_LIMIT = 200;
export const DASHBOARD_RELEASES_PER_PACKAGE = 100;
export const DASHBOARD_REVISIONS_PER_KIT = 20;

export interface DashboardRelease {
  version: string;
  channel: string;
  state: string;
  publishedAt: number | null;
  yankedAt: number | null;
  createdAt: number;
  releaseDigest: string | null;
}

export interface DashboardPackage {
  identity: string;
  kind: string;
  visibility: string;
  publisherHandle: string;
  publisherState: string;
  deletedAt: number | null;
  restoreDeadline: number | null;
  releases: DashboardRelease[];
  /** More releases exist than are listed. */
  releasesTruncated: boolean;
}

export interface DashboardRevision {
  id: string;
  number: number;
  state: string;
  createdAt: number;
}

export interface DashboardKit {
  identity: string;
  visibility: string;
  publisherState: string;
  generation: number;
  latestRevisionNumber: number;
  effectiveRevision: { id: string; number: number } | null;
  deletedAt: number | null;
  restoreDeadline: number | null;
  revisions: DashboardRevision[];
}

const num = (v: unknown) => (v === null || v === undefined ? null : Number(v));

async function rowsPerParent<T>(db: D1Database, table: string, parent: string, columns: string, order: string, ids: string[], perParent: number): Promise<T[]> {
  if (ids.length === 0) return [];
  const { results } = await db
    .prepare(
      `SELECT * FROM (SELECT ${columns}, ROW_NUMBER() OVER (PARTITION BY ${parent} ORDER BY ${order}) AS rn
                        FROM ${table} WHERE ${parent} IN (SELECT value FROM json_each(?)))
        WHERE rn <= ? ORDER BY ${parent}, rn`,
    )
    .bind(JSON.stringify(ids), perParent + 1)
    .all<T & { rn: number }>();
  return results;
}

function groupBy<T>(rows: T[], key: (row: T) => string): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) out.set(key(row), [...(out.get(key(row)) ?? []), row]);
  return out;
}
interface PackageRow {
  id: string;
  name: string;
  kind: string;
  visibility: string;
  deleted_at: number | null;
  handle: string;
  publisher_state: string;
}

interface ReleaseRow {
  package_id: string;
  version: string;
  channel: string;
  release_state: string;
  published_at: number | null;
  yanked_at: number | null;
  created_at: number;
  release_digest: string | null;
}

export async function listOwnedPackages(db: D1Database, userId: string): Promise<{ items: DashboardPackage[]; truncated: boolean }> {
  if (userId === "") return { items: [], truncated: false };
  const { results } = await db
    .prepare(
      `SELECT p.id, p.name, p.kind, p.visibility, p.deleted_at, pub.handle, pub.state AS publisher_state
         FROM publishers pub JOIN packages p ON p.publisher_id = pub.id
        WHERE pub.owner_user_id = ? AND pub.owner_user_id <> ''
        ORDER BY p.name LIMIT ?`,
    )
    .bind(userId, DASHBOARD_PACKAGE_LIMIT + 1)
    .all<PackageRow>();
  const page = results.slice(0, DASHBOARD_PACKAGE_LIMIT);
  const columns = "package_id, version, channel, release_state, published_at, yanked_at, created_at, release_digest";
  const releases = await rowsPerParent<ReleaseRow>(db, "package_releases", "package_id", columns, "created_at DESC, id", page.map((p) => p.id), DASHBOARD_RELEASES_PER_PACKAGE);
  const byPackage = groupBy(releases, (r) => r.package_id);
  const items = page.map((p): DashboardPackage => {
    const rows = byPackage.get(p.id) ?? [];
    const deletedAt = num(p.deleted_at);
    return {
      identity: p.name,
      kind: p.kind,
      visibility: p.visibility,
      publisherHandle: p.handle,
      publisherState: p.publisher_state,
      deletedAt,
      restoreDeadline: deletedAt === null ? null : restoreDeadline(deletedAt),
      releases: rows.slice(0, DASHBOARD_RELEASES_PER_PACKAGE).map((r) => ({
        version: r.version,
        channel: r.channel,
        state: r.release_state,
        publishedAt: num(r.published_at),
        yankedAt: num(r.yanked_at),
        createdAt: Number(r.created_at),
        releaseDigest: r.release_digest,
      })),
      releasesTruncated: rows.length > DASHBOARD_RELEASES_PER_PACKAGE,
    };
  });
  return { items, truncated: results.length > DASHBOARD_PACKAGE_LIMIT };
}

interface KitRowRaw {
  id: string;
  name: string;
  visibility: string;
  generation: number;
  latest_revision_number: number;
  effective_revision_id: string | null;
  effective_number: number | null;
  deleted_at: number | null;
  publisher_state: string;
}

interface RevisionRowRaw {
  kit_id: string;
  id: string;
  revision_number: number;
  state: string;
  created_at: number;
}

export async function listOwnedKits(db: D1Database, userId: string): Promise<{ items: DashboardKit[]; truncated: boolean }> {
  if (userId === "") return { items: [], truncated: false };
  const { results } = await db
    .prepare(
      `SELECT k.id, k.name, k.visibility, k.generation, k.latest_revision_number, k.effective_revision_id,
              v.revision_number AS effective_number, k.deleted_at, pub.state AS publisher_state
         FROM personal_kits k
         JOIN publishers pub ON pub.id = k.publisher_id
         LEFT JOIN personal_kit_revisions v ON v.id = k.effective_revision_id
        WHERE k.owner_user_id = ?
        ORDER BY k.name LIMIT ?`,
    )
    .bind(userId, DASHBOARD_KIT_LIMIT + 1)
    .all<KitRowRaw>();
  const page = results.slice(0, DASHBOARD_KIT_LIMIT);
  const revisionColumns = "kit_id, id, revision_number, state, created_at";
  const revisions = await rowsPerParent<RevisionRowRaw>(db, "personal_kit_revisions", "kit_id", revisionColumns, "revision_number DESC", page.map((k) => k.id), DASHBOARD_REVISIONS_PER_KIT);
  const byKit = groupBy(revisions, (r) => r.kit_id);
  const items = page.map((k): DashboardKit => {
    const deletedAt = num(k.deleted_at);
    return {
      identity: k.name,
      visibility: k.visibility,
      publisherState: k.publisher_state,
      generation: Number(k.generation),
      latestRevisionNumber: Number(k.latest_revision_number),
      effectiveRevision: k.effective_revision_id === null ? null : { id: k.effective_revision_id, number: Number(k.effective_number) },
      deletedAt,
      restoreDeadline: deletedAt === null ? null : restoreDeadline(deletedAt),
      revisions: (byKit.get(k.id) ?? [])
        .slice(0, DASHBOARD_REVISIONS_PER_KIT)
        .map((r) => ({ id: r.id, number: Number(r.revision_number), state: r.state, createdAt: Number(r.created_at) })),
    };
  });
  return { items, truncated: results.length > DASHBOARD_KIT_LIMIT };
}
