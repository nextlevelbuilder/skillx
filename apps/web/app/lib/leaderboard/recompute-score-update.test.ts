/**
 * The shared scoring step behind both recompute paths.
 *
 * These pin the four columns the two callers write, and the one behaviour that
 * is easy to regress while de-duplicating: a skill with no recorded usage is a
 * neutral 50%, not a 0% failure rate.
 */

import { describe, expect, it } from "vitest";
import {
  DEFAULT_SUCCESS_RATE,
  buildScoreUpdate,
  successRateFrom,
  type GlobalStats,
  type SkillAggregates,
} from "./recompute-score-update";

const globalStats: GlobalStats = {
  globalAvgRating: 6,
  maxInstalls: 1000,
  maxStars: 500,
  maxFavorites: 200,
  maxNetVotes: 50,
};

const skill = {
  avgRating: 8,
  ratingCount: 20,
  installCount: 100,
  githubStars: 40,
  netVotes: 5,
  updatedAt: new Date("2026-10-01T00:00:00Z"),
};

function aggregates(overrides: Partial<SkillAggregates> = {}): SkillAggregates {
  return {
    skill_id: "skill-1",
    fav_count: 7,
    recent_ratings: 4,
    recent_usage: 10,
    total_usage: 20,
    success_count: 15,
    ...overrides,
  };
}

describe("successRateFrom", () => {
  it("treats a skill with no usage as neutral instead of failed", () => {
    expect(successRateFrom(undefined)).toBe(DEFAULT_SUCCESS_RATE);
    expect(successRateFrom(aggregates({ total_usage: 0, success_count: 0 }))).toBe(
      DEFAULT_SUCCESS_RATE,
    );
  });

  it("divides successes by recorded usage", () => {
    expect(successRateFrom(aggregates({ total_usage: 20, success_count: 15 }))).toBe(0.75);
    expect(successRateFrom(aggregates({ total_usage: 4, success_count: 0 }))).toBe(0);
  });
});

describe("buildScoreUpdate", () => {
  it("returns the four precomputed columns", () => {
    const update = buildScoreUpdate({
      skill,
      aggregates: aggregates(),
      globalStats,
      maxTrendingRaw: 100,
    });

    expect(Object.keys(update).sort()).toEqual([
      "bayesian_rating",
      "composite_score",
      "favorite_count",
      "trending_score",
    ]);
    expect(update.favorite_count).toBe(7);
    expect(update.composite_score).toBeGreaterThan(0);
    expect(update.composite_score).toBeLessThanOrEqual(1);
    expect(update.trending_score).toBeGreaterThanOrEqual(0);
    expect(update.trending_score).toBeLessThanOrEqual(1);
  });

  it("carries the favourite count from the aggregate row, defaulting to zero", () => {
    expect(
      buildScoreUpdate({ skill, aggregates: aggregates(), globalStats, maxTrendingRaw: 100 })
        .favorite_count,
    ).toBe(7);
    expect(
      buildScoreUpdate({ skill, globalStats, maxTrendingRaw: 100 }).favorite_count,
    ).toBe(0);
  });

  it("reads missing skill columns as zero rather than NaN", () => {
    const update = buildScoreUpdate({
      skill: {
        avgRating: null,
        ratingCount: null,
        installCount: null,
        githubStars: null,
        netVotes: null,
        updatedAt: null,
      },
      globalStats,
      maxTrendingRaw: 100,
    });

    expect(Number.isNaN(update.bayesian_rating)).toBe(false);
    expect(Number.isNaN(update.composite_score)).toBe(false);
    expect(Number.isNaN(update.trending_score)).toBe(false);
    expect(update.favorite_count).toBe(0);
  });

  it("does not divide by a zero maximum", () => {
    const update = buildScoreUpdate({
      skill,
      aggregates: aggregates({ recent_ratings: 0, recent_usage: 0 }),
      globalStats: { ...globalStats, maxNetVotes: 0, maxFavorites: 0 },
      maxTrendingRaw: 0,
    });

    expect(update.trending_score).toBe(0);
    expect(Number.isFinite(update.composite_score)).toBe(true);
  });

  it("ranks a stronger skill above a weaker one", () => {
    const strong = buildScoreUpdate({
      skill: { ...skill, installCount: 900, githubStars: 400, netVotes: 40 },
      aggregates: aggregates({ fav_count: 180, total_usage: 100, success_count: 95 }),
      globalStats,
      maxTrendingRaw: 100,
    });
    const weak = buildScoreUpdate({
      skill: { ...skill, installCount: 1, githubStars: 0, netVotes: 0 },
      aggregates: aggregates({ fav_count: 0, total_usage: 10, success_count: 1 }),
      globalStats,
      maxTrendingRaw: 100,
    });

    expect(strong.composite_score).toBeGreaterThan(weak.composite_score);
  });

  it("pulls a low-sample rating toward the global mean", () => {
    const lowSample = buildScoreUpdate({
      skill: { ...skill, avgRating: 10, ratingCount: 1 },
      globalStats,
      maxTrendingRaw: 100,
    });
    const highSample = buildScoreUpdate({
      skill: { ...skill, avgRating: 10, ratingCount: 500 },
      globalStats,
      maxTrendingRaw: 100,
    });

    expect(lowSample.bayesian_rating).toBeLessThan(highSample.bayesian_rating);
    expect(lowSample.bayesian_rating).toBeGreaterThan(globalStats.globalAvgRating);
  });
});
