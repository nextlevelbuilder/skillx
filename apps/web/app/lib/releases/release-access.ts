/**
 * Who may read which release, and in which state. Shared by every pinned
 * read endpoint so they all reach the same answer for the same inputs, in
 * one precedence order: unknown or unentitled (404), then quarantined (403),
 * then publisher revoked (403), then yanked (410 by version, served with its
 * state by digest).
 *
 * - A private package is readable by the owner of its publisher
 *   (`publishers.owner_user_id`, read at request time, so a change of owner
 *   takes effect at once) and by a viewer holding an unrevoked entitlement
 *   (whole stream, or the release itself), decided by the shared
 *   payload-access gate. Anyone else answers exactly like an unknown
 *   package: `404 not_found`, same body, same queries (the owner and
 *   entitlement tests are part of the one lookup query, so existence does
 *   not change the query count).
 * - A suspended or revoked publisher: `403 publisher_revoked`, for its owner
 *   too.
 * - `quarantined`: `403 release_quarantined` everywhere, for every release
 *   of the same tree (quarantine judges the bytes, in any package).
 * - `yanked`: served by digest (with its state); `410 release_yanked` for a
 *   new resolution by version.
 * - Draft rows, and rows without a signed manifest, do not exist here.
 */
import { PACKAGE_NAME_PATTERN, RELEASE_DIGEST_PATTERN, RELEASE_VERSION_PATTERN, decidePayloadAccess } from "@skillx/contracts";
import { ERROR_CODES } from "@skillx/skill-tree";
import { releaseError } from "./release-http";

export type ServedReleaseState = "published" | "yanked" | "quarantined";

export interface ReadableRelease {
  id: string;
  identity: string;
  version: string;
  channel: string;
  state: ServedReleaseState;
  releaseDigest: string;
  artifactKey: string | null;
  artifactDigest: string | null;
  artifactSize: number | null;
  manifestKey: string;
  createdAt: number;
  /** `public` or `private`; anything else is treated as private. */
  visibility: string;
}

export interface ReleaseRowAccess extends ReadableRelease {
  publisherState: string;
  entitled: boolean;
  /** The viewer owns the package's publisher. */
  owned: boolean;
  /** Some release of this tree, in any package, is quarantined. */
  treeQuarantined: boolean;
}

/** Most releases one listing returns (newest first). */
export const MAX_LISTED_RELEASES = 500;

const NOT_FOUND_MESSAGE = "Not found";

/** The one answer for unknown, unentitled and draft: identical to the flag-off body. */
export const notFound = () => releaseError(404, "not_found", NOT_FOUND_MESSAGE);

const VERSION_MAX_LENGTH = 128;

export function parseReleaseDigest(raw: string | undefined): string {
  if (raw === undefined || !RELEASE_DIGEST_PATTERN.test(raw)) {
    throw releaseError(400, "invalid_digest", "release digest must be sha256:<64 lowercase hex>");
  }
  return raw;
}

/** `@handle/slug` from the route; a malformed name is 400, an unknown one later 404. */
export function parsePackageIdentity(scope: string | undefined, slug: string | undefined): string {
  const identity = `${scope ?? ""}/${slug ?? ""}`;
  if (!scope?.startsWith("@") || !slug || !PACKAGE_NAME_PATTERN.test(identity)) {
    throw releaseError(400, ERROR_CODES.identityInvalid, "package name must be @publisher/slug in lowercase");
  }
  return identity;
}

export function parseReleaseVersion(raw: string | undefined): string {
  if (raw === undefined || raw.length > VERSION_MAX_LENGTH || !RELEASE_VERSION_PATTERN.test(raw)) {
    throw releaseError(400, "invalid_version", "version must be a SemVer 2.0 version without build metadata");
  }
  return raw;
}

/**
 * True when the viewer (bound once) owns the package's publisher. An empty or
 * missing owner never matches, so the anonymous '' bind owns nothing.
 */
const OWNED = `(pub.owner_user_id IS NOT NULL AND pub.owner_user_id <> '' AND pub.owner_user_id = ?)`;

// `?` 1 and 2 are always the viewer subject ('' for anonymous, which matches no entitlement and no owner).
const RELEASE_SELECT = `
  SELECT r.id, p.name, r.version, r.channel, r.release_state, r.release_digest, r.artifact_key, r.artifact_digest,
         r.artifact_size, r.signed_manifest_key, r.created_at, p.visibility, pub.state AS publisher_state,
         EXISTS (SELECT 1 FROM entitlements e
                  WHERE e.subject_id = ? AND e.package_id = p.id AND e.revoked_at IS NULL
                    AND (e.release_id IS NULL OR e.release_id = r.id)) AS entitled,
         ${OWNED} AS owned,
         EXISTS (SELECT 1 FROM package_releases q
                  WHERE q.release_digest = r.release_digest AND q.release_state = 'quarantined') AS tree_quarantined
    FROM package_releases r
    JOIN packages p ON p.id = r.package_id
    JOIN publishers pub ON pub.id = p.publisher_id
   WHERE r.release_state IN ('published', 'yanked', 'quarantined')
     AND r.release_digest IS NOT NULL AND r.signed_manifest_key IS NOT NULL`;

