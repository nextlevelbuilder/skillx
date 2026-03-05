/**
 * Hybrid search orchestrator combining FTS5 keyword search and vector semantic search.
 * Uses RRF fusion and 7-signal quality boost scoring for optimal results.
 * Filters pushed to retrieval stage for efficiency.
 */

import { eq, inArray, and, sql } from 'drizzle-orm';
import type { Database } from '~/lib/db';
import { skills, favorites, usageStats } from '~/lib/db/schema';
import { fts5Search } from './fts5-search';
import { vectorSearch } from './vector-search';
import { reciprocalRankFusion } from './rrf-fusion';
import { applyBoostScoring, type SkillStats } from './boost-scoring';

export interface SearchFilters {
  category?: string;
  is_paid?: boolean;
}

export interface SearchResult {
  id: string;
  name: string;
  slug: string;
  description: string;
  content: string;
  author: string;
  source_url: string | null;
  category: string;
  install_command: string | null;
  version: string | null;
  is_paid: boolean | null;
  price_cents: number | null;
  avg_rating: number | null;
  rating_count: number | null;
  install_count: number | null;
  created_at: Date | null;
  updated_at: Date | null;
  final_score: number;
  rrf_score: number;
  semantic_rank: number | null;
  keyword_rank: number | null;
}

/**
 * Fetch skill stats for boost scoring.
 * Includes: rating, installs, github_stars, success_rate, updated_at, favorites.
 */
async function fetchSkillStats(
  db: Database,
  skillIds: string[],
  userId?: string
): Promise<Map<string, SkillStats>> {
  if (skillIds.length === 0) {
    return new Map();
  }

  // Fetch skill data with expanded fields for 8-signal boost
  const [skillData, successRates, favResults] = await Promise.all([
    db
      .select({
        id: skills.id,
        avg_rating: skills.avg_rating,
        install_count: skills.install_count,
        github_stars: skills.github_stars,
        net_votes: skills.net_votes,
        updated_at: skills.updated_at,
      })
      .from(skills)
      .where(inArray(skills.id, skillIds)),

    // Compute success_rate per skill from usage_stats
    db
      .select({
        skill_id: usageStats.skill_id,
        success_rate: sql<number>`
          CAST(SUM(CASE WHEN ${usageStats.outcome} = 'success' THEN 1 ELSE 0 END) AS REAL)
          / COUNT(*)
        `.as('success_rate'),
      })
      .from(usageStats)
      .where(inArray(usageStats.skill_id, skillIds))
      .groupBy(usageStats.skill_id),

    // Fetch favorites if user is authenticated
    userId
      ? db
          .select({ skill_id: favorites.skill_id })
          .from(favorites)
          .where(
            and(
              eq(favorites.user_id, userId),
              inArray(favorites.skill_id, skillIds)
            )
          )
      : Promise.resolve([]),
  ]);

  const successMap = new Map(
    successRates.map((r) => [r.skill_id, r.success_rate])
  );
  const userFavorites = new Set(favResults.map((f) => f.skill_id));

  // Build stats map with all 8 signals
  const statsMap = new Map<string, SkillStats>();
  for (const skill of skillData) {
    statsMap.set(skill.id, {
      avg_rating: skill.avg_rating || 0,
      usage_count: skill.install_count || 0,
      github_stars: skill.github_stars || 0,
      success_rate: successMap.get(skill.id) ?? 0.5,
      updated_at: skill.updated_at,
      is_favorited: userFavorites.has(skill.id),
      net_votes: skill.net_votes || 0,
    });
  }

  return statsMap;
}

/**
 * Fetch full skill data for final results
 */
async function fetchSkills(
  db: Database,
  skillIds: string[]
): Promise<Map<string, SearchResult>> {
  if (skillIds.length === 0) {
    return new Map();
  }

  const skillData = await db
    .select()
    .from(skills)
    .where(inArray(skills.id, skillIds));

  const skillMap = new Map<string, SearchResult>();
  for (const skill of skillData) {
    skillMap.set(skill.id, {
      ...skill,
      final_score: 0,
      rrf_score: 0,
      semantic_rank: null,
      keyword_rank: null,
    });
  }

  return skillMap;
}

/**
 * Main hybrid search function.
 * Combines FTS5 and vector search with pre-filtering, RRF fusion, and 7-signal boost.
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

    // Apply 7-signal quality boost
    const boostedResults = applyBoostScoring(fusedResults, statsMap);

    // Fetch full skill data for top N
    const finalResultIds = boostedResults
      .slice(0, limit)
      .map((r) => r.skill_id);
    const skillsMap = await fetchSkills(db, finalResultIds);

    // Combine skill data with scores, maintaining boost order
    const finalResults: SearchResult[] = [];
    for (const boosted of boostedResults.slice(0, limit)) {
      const skill = skillsMap.get(boosted.skill_id);
      if (skill) {
        finalResults.push({
          ...skill,
          final_score: boosted.final_score,
          rrf_score: boosted.rrf_score,
          semantic_rank: boosted.semantic_rank,
          keyword_rank: boosted.keyword_rank,
        });
      }
    }

    return finalResults;
  } catch (error) {
    console.error('Hybrid search error:', error);
    // Fallback to FTS5-only search on error
    try {
      const fts5Results = await fts5Search(d1, query, limit, filters);
      const skillIds = fts5Results.map((r) => r.skill_id);
      const skillsMap = await fetchSkills(db, skillIds);

      return fts5Results
        .map((r) => {
          const skill = skillsMap.get(r.skill_id);
          if (!skill) return null;
          return {
            ...skill,
            final_score: 1 / (60 + r.rank),
            rrf_score: 0,
            semantic_rank: null,
            keyword_rank: r.rank,
          };
        })
        .filter((r): r is SearchResult => r !== null);
    } catch (fallbackError) {
      console.error('FTS5 fallback search error:', fallbackError);
      return [];
    }
  }
}
