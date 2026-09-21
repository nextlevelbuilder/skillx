/**
 * Legacy listing migration contract.
 *
 * Every catalog row that exists today is a *listing*: content harvested from a
 * remote source, versioned only by convention. None of them were produced by the
 * packer, so none of them have an immutable artifact, a digest, or a
 * reproducible byte sequence.
 *
 * The migration therefore maps legacy rows to listings and explicitly records
 * `releaseId: null` / `releaseDigest: null` / `immutable: false`. Inventing a
 * release for them would fabricate history that was never published.
 */

export interface LegacySkillRow {
  id: string;
  slug: string;
  source_url: string | null;
  version: string | null;
  created_at: Date | number | null;
}

export interface ListingMigration {
  listingId: string;
  slug: string;
  /** Public path preserved so existing links keep resolving. */
  canonicalPath: string;
  sourceUrl: string | null;
  /** Publisher-declared version string; not an immutable release version. */
  declaredVersion: string | null;
  /** Always null: a listing has no release. */
  releaseId: null;
  /** Always null: a listing has no artifact digest. */
  releaseDigest: null;
  /** Always false: a listing's content can change at its source. */
  immutable: false;
}

/**
 * Explicit slug remaps for listings whose current slug must change.
 *
 * Empty today: no slug is being rewritten, so every existing public URL keeps
 * resolving unchanged. Populate this only with a documented reason and an alias
 * entry, never as a silent rename.
 */
export const LEGACY_SLUG_ALIASES: Readonly<Record<string, string>> = {};

/** Resolves an inbound legacy slug to its current canonical slug. */
export function resolveLegacySlug(slug: string): string {
  return LEGACY_SLUG_ALIASES[slug] ?? slug;
}

export function toListingMigration(row: LegacySkillRow): ListingMigration {
  const slug = resolveLegacySlug(row.slug);
  return {
    listingId: row.id,
    slug,
    canonicalPath: `/skills/${slug}`,
    sourceUrl: row.source_url,
    declaredVersion: row.version,
    releaseId: null,
    releaseDigest: null,
    immutable: false,
  };
}

/** A listing may only ever be migrated once. */
export function isAlreadyMigrated(row: LegacySkillRow): boolean {
  return row.id.trim().length > 0 && row.slug.trim().length > 0;
}