interface ReleaseRowRaw {
  id: string;
  name: string;
  version: string;
  channel: string;
  release_state: ServedReleaseState;
  release_digest: string;
  artifact_key: string | null;
  artifact_digest: string | null;
  artifact_size: number | null;
  signed_manifest_key: string;
  created_at: number;
  visibility: string;
  publisher_state: string;
  entitled: number;
  owned: number;
  tree_quarantined: number;
}

function toRelease(row: ReleaseRowRaw): ReleaseRowAccess {
  return {
    id: row.id,
    identity: row.name,
    version: row.version,
    channel: row.channel,
    state: row.release_state,
    releaseDigest: row.release_digest,
    artifactKey: row.artifact_key,
    artifactDigest: row.artifact_digest,
    artifactSize: row.artifact_size,
    manifestKey: row.signed_manifest_key,
    createdAt: Number(row.created_at),
    visibility: row.visibility,
    publisherState: row.publisher_state,
    entitled: Number(row.entitled) === 1,
    owned: Number(row.owned) === 1,
    treeQuarantined: Number(row.tree_quarantined) === 1,
  };
}

async function queryReleases(db: D1Database, where: string, userId: string | null, ...binds: unknown[]): Promise<ReleaseRowAccess[]> {
  const { results } = await db
    .prepare(`${RELEASE_SELECT} AND ${where}`)
    .bind(userId ?? "", userId ?? "", ...binds)
    .all<ReleaseRowRaw>();
  return results.map(toRelease);
}

/**
 * The shared payload-access gate: public packages for everyone, private ones
 * only for the owner of their publisher or with an entitlement. Ownership
 * counts only for a signed-in viewer, never for anonymous.
 */
function viewerMayRead(target: { identity: string; visibility: string; entitled: boolean; owned: boolean }, userId: string | null): boolean {
  const owner = target.owned && userId !== null && userId !== "";
  return decidePayloadAccess(
    { slug: target.identity, isProtected: target.visibility !== "public", state: "published" },
    { userId, hasEntitlement: target.entitled || owner },
    () => true,
  ).granted;
}

function publisherRevoked() {
  return releaseError(403, "publisher_revoked", "the publisher of this package is suspended or revoked");
}

function quarantined() {
  return releaseError(403, "release_quarantined", "this release is quarantined and cannot be downloaded");
}

/** Quarantine judges the bytes: any quarantined release of the tree blocks every release of it. */
const isQuarantined = (row: ReleaseRowAccess) => row.state === "quarantined" || row.treeQuarantined;

function strip({ publisherState: _p, entitled: _e, owned: _o, treeQuarantined: _q, ...release }: ReleaseRowAccess): ReadableRelease {
  return release;
}

/**
 * A release by version in any served state, with the facts the read rules
 * use (publisher state, tree quarantine), for the signed status endpoint.
 * Only unknown, unentitled and draft releases are null (404).
 */
export async function findReleaseForStatus(db: D1Database, identity: string, version: string, userId: string | null): Promise<ReleaseRowAccess | null> {
  const [row] = await queryReleases(db, "p.name = ? AND r.version = ?", userId, identity, version);
  return row === undefined || !viewerMayRead(row, userId) ? null : row;
}

/** New resolution by version: only `published` is served. */
export async function resolveReleaseByVersion(db: D1Database, identity: string, version: string, userId: string | null): Promise<ReadableRelease> {
  const [row] = await queryReleases(db, "p.name = ? AND r.version = ?", userId, identity, version);
  if (row === undefined || !viewerMayRead(row, userId)) throw notFound();
  if (isQuarantined(row)) throw quarantined();
  if (row.publisherState !== "active") throw publisherRevoked();
  if (row.state === "yanked") throw releaseError(410, "release_yanked", `${identity}@${version} was yanked; pin it by digest or choose another version`);
  return strip(row);
}

/**
 * Locked resolution by tree digest. One tree may be released under several
 * versions or packages; only rows the viewer may read count (otherwise
 * 404). A quarantined release of the tree anywhere blocks the bytes (403),
 * with or without a selector. Among rows of active publishers a published
 * row wins over a yanked one, then the earliest created, so the answer is
 * deterministic.
 *
 * With a `version` selector only that release counts: it must carry this
 * digest, otherwise the answer is the unknown-release 404. Yanked stays
 * per release: a yanked selection is served with its state. A `package`
 * identity selector likewise limits the rows to that package, so another
 * package republishing the same bytes can never answer for it.
 */
