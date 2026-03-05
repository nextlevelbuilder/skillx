import { useState, useEffect, useRef, useCallback } from "react";
import { LeaderboardTable, type LeaderboardEntry } from "./leaderboard-table";
import { LeaderboardControls } from "./leaderboard-controls";
import { SkillPreviewModal } from "./skill-preview-modal";

const PAGE_SIZE = 20;

interface HomeLeaderboardProps {
  initialEntries: LeaderboardEntry[];
  initialHasMore: boolean;
  categories: string[];
  isAuthenticated?: boolean;
}

export function HomeLeaderboard({
  initialEntries,
  initialHasMore,
  categories,
  isAuthenticated = false,
}: HomeLeaderboardProps) {
  const [entries, setEntries] = useState(initialEntries);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [isLoading, setIsLoading] = useState(false);
  const [sort, setSort] = useState("best");
  const [category, setCategory] = useState("");
  const [previewEntry, setPreviewEntry] = useState<LeaderboardEntry | null>(null);

  // User interaction state (client-side overlay on KV-cached data)
  const [userFavorites, setUserFavorites] = useState<Set<string>>(new Set());
  const [userVotes, setUserVotes] = useState<Map<string, "up" | "down">>(new Map());
  const [interactionsLoaded, setInteractionsLoaded] = useState(false);

  const sentinelRef = useRef<HTMLDivElement>(null);
  const loadingRef = useRef(false);
  const hasMoreRef = useRef(initialHasMore);
  const entriesLengthRef = useRef(initialEntries.length);
  const sortRef = useRef("best");
  const categoryRef = useRef("");

  // Fetch user interactions for displayed entries
  const fetchInteractions = useCallback(async (slugs: string[]) => {
    if (!isAuthenticated || slugs.length === 0) return;
    try {
      const res = await fetch(`/api/user/interactions?slugs=${slugs.join(",")}`);
      if (!res.ok) return;
      const data = await res.json() as { favorites: string[]; votes: Record<string, "up" | "down"> };
      setUserFavorites((prev) => {
        const next = new Set(prev);
        for (const slug of data.favorites) next.add(slug);
        return next;
      });
      setUserVotes((prev) => {
        const next = new Map(prev);
        for (const [slug, type] of Object.entries(data.votes)) next.set(slug, type);
        return next;
      });
      setInteractionsLoaded(true);
    } catch {
      // Non-blocking — graceful degradation
    }
  }, [isAuthenticated]);

  // Fetch interactions on mount for initial entries
  useEffect(() => {
    if (isAuthenticated && !interactionsLoaded) {
      fetchInteractions(entries.map((e) => e.slug));
    }
  }, [isAuthenticated, interactionsLoaded, entries, fetchInteractions]);

  const fetchEntries = useCallback(async (
    sortMode: string,
    cat: string,
    offset: number,
    append: boolean,
  ) => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setIsLoading(true);

    try {
      const params = new URLSearchParams({
        sort: sortMode,
        offset: String(offset),
        limit: String(PAGE_SIZE),
      });
      if (cat) params.set("category", cat);

      const res = await fetch(`/api/leaderboard?${params}`);
      const data = await res.json() as { entries: LeaderboardEntry[]; hasMore: boolean };

      if (append) {
        setEntries((prev) => {
          const updated = [...prev, ...data.entries];
          entriesLengthRef.current = updated.length;
          return updated;
        });
      } else {
        setEntries(data.entries);
        entriesLengthRef.current = data.entries.length;
      }
      hasMoreRef.current = data.hasMore;
      setHasMore(data.hasMore);

      // Fetch interactions for new entries
      if (isAuthenticated && data.entries.length > 0) {
        fetchInteractions(data.entries.map((e) => e.slug));
      }
    } catch {
      // Silent fail — observer retries on next intersection
    } finally {
      loadingRef.current = false;
      setIsLoading(false);
    }
  }, [isAuthenticated, fetchInteractions]);

  const loadMore = useCallback(() => {
    if (!hasMoreRef.current || loadingRef.current) return;
    fetchEntries(sortRef.current, categoryRef.current, entriesLengthRef.current, true);
  }, [fetchEntries]);

  const handleSortChange = useCallback((newSort: string) => {
    setSort(newSort);
    sortRef.current = newSort;
    entriesLengthRef.current = 0;
    fetchEntries(newSort, categoryRef.current, 0, false);
  }, [fetchEntries]);

  const handleCategoryChange = useCallback((newCategory: string) => {
    setCategory(newCategory);
    categoryRef.current = newCategory;
    entriesLengthRef.current = 0;
    fetchEntries(sortRef.current, newCategory, 0, false);
  }, [fetchEntries]);

  // Optimistic vote handler
  const handleVote = useCallback(async (slug: string, type: "up" | "down" | "none") => {
    const prevVote = userVotes.get(slug) ?? null;
    const prevNetVotes = entries.find((e) => e.slug === slug)?.netVotes ?? 0;

    // Calculate delta
    let delta = 0;
    if (type === "none") {
      delta = prevVote === "up" ? -1 : prevVote === "down" ? 1 : 0;
    } else if (type === "up") {
      delta = prevVote === "down" ? 2 : prevVote === "up" ? 0 : 1;
    } else {
      delta = prevVote === "up" ? -2 : prevVote === "down" ? 0 : -1;
    }

    // Optimistic update
    setUserVotes((prev) => {
      const next = new Map(prev);
      if (type === "none") next.delete(slug);
      else next.set(slug, type);
      return next;
    });
    setEntries((prev) =>
      prev.map((e) => (e.slug === slug ? { ...e, netVotes: e.netVotes + delta } : e))
    );

    try {
      const res = await fetch(`/api/skills/${slug}/vote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      if (!res.ok) throw new Error("Vote failed");
    } catch {
      // Revert
      setUserVotes((prev) => {
        const next = new Map(prev);
        if (prevVote) next.set(slug, prevVote);
        else next.delete(slug);
        return next;
      });
      setEntries((prev) =>
        prev.map((e) => (e.slug === slug ? { ...e, netVotes: prevNetVotes } : e))
      );
    }
  }, [userVotes, entries]);

  // Optimistic favorite handler
  const handleFavoriteToggle = useCallback(async (slug: string) => {
    const wasFavorited = userFavorites.has(slug);

    // Optimistic update
    setUserFavorites((prev) => {
      const next = new Set(prev);
      if (wasFavorited) next.delete(slug);
      else next.add(slug);
      return next;
    });

    try {
      const res = await fetch(`/api/skills/${slug}/favorite`, { method: "POST" });
      if (!res.ok) throw new Error("Favorite failed");
    } catch {
      // Revert
      setUserFavorites((prev) => {
        const next = new Set(prev);
        if (wasFavorited) next.add(slug);
        else next.delete(slug);
        return next;
      });
    }
  }, [userFavorites]);

  const handleAuthRequired = useCallback(() => {
    window.location.href = `/api/auth/signin/github?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
  }, []);

  // Infinite scroll observer
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) loadMore();
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadMore]);

  return (
    <>
      <LeaderboardControls
        sort={sort}
        onSortChange={handleSortChange}
        category={category}
        onCategoryChange={handleCategoryChange}
        categories={categories}
      />

      <LeaderboardTable
        entries={entries}
        onPreview={setPreviewEntry}
        userFavorites={userFavorites}
        userVotes={userVotes}
        isAuthenticated={isAuthenticated}
        onVote={handleVote}
        onFavoriteToggle={handleFavoriteToggle}
        onAuthRequired={handleAuthRequired}
      />

      {previewEntry && (
        <SkillPreviewModal
          entry={previewEntry}
          onClose={() => setPreviewEntry(null)}
        />
      )}

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
    </>
  );
}
