/**
 * Shared search execution for the API action and the web loader.
 *
 * Extracted from `api.search.ts` to keep that route within the project's 200 LOC
 * rule. Both the primary and the fallback path project rows through the public
 * catalog DTO and the protected content resolver, so neither can surface a
 * protected payload.
 */

import { getDb } from "~/lib/db";
import { hybridSearch } from "./hybrid-search";
import type { SearchFilters } from "./hybrid-search";
import { fts5Search } from "./fts5-search";
import { fetchSkillRows, toSearchResult } from "./search-result-projection";
import type { SearchResult } from "./search-result-projection";

export interface SearchExecutionParams {
  query: string;
  filters: SearchFilters;
  userId?: string;
  limit: number;
}

export async function executeSearch(env: Env, params: SearchExecutionParams): Promise<SearchResult[]> {
  const { query, filters, userId, limit } = params;
  const db = getDb(env.DB);

  try {
    return await hybridSearch(
      db,
      env.DB,
      env.VECTORIZE,
      env.AI,
      query,
      filters,
      userId || undefined,
      limit,
    );
  } catch (vectorError) {
    console.error('Vectorize search failed, falling back to FTS5:', vectorError);

    const fts5Results = await fts5Search(env.DB, query, limit, filters);
    const rows = await fetchSkillRows(db, fts5Results.map((r) => r.skill_id));

    return fts5Results.flatMap((result, index) => {
      const row = rows.get(result.skill_id);
      return row
        ? [
            toSearchResult(
              row,
              {
                final_score: 1 / (60 + (index + 1)),
                rrf_score: 0,
                semantic_rank: null,
                keyword_rank: index + 1,
              },
              { userId: userId ?? null },
            ),
          ]
        : [];
    });
  }
}