export async function resolveReleaseByDigest(
  db: D1Database,
  releaseDigest: string,
  userId: string | null,
  version: string | null = null,
  identity: string | null = null,
): Promise<ReadableRelease> {
  const terms = ["r.release_digest = ?"];
  const binds: unknown[] = [releaseDigest];
  if (version !== null) terms.push("r.version = ?"), binds.push(version);
  if (identity !== null) terms.push("p.name = ?"), binds.push(identity);
  const found = await queryReleases(db, `${terms.join(" AND ")} ${DIGEST_ORDER} LIMIT ?`, userId, ...binds, MAX_DIGEST_ROWS);
  const rows = found.filter((row) => viewerMayRead(row, userId));
  if (rows.length === 0) throw notFound();
  // Every row of one digest carries the same tree-wide flag, so the row bound cannot hide a quarantine.
  if (rows.some(isQuarantined)) throw quarantined();
  const active = rows.filter((row) => row.publisherState === "active");
  if (active.length === 0) throw publisherRevoked();
  // Same tie-breaks as DIGEST_ORDER after its readable and active terms (already filtered here).
  active.sort((a, b) => publishedFirst(a) - publishedFirst(b) || a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return strip(active[0]!);
}

/** Most rows one digest lookup reads; one tree republished more often than this is still served. */
export const MAX_DIGEST_ROWS = 50;

/**
 * Bounds the digest lookup deterministically, in exactly the order that
 * decides the winner: rows the viewer may read (public, owned, or entitled
 * to the package or the release, mirroring `viewerMayRead`; `entitled` and
 * `owned` are always 0 for an anonymous viewer), then rows of active
 * publishers, then published before yanked, then the earliest, then `id`. So
 * the bound only drops rows that could not have won, and the in-memory sort
 * below agrees with it.
 */
const DIGEST_ORDER = `ORDER BY (p.visibility = 'public' OR entitled OR owned) DESC, pub.state = 'active' DESC,
                               r.release_state = 'published' DESC, r.created_at, r.id`;

const publishedFirst = (row: ReleaseRowAccess) => (row.state === "published" ? 0 : 1);

export interface PackageReleaseList {
  identity: string;
  visibility: string;
  releases: ReadableRelease[];
}

const NAME_CHUNK = 50;

/**
 * The names, among `names`, of existing packages the viewer may not read.
 * Surfaces that merely mention packages (collection members) drop these so a
 * private package is never named to someone the read gate would answer 404.
 * Unknown names are not returned: there is nothing to protect, and the answer
 * must not tell an unknown name from a readable one.
 */
export async function unreadablePackageNames(db: D1Database, names: readonly string[], userId: string | null): Promise<Set<string>> {
  const hidden = new Set<string>();
  const unique = [...new Set(names)];
  for (let i = 0; i < unique.length; i += NAME_CHUNK) {
    const chunk = unique.slice(i, i + NAME_CHUNK);
    const { results } = await db
      .prepare(
        `SELECT p.name, p.visibility,
                EXISTS (SELECT 1 FROM entitlements e
                         WHERE e.subject_id = ? AND e.package_id = p.id AND e.revoked_at IS NULL) AS entitled,
                ${OWNED} AS owned
           FROM packages p JOIN publishers pub ON pub.id = p.publisher_id
          WHERE p.name IN (${chunk.map(() => "?").join(", ")})`,
      )
      .bind(userId ?? "", userId ?? "", ...chunk)
      .all<{ name: string; visibility: string; entitled: number; owned: number }>();
    for (const row of results) {
      const target = { identity: row.name, visibility: row.visibility, entitled: Number(row.entitled) === 1, owned: Number(row.owned) === 1 };
      if (!viewerMayRead(target, userId)) hidden.add(row.name);
    }
  }
  return hidden;
}

/** Published and yanked releases of a package, newest first; releases of a quarantined tree are hidden. */
export async function listPackageReleases(db: D1Database, identity: string, userId: string | null): Promise<PackageReleaseList> {
  const pkg = await db
    .prepare(
      `SELECT p.id, p.visibility, pub.state AS publisher_state,
              EXISTS (SELECT 1 FROM entitlements e
                       WHERE e.subject_id = ? AND e.package_id = p.id AND e.revoked_at IS NULL) AS entitled,
              ${OWNED} AS owned
         FROM packages p JOIN publishers pub ON pub.id = p.publisher_id
        WHERE p.name = ?`,
    )
    .bind(userId ?? "", userId ?? "", identity)
    .first<{ id: string; visibility: string; publisher_state: string; entitled: number; owned: number }>();
  if (pkg === null) throw notFound();
  const target = { identity, visibility: pkg.visibility, entitled: Number(pkg.entitled) === 1, owned: Number(pkg.owned) === 1 };
  if (!viewerMayRead(target, userId)) throw notFound();
  if (pkg.publisher_state !== "active") throw publisherRevoked();
  const rows = await queryReleases(
    db,
    "r.package_id = ? AND r.release_state IN ('published', 'yanked') ORDER BY r.created_at DESC, r.id LIMIT ?",
    userId,
    pkg.id,
    MAX_LISTED_RELEASES,
  );
  // A release-only entitlement opens the listing but shows only the entitled releases.
  // A release whose tree is quarantined anywhere answers 403, so it is never offered.
  return {
    identity,
    visibility: pkg.visibility,
    releases: rows.filter((row) => viewerMayRead(row, userId) && !isQuarantined(row)).map(strip),
  };
}
