/**
 * Paginated leaderboard API endpoint with composite scoring.
 * GET /api/leaderboard?sort=best|rating|installs|trending|newest&offset=0&limit=20
 * Returns { entries, hasMore }
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getCached } from "~/lib/cache/kv-cache";

const MAX_LIMIT = 50;
const VALID_SORTS = ["best", "rating", "installs", "trending", "newest"] as const;
type SortMode = (typeof VALID_SORTS)[number];

/** Map sort mode to ORDER BY column */
function getOrderColumn(sort: SortMode) {
  switch (sort) {
    case "best": return skills.composite_score;
    case "rating": return skills.bayesian_rating;
    case "installs": return skills.install_count;
    case "trending": return skills.trending_score;
    case "newest": return skills.created_at;
  }
}

/** Compute signal badges for a leaderboard entry */
function computeBadges(
  entry: {
    bayesianRating: number | null;
    installs: number | null;
    trendingScore: number | null;
    favoriteCount: number | null;
    updatedAt: Date | null;
  },
  thresholds: {
    p90Installs: number;
    p90Trending: number;
    p90Favorites: number;
  },
): string[] {
  const badges: string[] = [];
  if ((entry.bayesianRating ?? 0) > 8.0) badges.push("top-rated");
  if ((entry.installs ?? 0) >= thresholds.p90Installs && thresholds.p90Installs > 0)
    badges.push("popular");
  if ((entry.trendingScore ?? 0) >= thresholds.p90Trending && thresholds.p90Trending > 0)
    badges.push("trending");
  if (entry.updatedAt) {
    const daysSince = (Date.now() - new Date(entry.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSince <= 30) badges.push("well-maintained");
  }
  if ((entry.favoriteCount ?? 0) >= thresholds.p90Favorites && thresholds.p90Favorites > 0)
    badges.push("community-pick");
  return badges;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const url = new URL(request.url);

  const rawSort = url.searchParams.get("sort") || "best";
  const sort: SortMode = VALID_SORTS.includes(rawSort as SortMode)
    ? (rawSort as SortMode)
    : "best";
  const offset = Math.max(
    0,
    parseInt(url.searchParams.get("offset") || "0", 10),
  );
  const limit = Math.min(
    Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)),
    MAX_LIMIT,
  );

  // Category filter with validation (cap at 50 chars, prevent cache key pollution)
  const rawCategory = url.searchParams.get("category") || "";
  const category = rawCategory.length <= 50 ? rawCategory : "";

  const cacheKey = `leaderboard:v3:${sort}:${category}:${offset}:${limit}`;

  // Badge thresholds (top 10% cutoffs), cached separately
  const thresholds = await getCached(env.KV, "leaderboard:thresholds", 300, async () => {
    const [stats] = await db
      .select({
        total: sql<number>`count(*)`,
        p90Installs: sql<number>`coalesce((
          SELECT install_count FROM skills ORDER BY install_count DESC
          LIMIT 1 OFFSET max(1, (SELECT count(*) FROM skills) / 10)
        ), 0)`,
        p90Trending: sql<number>`coalesce((
          SELECT trending_score FROM skills ORDER BY trending_score DESC
          LIMIT 1 OFFSET max(1, (SELECT count(*) FROM skills) / 10)
        ), 0)`,
        p90Favorites: sql<number>`coalesce((
          SELECT favorite_count FROM skills ORDER BY favorite_count DESC
          LIMIT 1 OFFSET max(1, (SELECT count(*) FROM skills) / 10)
        ), 0)`,
      })
      .from(skills);
    return stats;
  });

  const orderCol = getOrderColumn(sort);

  const results = await getCached(env.KV, cacheKey, 300, async () => {
    let query = db
      .select({
        slug: skills.slug,
        name: skills.name,
        author: skills.author,
        description: skills.description,
        category: skills.category,
        installs: skills.install_count,
        rating: skills.bayesian_rating,
        netVotes: skills.net_votes,
        trendingScore: skills.trending_score,
        favoriteCount: skills.favorite_count,
        updatedAt: skills.updated_at,
        bayesianRating: skills.bayesian_rating,
      })
      .from(skills)
      .$dynamic();

    if (category) {
      query = query.where(eq(skills.category, category));
    }

    return query
      .orderBy(desc(orderCol))
      .limit(limit + 1)
      .offset(offset);
  });

  const hasMore = results.length > limit;
  const entries = (hasMore ? results.slice(0, limit) : results).map(
    (e, i) => ({
      rank: offset + i + 1,
      slug: e.slug,
      name: e.name,
      author: e.author,
      description: e.description,
      category: e.category,
      installs: e.installs || 0,
      rating: e.rating || 0,
      netVotes: e.netVotes || 0,
      badges: computeBadges(e, thresholds),
    }),
  );

  return Response.json({ entries, hasMore });
}
