/**
 * Search-result projection.
 *
 * A search hit is a public catalog listing plus ranking scores. The SKILL.md
 * payload is attached only through the protected content resolver, so a
 * protected listing can never ride along in a search response.
 */

import { inArray } from "drizzle-orm";
import type { CompatibilitySummary, PublicCatalogListingDto } from "@skillx/contracts";
import { skills } from "~/lib/db/schema";
import type { Database } from "~/lib/db";
import { toPublicCatalogListing } from "~/lib/catalog/public-dto";
import type { SkillCatalogRow } from "~/lib/catalog/public-dto";
import { buildCatalogListingResponse } from "~/lib/catalog/protected-content";
import type { CatalogListingResponse, PayloadViewer } from "~/lib/catalog/protected-content";
import { summarizeRowRuntimes } from "~/lib/compatibility/catalog-compatibility";

/** A full catalog row, including the payload that must not be served directly. */
export interface SkillRow extends SkillCatalogRow {
  content: string;
}

export interface SearchScores {
  final_score: number;
  rrf_score: number;
  semantic_rank: number | null;
  keyword_rank: number | null;
}

export type SearchResult = CatalogListingResponse &
  SearchScores & {
    /**
     * Declared runtime compatibility. Absent when the listing declares nothing, so
     * an undeclared row stays small and an agent reads `unknown` from absence
     * plus the filter report rather than from an empty per-row array.
     */
    compatibility?: CompatibilitySummary[];
  };

export async function fetchSkillRows(db: Database, skillIds: string[]): Promise<Map<string, SkillRow>> {
  if (skillIds.length === 0) return new Map();
  const rows = await db.select().from(skills).where(inArray(skills.id, skillIds));
  return new Map(rows.map((row) => [row.id, row]));
}

export function toSearchResult(
  row: SkillRow,
  scores: SearchScores,
  viewer: PayloadViewer = {},
): SearchResult {
  const listing: PublicCatalogListingDto = toPublicCatalogListing(row);
  const response = buildCatalogListingResponse(
    listing,
    { slug: row.slug, is_paid: row.is_paid, content: row.content },
    viewer,
  );
  const compatibility = summarizeRowRuntimes(row);
  return {
    ...response,
    ...scores,
    ...(compatibility.length > 0 ? { compatibility } : {}),
  };
}
