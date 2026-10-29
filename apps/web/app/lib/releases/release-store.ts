/**
 * D1 access of the release publish path. The release row is the last write
 * of a publish: it is inserted only after every R2 object exists, in one
 * batch with the package row, and the unique (package_id, version) index
 * makes exactly one of two concurrent uploads of a version win.
 */
import type { ExecSummary, PackageKind, PackageVisibility, ReleaseChannel, ReleaseSourceProvenance } from "@skillx/contracts";
import { releaseError } from "./release-http";

export interface ExistingPackage {
  id: string;
  publisherId: string;
  kind: string;
  visibility: string;
  /** Set when the package is soft-deleted: no new release may land in it. */
  deletedAt: number | null;
}

export interface ExistingRelease {
  id: string;
  releaseDigest: string | null;
  artifactDigest: string | null;
  state: string;
  manifestKey: string | null;
}

export interface NewRelease {
  publisherId: string;
  identity: string;
  slug: string;
  kind: PackageKind;
  /** Written only when the package is created; the release row joins only a package with exactly this visibility. */
  visibility: PackageVisibility;
  version: string;
  channel: ReleaseChannel;
  state: "published" | "quarantined";
  manifestSchemaVersion: string;
  artifactKey: string;
  artifactDigest: string;
  artifactSize: number;
  releaseDigest: string;
  fileCount: number;
  treeSize: number;
  manifestKey: string;
  sourceProvenance: ReleaseSourceProvenance | null;
  /** Capability summary of a valid agentkit-exec.json, or null when the tree has none. */
  execSummary: ExecSummary | null;
  createdAt: number;
}

export async function findPackage(db: D1Database, identity: string): Promise<ExistingPackage | null> {
  const row = await db
    .prepare("SELECT id, publisher_id, kind, visibility, deleted_at FROM packages WHERE name = ?")
    .bind(identity)
    .first<{ id: string; publisher_id: string; kind: string; visibility: string; deleted_at: number | null }>();
  if (row === null) return null;
  const deletedAt = row.deleted_at === null ? null : Number(row.deleted_at);
  return { id: row.id, publisherId: row.publisher_id, kind: row.kind, visibility: row.visibility, deletedAt };
}

/**
 * A deleted package takes no new release, and its name is not reusable while
 * the tombstone exists (always: there is no hard purge): `409 package.deleted`
 * before anything is written. The owner restores it within the window instead.
 */
export function assertPackageLive(identity: string, pkg: ExistingPackage | null): void {
  if (pkg !== null && pkg.deletedAt !== null) {
    throw releaseError(409, "package.deleted", `${identity} is deleted; restore it within 30 days of deletion to publish again (the name is never reused)`);
  }
}

export async function findRelease(db: D1Database, identity: string, version: string): Promise<ExistingRelease | null> {
  const row = await db
    .prepare(
      `SELECT r.id, r.release_digest, r.artifact_digest, r.release_state, r.signed_manifest_key
         FROM package_releases r JOIN packages p ON p.id = r.package_id
        WHERE p.name = ? AND r.version = ?`,
    )
    .bind(identity, version)
    .first<{ id: string; release_digest: string | null; artifact_digest: string | null; release_state: string; signed_manifest_key: string | null }>();
  if (row === null) return null;
  return {
    id: row.id,
    releaseDigest: row.release_digest,
    artifactDigest: row.artifact_digest,
    state: row.release_state,
    manifestKey: row.signed_manifest_key,
  };
}

const isUniqueViolation = (error: unknown) => error instanceof Error && /UNIQUE constraint failed/i.test(error.message);

/**
 * Creates the package when needed and inserts the release, atomically.
 * Returns "conflict" when the version already exists (a concurrent upload
 * won) or the package exists with another kind, publisher or visibility, or
 * is deleted, so a release never lands in a package more visible than the
 * caller decided, nor in a deleted one.
 */
export async function insertRelease(db: D1Database, release: NewRelease): Promise<"inserted" | "conflict"> {
  const packageId = `pkg_${crypto.randomUUID()}`;
  const releaseId = `rel_${crypto.randomUUID()}`;
  const published = release.state === "published" ? release.createdAt : null;
  const quarantined = release.state === "quarantined" ? release.createdAt : null;
  const statements = [
    db
      .prepare(
        // Only an existing name is skipped; any other constraint failure aborts the batch.
        `INSERT INTO packages (id, publisher_id, name, slug, kind, visibility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(name) DO NOTHING`,
      )
      .bind(packageId, release.publisherId, release.identity, release.slug, release.kind, release.visibility, release.createdAt, release.createdAt),
    db
      .prepare(
        `INSERT INTO package_releases (id, package_id, version, channel, release_state, manifest_schema_version,
           artifact_key, artifact_digest, artifact_size, release_digest, file_count, tree_size, signed_manifest_key,
           source_provenance, exec_summary_json, created_at, published_at, quarantined_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM packages WHERE name = ? AND publisher_id = ? AND kind = ? AND visibility = ? AND deleted_at IS NULL`,
      )
      .bind(
        releaseId,
        release.version,
        release.channel,
        release.state,
        release.manifestSchemaVersion,
        release.artifactKey,
        release.artifactDigest,
        release.artifactSize,
        release.releaseDigest,
        release.fileCount,
        release.treeSize,
        release.manifestKey,
        release.sourceProvenance === null ? null : JSON.stringify(release.sourceProvenance),
        release.execSummary === null ? null : JSON.stringify(release.execSummary),
        release.createdAt,
        published,
        quarantined,
        release.identity,
        release.publisherId,
        release.kind,
        release.visibility,
      ),
  ];
  try {
    const results = await db.batch(statements);
    return (results[1]?.meta.changes ?? 0) === 1 ? "inserted" : "conflict";
  } catch (error) {
    if (isUniqueViolation(error)) return "conflict";
    throw error;
  }
}
