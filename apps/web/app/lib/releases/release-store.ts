/**
 * D1 access of the release publish path. The release row is the last write
 * of a publish: it is inserted only after every R2 object exists, in one
 * batch with the package row, and the unique (package_id, version) index
 * makes exactly one of two concurrent uploads of a version win.
 */
import type { PackageKind, ReleaseChannel, ReleaseSourceProvenance } from "@skillx/contracts";

export interface ExistingPackage {
  id: string;
  publisherId: string;
  kind: string;
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
  createdAt: number;
}

export async function findPackage(db: D1Database, identity: string): Promise<ExistingPackage | null> {
  const row = await db
    .prepare("SELECT id, publisher_id, kind FROM packages WHERE name = ?")
    .bind(identity)
    .first<{ id: string; publisher_id: string; kind: string }>();
  return row === null ? null : { id: row.id, publisherId: row.publisher_id, kind: row.kind };
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
 * won) or the package exists with another kind or publisher.
 */
export async function insertRelease(db: D1Database, release: NewRelease): Promise<"inserted" | "conflict"> {
  const packageId = `pkg_${crypto.randomUUID()}`;
  const releaseId = `rel_${crypto.randomUUID()}`;
  const published = release.state === "published" ? release.createdAt : null;
  const quarantined = release.state === "quarantined" ? release.createdAt : null;
  const statements = [
    db
      .prepare(
        `INSERT OR IGNORE INTO packages (id, publisher_id, name, slug, kind, visibility, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'public', ?, ?)`,
      )
      .bind(packageId, release.publisherId, release.identity, release.slug, release.kind, release.createdAt, release.createdAt),
    db
      .prepare(
        `INSERT INTO package_releases (id, package_id, version, channel, release_state, manifest_schema_version,
           artifact_key, artifact_digest, artifact_size, release_digest, file_count, tree_size, signed_manifest_key,
           source_provenance, created_at, published_at, quarantined_at)
         SELECT ?, id, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
           FROM packages WHERE name = ? AND publisher_id = ? AND kind = ?`,
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
        release.createdAt,
        published,
        quarantined,
        release.identity,
        release.publisherId,
        release.kind,
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
