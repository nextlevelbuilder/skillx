/**
 * Bulk recompute composite scores for all skills with checkpoint/resume.
 * State persisted via KV so interrupted runs can resume from last batch.
 */

import { sql, eq } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import {
  computeBayesianRating,
  computeCompositeScore,
  computeTrendingScore,
} from "./leaderboard-scoring";
import {
  type RecomputeState,
  type RecomputeOptions,
  type RecomputeResult,
  loadState,
  saveState,
  clearState,
} from "./recompute-state";

export type { RecomputeState, RecomputeOptions, RecomputeResult };

/**
 * Recompute one batch of skills' composite scores.
 * Returns result with nextOffset (null if done).
 * Caller should loop batches (API handler calls once per request for streaming,
 * or script calls in loop).
 */
export async function recomputeBatch(
  db: Database,
  kv: KVNamespace,
  options: RecomputeOptions = {},
): Promise<RecomputeResult> {
  const batchSize = options.batchSize ?? 100;

  // Resolve starting offset: explicit > resume from KV > 0
  let savedState: RecomputeState | null = null;
  let offset: number;

  if (options.offset != null) {
    offset = options.offset;
  } else if (options.resume) {
    savedState = await loadState(kv);
    offset = savedState?.status === "running" ? savedState.offset : 0;
  } else {
    offset = 0;
  }

  // Count total skills (only on first batch)
  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(skills);
  const totalSkills = countResult.count;

  // Fetch global stats for normalization (once per batch is fine)
  const [globalStats] = await db
    .select({
      globalAvgRating: sql<number>`coalesce(avg(avg_rating), 0)`,
      maxInstalls: sql<number>`coalesce(max(install_count), 1)`,
      maxStars: sql<number>`coalesce(max(github_stars), 1)`,
      maxFavorites: sql<number>`coalesce(max(favorite_count), 1)`,
      maxNetVotes: sql<number>`coalesce(max(net_votes), 1)`,
    })
    .from(skills);

  // 7-day window for trending
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;

  // Max trending raw for normalization
  const [maxTrendingResult] = await db
    .select({
      maxRaw: sql<number>`coalesce(max(t.raw), 1)`,
    })
    .from(
      sql`(
        SELECT s.id,
          (SELECT count(*) FROM ratings r WHERE r.skill_id = s.id AND r.created_at > ${sevenDaysAgoMs}) * 2
          + (SELECT count(*) FROM usage_stats u WHERE u.skill_id = s.id AND u.created_at > ${sevenDaysAgoMs})
          AS raw
        FROM skills s
      ) t`,
    );

  // Fetch batch of skill IDs ordered deterministically
  const batch = await db
    .select({
      id: skills.id,
      avgRating: skills.avg_rating,
      ratingCount: skills.rating_count,
      installCount: skills.install_count,
      githubStars: skills.github_stars,
      netVotes: skills.net_votes,
      updatedAt: skills.updated_at,
    })
    .from(skills)
    .orderBy(skills.id)
    .limit(batchSize)
    .offset(offset);

  // Batch-fetch per-skill aggregates in one query (avoids N+1)
  const skillIds = batch.map((s) => s.id);

  interface SkillAggregates {
    skill_id: string;
    fav_count: number;
    recent_ratings: number;
    recent_usage: number;
    total_usage: number;
    success_count: number;
  }

  const perSkillStats: SkillAggregates[] = skillIds.length > 0
    ? (await db
        .select({
          skill_id: sql<string>`s.id`,
          fav_count: sql<number>`(SELECT count(*) FROM favorites f WHERE f.skill_id = s.id)`,
          recent_ratings: sql<number>`(SELECT count(*) FROM ratings r WHERE r.skill_id = s.id AND r.created_at > ${sevenDaysAgoMs})`,
          recent_usage: sql<number>`(SELECT count(*) FROM usage_stats u WHERE u.skill_id = s.id AND u.created_at > ${sevenDaysAgoMs})`,
          total_usage: sql<number>`(SELECT count(*) FROM usage_stats u WHERE u.skill_id = s.id)`,
          success_count: sql<number>`(SELECT count(*) FROM usage_stats u WHERE u.skill_id = s.id AND u.outcome = 'success')`,
        })
        .from(sql`skills s`)
        .where(sql`s.id IN (${sql.join(skillIds.map(id => sql`${id}`), sql`, `)})`))
    : [];

  const statsMap = new Map(perSkillStats.map((s) => [s.skill_id, s]));

  // Compute and update each skill
  for (const skill of batch) {
    const extra = statsMap.get(skill.id);
    const favoriteCount = extra?.fav_count ?? 0;
    const successRate =
      (extra?.total_usage ?? 0) > 0
        ? (extra?.success_count ?? 0) / extra!.total_usage
        : 0.5;

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
      successRate,
      updatedAt: skill.updatedAt,
      favoriteCount,
      maxInstalls: globalStats.maxInstalls,
      maxStars: globalStats.maxStars,
      maxNetVotes: Math.max(globalStats.maxNetVotes, 1),
      maxFavorites: Math.max(globalStats.maxFavorites, 1),
    });

    const trendingScore = computeTrendingScore(
      extra?.recent_ratings ?? 0,
      extra?.recent_usage ?? 0,
      maxTrendingResult.maxRaw,
    );

    await db
      .update(skills)
      .set({
        bayesian_rating: bayesianRating,
        composite_score: compositeScore,
        trending_score: trendingScore,
        favorite_count: favoriteCount,
      })
      .where(eq(skills.id, skill.id));
  }

  const newOffset = offset + batch.length;
  const isComplete = batch.length < batchSize;

  // Build state
  const state: RecomputeState = {
    offset: newOffset,
    totalProcessed: (savedState?.totalProcessed ?? 0) + batch.length,
    totalSkills: totalSkills,
    batchSize,
    startedAt: savedState?.startedAt ?? new Date().toISOString(),
    lastBatchAt: new Date().toISOString(),
    status: isComplete ? "completed" : "running",
  };

  // Persist or clear state
  if (isComplete) {
    await clearState(kv);
  } else {
    await saveState(kv, state);
  }

  return {
    processed: batch.length,
    total: totalSkills,
    nextOffset: isComplete ? null : newOffset,
    state,
  };
}

/** Get current recompute progress from KV */
export async function getRecomputeProgress(
  kv: KVNamespace,
): Promise<RecomputeState | null> {
  return loadState(kv);
}
