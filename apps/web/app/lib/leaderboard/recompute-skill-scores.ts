/**
 * Recomputes a single skill's precomputed leaderboard columns:
 * bayesian_rating, composite_score, trending_score, favorite_count.
 * Called inline after rating/favorite/usage write events.
 */

import { eq, sql, and, gt } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { skills, ratings, favorites, usageStats } from "~/lib/db/schema";
import {
  computeBayesianRating,
  computeCompositeScore,
  computeTrendingScore,
} from "./leaderboard-scoring";

/** Recompute all precomputed score columns for a single skill */
export async function recomputeSkillScores(
  db: Database,
  skillId: string,
): Promise<void> {
  // 1. Global stats for normalization
  const [globalStats] = await db
    .select({
      globalAvgRating: sql<number>`coalesce(avg(avg_rating), 0)`,
      maxInstalls: sql<number>`coalesce(max(install_count), 1)`,
      maxStars: sql<number>`coalesce(max(github_stars), 1)`,
      maxFavorites: sql<number>`coalesce(max(favorite_count), 1)`,
      maxNetVotes: sql<number>`coalesce(max(net_votes), 1)`,
    })
    .from(skills);

  // 2. Skill-specific data
  const [skill] = await db
    .select({
      avgRating: skills.avg_rating,
      ratingCount: skills.rating_count,
      installCount: skills.install_count,
      githubStars: skills.github_stars,
      netVotes: skills.net_votes,
      updatedAt: skills.updated_at,
    })
    .from(skills)
    .where(eq(skills.id, skillId));

  if (!skill) return;

  // 3. Favorite count for this skill
  const [favResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(favorites)
    .where(eq(favorites.skill_id, skillId));

  const favoriteCount = favResult?.count ?? 0;

  // 4. 7-day window for trending (ms timestamp for raw SQL, Date for typed gt())
  const sevenDaysAgoMs = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const sevenDaysAgo = new Date(sevenDaysAgoMs);

  const [recentRatings] = await db
    .select({ count: sql<number>`count(*)` })
    .from(ratings)
    .where(
      and(eq(ratings.skill_id, skillId), gt(ratings.created_at, sevenDaysAgo)),
    );

  const [recentUsage] = await db
    .select({ count: sql<number>`count(*)` })
    .from(usageStats)
    .where(
      and(
        eq(usageStats.skill_id, skillId),
        gt(usageStats.created_at, sevenDaysAgo),
      ),
    );

  // 5. Success rate from all-time usage
  const [successData] = await db
    .select({
      total: sql<number>`count(*)`,
      successes: sql<number>`count(case when outcome = 'success' then 1 end)`,
    })
    .from(usageStats)
    .where(eq(usageStats.skill_id, skillId));

  const successRate =
    successData.total > 0 ? successData.successes / successData.total : 0.5;

  // 6. Max trending raw across all skills (for normalization)
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

  // 7. Compute scores
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
    recentRatings?.count ?? 0,
    recentUsage?.count ?? 0,
    maxTrendingResult.maxRaw,
  );

  // 8. Single UPDATE
  await db
    .update(skills)
    .set({
      bayesian_rating: bayesianRating,
      composite_score: compositeScore,
      trending_score: trendingScore,
      favorite_count: favoriteCount,
    })
    .where(eq(skills.id, skillId));
}
