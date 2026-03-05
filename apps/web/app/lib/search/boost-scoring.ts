/**
 * Boost scoring module to enhance search results with quality signals.
 * Combines RRF scores with 8 signals: rating, stars, usage, success rate, votes, recency, favorites.
 * All components normalized to 0-1 range before applying weights.
 */

import type { RRFResult } from './rrf-fusion';
import { logNormalize, recencyScore } from '~/lib/scoring-utils';

/** Boost weight configuration — must sum to 1.0 */
const WEIGHTS = {
  rrf: 0.43,
  rating: 0.15,
  stars: 0.10,
  usage: 0.08,
  success: 0.07,
  votes: 0.07,
  recency: 0.05,
  favorite: 0.05,
} as const;

export interface SkillStats {
  avg_rating: number;
  usage_count: number;
  github_stars: number;
  success_rate: number; // 0-1 ratio from usage_stats outcomes
  updated_at: Date | null;
  is_favorited: boolean;
  net_votes: number;
}

export interface BoostedResult {
  skill_id: string;
  final_score: number;
  rrf_score: number;
  rating_boost: number;
  usage_boost: number;
  stars_boost: number;
  success_boost: number;
  vote_boost: number;
  recency_boost: number;
  favorite_boost: number;
  semantic_rank: number | null;
  keyword_rank: number | null;
}

/**
 * Apply quality boost to RRF scores using 8 weighted signals.
 *
 * Formula: final = rrf*0.43 + rating*0.15 + stars*0.10 + usage*0.08
 *                + success*0.07 + votes*0.07 + recency*0.05 + favorite*0.05
 *
 * @param rrfResults - Results from RRF fusion
 * @param statsMap - Map of skill_id to quality stats
 * @returns Results with boosted scores, sorted by final_score descending
 */
export function applyBoostScoring(
  rrfResults: RRFResult[],
  statsMap: Map<string, SkillStats>
): BoostedResult[] {
  if (rrfResults.length === 0) {
    return [];
  }

  // Find max values for normalization
  const maxRrfScore = Math.max(...rrfResults.map((r) => r.rrf_score));
  const allStats = Array.from(statsMap.values());
  const maxRating = 10; // Rating scale is 0-10
  const maxUsage = Math.max(...allStats.map((s) => s.usage_count), 1);
  const maxStars = Math.max(...allStats.map((s) => s.github_stars), 1);
  const maxNetVotes = Math.max(...allStats.map((s) => Math.max(0, s.net_votes)), 1);

  const boostedResults: BoostedResult[] = rrfResults.map((result) => {
    const stats = statsMap.get(result.skill_id) || {
      avg_rating: 0,
      usage_count: 0,
      github_stars: 0,
      success_rate: 0.5,
      updated_at: null,
      is_favorited: false,
      net_votes: 0,
    };

    // Normalize each component to 0-1 range
    const normalizedRrf =
      maxRrfScore > 0 ? result.rrf_score / maxRrfScore : 0;
    const normalizedRating = stats.avg_rating / maxRating;
    const normalizedStars = logNormalize(stats.github_stars, maxStars);
    const normalizedUsage = logNormalize(stats.usage_count, maxUsage);
    const normalizedSuccess = stats.success_rate;
    const normalizedVotes = logNormalize(Math.max(0, stats.net_votes), maxNetVotes);
    const normalizedRecency = recencyScore(stats.updated_at);
    const favoriteBoost = stats.is_favorited ? 1.0 : 0;

    // Apply weighted formula
    const ratingBoost = normalizedRating * WEIGHTS.rating;
    const starsBoost = normalizedStars * WEIGHTS.stars;
    const usageBoost = normalizedUsage * WEIGHTS.usage;
    const successBoost = normalizedSuccess * WEIGHTS.success;
    const voteBoost = normalizedVotes * WEIGHTS.votes;
    const recencyBoostVal = normalizedRecency * WEIGHTS.recency;
    const favBoost = favoriteBoost * WEIGHTS.favorite;

    const finalScore =
      normalizedRrf * WEIGHTS.rrf +
      ratingBoost +
      starsBoost +
      usageBoost +
      successBoost +
      voteBoost +
      recencyBoostVal +
      favBoost;

    return {
      skill_id: result.skill_id,
      final_score: finalScore,
      rrf_score: result.rrf_score,
      rating_boost: ratingBoost,
      usage_boost: usageBoost,
      stars_boost: starsBoost,
      success_boost: successBoost,
      vote_boost: voteBoost,
      recency_boost: recencyBoostVal,
      favorite_boost: favBoost,
      semantic_rank: result.semantic_rank,
      keyword_rank: result.keyword_rank,
    };
  });

  // Sort by final score descending
  return boostedResults.sort((a, b) => b.final_score - a.final_score);
}
