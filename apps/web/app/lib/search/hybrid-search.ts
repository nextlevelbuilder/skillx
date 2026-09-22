/**
 * Hybrid search orchestrator combining FTS5 keyword search and vector semantic search.
 * Uses RRF fusion and 8-signal quality boost scoring. Filters are pushed to the
 * retrieval stage for efficiency.
 *
 * Results are projected through the public catalog DTO plus the protected
 * content resolver — never straight from the `skills` row.
 */

import { fts5Search } from './fts5-search';
import { vectorSearch } from './vector-search';
import { reciprocalRankFusion } from './rrf-fusion';
import { applyBoostScoring } from './boost-scoring';
import { fetchSkillStats } from './search-stats';
import { fetchSkillRows, toSearchResult } from './search-result-projection';
import type { SearchResult, SearchScores } from './search-result-projection';
import type { Database } from '~/lib/db';

export type { SearchResult } from './search-result-projection';

export interface SearchFilters {
  category?: string;
  is_paid?: boolean;
}

function scores(partial: Partial<SearchScores>): SearchScores {
  return {
    final_score: partial.final_score ?? 0,
    rrf_score: partial.rrf_score ?? 0,
    semantic_rank: partial.semantic_rank ?? null,
    keyword_rank: partial.keyword_rank ?? null,
  };
}

/**
 * Main hybrid search function.
 * Combines FTS5 and vector search with pre-filtering, RRF fusion, and 8-signal boost.
 */
export async function hybridSearch(
  db: Database,
  d1: D1Database,
  vectorize: VectorizeIndex,
  ai: Ai,
  query: string,
  filters?: SearchFilters,
  userId?: string,
  limit = 20
): Promise<SearchResult[]> {
  if (!query.trim()) {
    return [];
  }

  const viewer = { userId: userId ?? null };

  try {
    // Run both search methods in parallel with pre-filters pushed to retrieval
    const [fts5Results, vectorResults] = await Promise.all([
      fts5Search(d1, query, limit, filters),
      vectorSearch(vectorize, ai, query, limit, filters),
    ]);

    if (fts5Results.length === 0 && vectorResults.length === 0) {
      return [];
    }

    // Apply RRF fusion
    const fusedResults = reciprocalRankFusion(
      vectorResults.map((r) => ({ skill_id: r.skill_id, rank: r.rank })),
      fts5Results.map((r) => ({ skill_id: r.skill_id, rank: r.rank }))
    );

    // Fetch stats for top candidates (before boost, to limit DB work)
    const topSkillIds = fusedResults
      .slice(0, limit * 2)
      .map((r) => r.skill_id);
    const statsMap = await fetchSkillStats(db, topSkillIds, userId);

    // Apply 8-signal quality boost
    const boostedResults = applyBoostScoring(fusedResults, statsMap);

    // Project the top N through the public DTO + protected content resolver
    const finalResultIds = boostedResults
      .slice(0, limit)
      .map((r) => r.skill_id);
    const rows = await fetchSkillRows(db, finalResultIds);

    const finalResults: SearchResult[] = [];
    for (const boosted of boostedResults.slice(0, limit)) {
      const row = rows.get(boosted.skill_id);
      if (row) {
        finalResults.push(
          toSearchResult(
            row,
            scores({
              final_score: boosted.final_score,
              rrf_score: boosted.rrf_score,
              semantic_rank: boosted.semantic_rank,
              keyword_rank: boosted.keyword_rank,
            }),
            viewer
          )
        );
      }
    }

    return finalResults;
  } catch (error) {
    console.error('Hybrid search error:', error);
    // Fallback to FTS5-only search on error
    try {
      const fts5Results = await fts5Search(d1, query, limit, filters);
      const rows = await fetchSkillRows(db, fts5Results.map((r) => r.skill_id));

      const fallbackResults: SearchResult[] = [];
      for (const result of fts5Results) {
        const row = rows.get(result.skill_id);
        if (row) {
          fallbackResults.push(
            toSearchResult(row, scores({ final_score: 1 / (60 + result.rank), keyword_rank: result.rank }), viewer)
          );
        }
      }
      return fallbackResults;
    } catch (fallbackError) {
      console.error('FTS5 fallback search error:', fallbackError);
      return [];
    }
  }
}
