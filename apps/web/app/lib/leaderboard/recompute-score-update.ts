/**
 * Pure scoring step shared by the bulk and the single-skill recompute paths.
 *
 * Both paths used to carry their own copy of the same Bayesian / composite /
 * trending math, down to the `Math.max(..., 1)` guards. They now build the four
 * precomputed columns here, and each module keeps only its own data fetching and
 * the single `UPDATE`.
 */

import {
  computeBayesianRating,
  computeCompositeScore,
  computeTrendingScore,
} from "./leaderboard-scoring";

/** Per-skill aggregate row read by the bulk path's batched query. */
export interface SkillAggregates {
  skill_id: string;
  fav_count: number;
  recent_ratings: number;
  recent_usage: number;
  total_usage: number;
  success_count: number;
}

/** The skill columns the score depends on. */
export interface ScoreInputs {
  avgRating: number | null;
  ratingCount: number | null;
  installCount: number | null;
  githubStars: number | null;
  netVotes: number | null;
  updatedAt: Date | null;
}

/** Column maxima used to normalize each signal. */
export interface GlobalStats {
  globalAvgRating: number;
  maxInstalls: number;
  maxStars: number;
  maxFavorites: number;
  maxNetVotes: number;
}

/** The four precomputed leaderboard columns, ready for a single UPDATE. */
export interface ScoreUpdate {
  bayesian_rating: number;
  composite_score: number;
  trending_score: number;
  favorite_count: number;
}

/** Success rate assumed when a skill has no recorded usage yet. */
export const DEFAULT_SUCCESS_RATE = 0.5;

/**
 * Share of successful runs, or the neutral default when there is nothing to
 * divide by. A skill with zero usage is not a 0% skill.
 */
export function successRateFrom(aggregates?: SkillAggregates): number {
  if (!aggregates || !(aggregates.total_usage > 0)) return DEFAULT_SUCCESS_RATE;
  return aggregates.success_count / aggregates.total_usage;
}

/**
 * Build the four precomputed leaderboard columns for one skill.
 *
 * Pure: every input is a plain number or date, so it can be unit-tested without
 * a D1 or KV binding, and the caller decides how the row is written.
 */
export function buildScoreUpdate(input: {
  skill: ScoreInputs;
  aggregates?: SkillAggregates;
  globalStats: GlobalStats;
  maxTrendingRaw: number;
}): ScoreUpdate {
  const { skill, aggregates, globalStats, maxTrendingRaw } = input;

  const favoriteCount = aggregates?.fav_count ?? 0;

  const bayesianRating = computeBayesianRating(
    skill.avgRating ?? 0,
    skill.ratingCount ?? 0,
    globalStats.globalAvgRating,
  );

  const compositeScore = computeCompositeScore({
    bayesianRating,
    installCount: skill.installCount ?? 0,
    githubStars: skill.githubStars ?? 0,
    netVotes: skill.netVotes ?? 0,
    successRate: successRateFrom(aggregates),
    updatedAt: skill.updatedAt,
    favoriteCount,
    maxInstalls: globalStats.maxInstalls,
    maxStars: globalStats.maxStars,
    maxNetVotes: Math.max(globalStats.maxNetVotes, 1),
    maxFavorites: Math.max(globalStats.maxFavorites, 1),
  });

  const trendingScore = computeTrendingScore(
    aggregates?.recent_ratings ?? 0,
    aggregates?.recent_usage ?? 0,
    maxTrendingRaw,
  );

  return {
    bayesian_rating: bayesianRating,
    composite_score: compositeScore,
    trending_score: trendingScore,
    favorite_count: favoriteCount,
  };
}
