/**
 * Public catalog DTO projections.
 *
 * These functions are the ONLY way a `skills` row becomes an API/SSR payload.
 * They deliberately omit `content`, so a projection that forgets the
 * authorization step cannot leak the SKILL.md payload by accident.
 */

import type { PublicCatalogListingDto, PublicReferenceDto, PublicReviewDto, PublicScriptDto, PublicSkillDetailDto } from "@skillx/contracts";

/** Shape of a `skills` row needed to build the public DTO. */
export interface SkillCatalogRow {
  id: string;
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  version: string | null;
  source_url: string | null;
  is_paid: boolean | null;
  price_cents: number | null;
  risk_label: string | null;
  install_count: number | null;
  avg_rating: number | null;
  rating_count: number | null;
  favorite_count: number | null;
  net_votes: number | null;
  install_command?: string | null;
  updated_at: Date | number | null;
}

export interface ReferenceRow {
  id: string;
  title: string;
  filename: string;
  url: string | null;
  type: string | null;
}

export interface ReviewRow {
  id: string;
  user_id: string;
  content: string;
  is_agent: boolean | null;
  created_at: Date | number | null;
}

export interface ScriptEntry {
  name: string;
  description?: string;
  language?: string;
  url?: string;
}

function toIsoOrNull(value: Date | number | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** Catalog metadata with no payload. Never add `content` here. */
export function toPublicCatalogListing(row: SkillCatalogRow): PublicCatalogListingDto {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    author: row.author,
    category: row.category,
    version: row.version,
    sourceUrl: row.source_url,
    isPaid: Boolean(row.is_paid),
    priceCents: row.price_cents ?? 0,
    riskLabel: row.risk_label ?? "unknown",
    installCount: row.install_count ?? 0,
    avgRating: row.avg_rating ?? 0,
    ratingCount: row.rating_count ?? 0,
    favoriteCount: row.favorite_count ?? 0,
    netVotes: row.net_votes ?? 0,
    updatedAt: toIsoOrNull(row.updated_at),
  };
}

export function toPublicReference(row: ReferenceRow): PublicReferenceDto {
  return { id: row.id, title: row.title, filename: row.filename, url: row.url, type: row.type };
}

export function toPublicReview(row: ReviewRow): PublicReviewDto {
  return {
    id: row.id,
    userId: row.user_id,
    content: row.content,
    isAgent: Boolean(row.is_agent),
    createdAt: toIsoOrNull(row.created_at),
  };
}

export function parseScripts(scriptsJson: string | null | undefined): ScriptEntry[] {
  if (!scriptsJson) return [];
  try {
    const parsed: unknown = JSON.parse(scriptsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is ScriptEntry =>
        typeof entry === "object" && entry !== null && typeof (entry as ScriptEntry).name === "string",
    );
  } catch {
    return [];
  }
}

/** Detail metadata with no payload. Never add `content` here. */
export function toPublicSkillDetail(
  row: SkillCatalogRow,
  references: ReferenceRow[] = [],
  reviews: ReviewRow[] = [],
  scriptsJson: string | null | undefined = null,
): PublicSkillDetailDto {
  return {
    ...toPublicCatalogListing(row),
    installCommand: row.install_command ?? null,
    references: references.map(toPublicReference),
    scripts: parseScripts(scriptsJson),
    reviews: reviews.map(toPublicReview),
  };
}
