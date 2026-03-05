import { useState, useEffect, useRef, useCallback } from "react";
import type { Route } from "./+types/leaderboard";
import { PageContainer } from "../components/layout/page-container";
import { FilterTabs } from "../components/filter-tabs";
import { LeaderboardTable } from "../components/leaderboard-table";
import type { LeaderboardEntry } from "../components/leaderboard-table";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { desc, sql } from "drizzle-orm";
import { getCached } from "~/lib/cache/kv-cache";

const PAGE_SIZE = 20;
const VALID_SORTS = ["best", "rating", "installs", "trending", "newest"];

function getOrderColumn(sort: string) {
  switch (sort) {
    case "best": return skills.composite_score;
    case "rating": return skills.bayesian_rating;
    case "installs": return skills.install_count;
    case "trending": return skills.trending_score;
    case "newest": return skills.created_at;
    default: return skills.composite_score;
  }
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const db = getDb(env.DB);
  const url = new URL(request.url);
  const rawSort = url.searchParams.get("sort") || "best";
  const sort = VALID_SORTS.includes(rawSort) ? rawSort : "best";
  const orderCol = getOrderColumn(sort);

  // Badge thresholds (top 10% cutoffs)
  const thresholds = await getCached(env.KV, "leaderboard:thresholds", 300, async () => {
    const [stats] = await db
      .select({
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

  const results = await getCached(
    env.KV,
    `leaderboard:v2:${sort}:0:${PAGE_SIZE}`,
    300,
    async () => {
      return db
        .select({
          slug: skills.slug,
          name: skills.name,
          author: skills.author,
          installs: skills.install_count,
          rating: skills.bayesian_rating,
          netVotes: skills.net_votes,
          trendingScore: skills.trending_score,
          favoriteCount: skills.favorite_count,
          updatedAt: skills.updated_at,
          bayesianRating: skills.bayesian_rating,
        })
        .from(skills)
        .orderBy(desc(orderCol))
        .limit(PAGE_SIZE + 1);
    },
  );

  const hasMore = results.length > PAGE_SIZE;
  const entries = (hasMore ? results.slice(0, PAGE_SIZE) : results).map(
    (e, i) => {
      const badges: string[] = [];
      if ((e.bayesianRating ?? 0) > 8.0) badges.push("top-rated");
      if ((e.installs ?? 0) >= thresholds.p90Installs && thresholds.p90Installs > 0) badges.push("popular");
      if ((e.trendingScore ?? 0) >= thresholds.p90Trending && thresholds.p90Trending > 0) badges.push("trending");
      if (e.updatedAt) {
        const daysSince = (Date.now() - new Date(e.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince <= 30) badges.push("well-maintained");
      }
      if ((e.favoriteCount ?? 0) >= thresholds.p90Favorites && thresholds.p90Favorites > 0) badges.push("community-pick");

      return {
        rank: i + 1,
        slug: e.slug,
        name: e.name,
        author: e.author,
        installs: e.installs || 0,
        rating: e.rating || 0,
        netVotes: e.netVotes || 0,
        badges,
      };
    },
  );

  return { entries, hasMore, sort };
}

export default function Leaderboard({ loaderData }: Route.ComponentProps) {
  const {
    entries: initialEntries,
    hasMore: initialHasMore,
    sort,
  } = loaderData;
  const [entries, setEntries] = useState<LeaderboardEntry[]>(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const loadingRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  const entriesLengthRef = useRef(initialEntries.length);

  // Reset state when loader data changes (tab change via URL navigation)
  const [prevSort, setPrevSort] = useState(sort);
  if (sort !== prevSort) {
    setPrevSort(sort);
    setEntries(initialEntries);
    setHasMore(initialHasMore);
    hasMoreRef.current = initialHasMore;
    entriesLengthRef.current = initialEntries.length;
  }

  const loadMore = useCallback(async () => {
    if (loadingRef.current || !hasMoreRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);

    try {
      const res = await fetch(
        `/api/leaderboard?sort=${sort}&offset=${entriesLengthRef.current}&limit=${PAGE_SIZE}`,
      );
      const data = (await res.json()) as {
        entries: LeaderboardEntry[];
        hasMore: boolean;
      };
      setEntries((prev) => {
        const updated = [...prev, ...data.entries];
        entriesLengthRef.current = updated.length;
        return updated;
      });
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);
    } catch {
      // Silently fail — user can scroll again to retry
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  const handleTabChange = (tab: string) => {
    const url = new URL(window.location.href);
    url.searchParams.set("sort", tab);
    window.location.href = url.toString();
  };

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="font-mono text-3xl font-bold">Leaderboard</h1>
        <p className="mt-2 text-sx-fg-muted">Top AI agent skills ranked by quality.</p>
      </div>

      <div className="mb-6">
        <FilterTabs activeTab={sort} onTabChange={handleTabChange} />
      </div>

      <LeaderboardTable entries={entries} />

      {/* Infinite scroll sentinel */}
      <div ref={sentinelRef} className="flex justify-center py-8">
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-sx-fg-muted">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-sx-border border-t-sx-accent" />
            Loading more...
          </div>
        )}
        {!hasMore && entries.length > 0 && (
          <p className="text-sm text-sx-fg-muted">All skills loaded.</p>
        )}
      </div>
    </PageContainer>
  );
}
