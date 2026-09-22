/**
 * Shared search execution for the API action and the web loader.
 *
 * Extracted from `api.search.ts` to keep that route within the project's 200 LOC
 * rule. Both the primary and the fallback path project rows through the public
 * catalog DTO and the protected content resolver, so neither can surface a
 * protected payload.
 *
 * The `--compatible` filter runs here rather than in the database: compatibility
 * is a JSON column that FTS5 and Vectorize cannot index. When the filter is
 * active the executor over-fetches a candidate pool, then reports exactly what it
 * kept and what it could not decide.
 */

import { getDb } from "~/lib/db";
import { hybridSearch } from "./hybrid-search";
import type { SearchFilters } from "./hybrid-search";
import { fts5Search } from "./fts5-search";
import { fetchSkillRows, toSearchResult } from "./search-result-projection";
import type { SearchResult } from "./search-result-projection";
import {
  applyCompatibilityFilter,
  compatibilityPoolSize,
  emptyFilterNote,
  MAX_COMPATIBILITY_POOL,
  type CompatibilityFilterReport,
  type CompatibilityFilterRequest,
} from "./compatibility-filter";

export interface SearchExecutionParams {
  query: string;
  filters: SearchFilters;
  userId?: string;
  limit: number;
  /** When present, only listings that declare the runtime are returned. */
  compatible?: CompatibilityFilterRequest;
}

export interface SearchOutcome {
  results: SearchResult[];
  /** Present only when a compatibility filter ran. */
  compatibilityFilter?: CompatibilityFilterReport;
  /** Present only when the filter returned nothing, to explain why. */
  note?: string;
}

async function runSearch(
  env: Env,
  params: SearchExecutionParams,
  poolLimit: number,
): Promise<SearchResult[]> {
  const { query, filters, userId } = params;
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
      poolLimit,
    );
  } catch (vectorError) {
    console.error('Vectorize search failed, falling back to FTS5:', vectorError);

    const fts5Results = await fts5Search(env.DB, query, poolLimit, filters);
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

export async function executeSearch(env: Env, params: SearchExecutionParams): Promise<SearchOutcome> {
  const { compatible, limit } = params;
  if (!compatible) {
    return { results: await runSearch(env, params, limit) };
  }

  const poolLimit = compatibilityPoolSize(limit);
  const candidates = await runSearch(env, params, poolLimit);
  const outcome = applyCompatibilityFilter(
    candidates,
    compatible,
    limit,
    poolLimit >= MAX_COMPATIBILITY_POOL && candidates.length >= poolLimit,
  );

  return {
    results: outcome.results,
    compatibilityFilter: outcome.report,
    ...(outcome.results.length === 0 ? { note: emptyFilterNote(outcome.report) } : {}),
  };
}
