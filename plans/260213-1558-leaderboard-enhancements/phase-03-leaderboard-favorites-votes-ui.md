# Phase 3: Favorites Button + Vote Arrows + Auth Overlay

## Context

- [Favorite API](../../apps/web/app/routes/api.skill-favorite.ts) (toggle pattern)
- Vote API from Phase 1 (`api.skill-vote.ts`)
- [Leaderboard Table](../../apps/web/app/components/leaderboard-table.tsx)
- [Home Leaderboard](../../apps/web/app/components/home-leaderboard.tsx)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 3h
- **Description:** Add heart toggle for favorites and Reddit-style up/down vote arrows to leaderboard rows. Fetch user's existing favorites + votes on mount. Show login overlay for anonymous users.

## Key Insights

- KV-cached leaderboard data is shared across all users -- can't include per-user favorite/vote state
- Client-side overlay pattern: fetch user's favorites + votes in a single call on mount, merge with cached leaderboard entries
- Optimistic UI: update state immediately, revert on error — **must implement actual revert logic in catch block** (store prev state before optimistic update)
- Need new endpoint `/api/user/interactions` to batch-fetch user's favorites + votes for displayed skills
<!-- Red Team: Interaction Fetch Race on Scroll — 2026-02-13 -->
- **Scroll race:** When infinite scroll loads new entries, show loading skeleton on vote/favorite buttons until interaction fetch completes for new slugs. Prevents brief flash of default empty state.
- Existing favorite API works as-is; vote API from Phase 1 handles mutations

## Architecture

```
HomeLeaderboard (mount)
  |-- Fetch /api/user/interactions?slugs=a,b,c (if authenticated)
  |     Returns: { favorites: ["slug1"], votes: { "slug2": "up" } }
  |
  |-- LeaderboardTable
        |-- Row: Heart icon (filled if favorited)
        |-- Row: Vote arrows + net count (highlighted if voted)
        |-- Row: Click heart/arrow --> POST to existing API
        |-- Row: If not logged in --> show login overlay
```

## Related Code Files

### Files to Create
- `apps/web/app/routes/api.user-interactions.ts` -- batch fetch favorites + votes
- `apps/web/app/components/leaderboard-vote-controls.tsx` -- up/down arrows + count
- `apps/web/app/components/leaderboard-favorite-button.tsx` -- heart toggle

### Files to Modify
- `apps/web/app/routes.ts` -- register interactions route
- `apps/web/app/components/leaderboard-table.tsx` -- add vote + favorite columns, accept interaction props
- `apps/web/app/components/home-leaderboard.tsx` -- fetch interactions on mount, pass to table

## Implementation Steps

### Step 1: Batch interactions API

Create `apps/web/app/routes/api.user-interactions.ts`:

```ts
// GET /api/user/interactions?slugs=slug1,slug2,slug3
// Returns: { favorites: string[], votes: Record<string, 'up'|'down'> }
// 401 if not authenticated (frontend handles gracefully)

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, favorites, votes } from "~/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);
  if (!session?.user?.id) {
    return Response.json({ favorites: [], votes: {} });
  }

  const url = new URL(request.url);
  const slugsParam = url.searchParams.get("slugs") || "";
  const slugs = slugsParam.split(",").filter(Boolean).slice(0, 100); // cap at 100

  if (slugs.length === 0) {
    return Response.json({ favorites: [], votes: {} });
  }

  const db = getDb(env.DB);

  // Get skill IDs from slugs
  const skillRows = await db
    .select({ id: skills.id, slug: skills.slug })
    .from(skills)
    .where(inArray(skills.slug, slugs));

  const slugToId = new Map(skillRows.map((r) => [r.slug, r.id]));
  const idToSlug = new Map(skillRows.map((r) => [r.id, r.slug]));
  const skillIds = skillRows.map((r) => r.id);

  if (skillIds.length === 0) {
    return Response.json({ favorites: [], votes: {} });
  }

  // Parallel fetch
  const [favRows, voteRows] = await Promise.all([
    db.select({ skill_id: favorites.skill_id })
      .from(favorites)
      .where(and(eq(favorites.user_id, session.user.id), inArray(favorites.skill_id, skillIds))),
    db.select({ skill_id: votes.skill_id, vote_type: votes.vote_type })
      .from(votes)
      .where(and(eq(votes.user_id, session.user.id), inArray(votes.skill_id, skillIds))),
  ]);

  const userFavorites = favRows.map((r) => idToSlug.get(r.skill_id)).filter(Boolean);
  const userVotes: Record<string, string> = {};
  for (const row of voteRows) {
    const slug = idToSlug.get(row.skill_id);
    if (slug) userVotes[slug] = row.vote_type;
  }

  return Response.json({ favorites: userFavorites, votes: userVotes });
}
```

### Step 2: Register route

Add to `apps/web/app/routes.ts`:

```ts
route("api/user/interactions", "routes/api.user-interactions.ts"),
```

### Step 3: Create LeaderboardVoteControls component

Create `apps/web/app/components/leaderboard-vote-controls.tsx` (~55 LOC):

```tsx
import { ChevronUp, ChevronDown } from "lucide-react";

interface VoteControlsProps {
  slug: string;
  netVotes: number;
  userVote: "up" | "down" | null;
  onVote: (slug: string, type: "up" | "down" | "none") => void;
  isAuthenticated: boolean;
  onAuthRequired: () => void;
}

export function LeaderboardVoteControls({
  slug, netVotes, userVote, onVote, isAuthenticated, onAuthRequired,
}: VoteControlsProps) {
  const handleVote = (type: "up" | "down") => {
    if (!isAuthenticated) { onAuthRequired(); return; }
    // Toggle: if same vote, remove; else set
    onVote(slug, userVote === type ? "none" : type);
  };

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => handleVote("up")}
        className={`rounded p-0.5 transition-colors ${
          userVote === "up" ? "text-sx-accent" : "text-sx-fg-muted hover:text-sx-fg"
        }`}
        aria-label="Upvote"
      >
        <ChevronUp size={16} />
      </button>
      <span className="min-w-[2ch] text-center font-mono text-xs text-sx-fg-muted">
        {netVotes}
      </span>
      <button
        onClick={() => handleVote("down")}
        className={`rounded p-0.5 transition-colors ${
          userVote === "down" ? "text-red-400" : "text-sx-fg-muted hover:text-sx-fg"
        }`}
        aria-label="Downvote"
      >
        <ChevronDown size={16} />
      </button>
    </div>
  );
}
```

### Step 4: Create LeaderboardFavoriteButton component

Create `apps/web/app/components/leaderboard-favorite-button.tsx` (~40 LOC):

```tsx
import { Heart } from "lucide-react";

interface FavoriteButtonProps {
  slug: string;
  isFavorited: boolean;
  onToggle: (slug: string) => void;
  isAuthenticated: boolean;
  onAuthRequired: () => void;
}

export function LeaderboardFavoriteButton({
  slug, isFavorited, onToggle, isAuthenticated, onAuthRequired,
}: FavoriteButtonProps) {
  const handleClick = () => {
    if (!isAuthenticated) { onAuthRequired(); return; }
    onToggle(slug);
  };

  return (
    <button
      onClick={handleClick}
      className={`rounded p-1 transition-colors ${
        isFavorited ? "text-pink-400" : "text-sx-fg-muted hover:text-pink-400"
      }`}
      aria-label={isFavorited ? "Remove favorite" : "Add favorite"}
    >
      <Heart size={16} fill={isFavorited ? "currentColor" : "none"} />
    </button>
  );
}
```

### Step 5: Update LeaderboardTable

Modify `apps/web/app/components/leaderboard-table.tsx`:

1. Add new props:

```ts
interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  onPreview?: (entry: LeaderboardEntry) => void;
  // Interaction state (client-side overlay)
  userFavorites?: Set<string>;
  userVotes?: Map<string, "up" | "down">;
  isAuthenticated?: boolean;
  onVote?: (slug: string, type: "up" | "down" | "none") => void;
  onFavoriteToggle?: (slug: string) => void;
  onAuthRequired?: () => void;
}
```

2. Add Votes column header between Rating and Actions
3. Add Favorite + Vote controls in each row
4. Use `LeaderboardVoteControls` and `LeaderboardFavoriteButton` components

### Step 6: Update HomeLeaderboard with interaction logic

In `apps/web/app/components/home-leaderboard.tsx`:

1. Accept `isAuthenticated` prop from home page
2. On mount (if authenticated), fetch `/api/user/interactions?slugs=...` for displayed skill slugs
3. Re-fetch interactions when new page loads (append new slugs)
4. Store `userFavorites: Set<string>` and `userVotes: Map<string, 'up'|'down'>` in state
5. Implement optimistic handlers:

```ts
const handleVote = async (slug: string, type: "up" | "down" | "none") => {
  // Optimistic update
  setUserVotes((prev) => {
    const next = new Map(prev);
    if (type === "none") next.delete(slug);
    else next.set(slug, type);
    return next;
  });
  // Optimistic net_votes update
  setEntries((prev) => prev.map((e) => {
    if (e.slug !== slug) return e;
    // Calculate delta based on previous vote state
    // ...
    return { ...e, netVotes: e.netVotes + delta };
  }));

  // <!-- Red Team: Optimistic UI Revert — 2026-02-13 -->
  // Store previous state for revert
  const prevVote = userVotes.get(slug) ?? null;
  const prevNetVotes = entries.find(e => e.slug === slug)?.netVotes ?? 0;

  try {
    const res = await fetch(`/api/skills/${slug}/vote`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type }),
    });
    if (!res.ok) throw new Error("Vote failed");
  } catch {
    // Revert to previous state
    setUserVotes((prev) => {
      const next = new Map(prev);
      if (prevVote) next.set(slug, prevVote);
      else next.delete(slug);
      return next;
    });
    setEntries((prev) => prev.map((e) =>
      e.slug === slug ? { ...e, netVotes: prevNetVotes } : e
    ));
  }
};
```

6. Similar optimistic handler for `handleFavoriteToggle`

### Step 7: Auth overlay

When `onAuthRequired` fires, show a small toast/overlay:

```tsx
// <!-- Red Team: Auth Redirect Loses Context — 2026-02-13 -->
// Include callbackURL to return user to current page after OAuth
const handleAuthRequired = () => {
  window.location.href = `/api/auth/signin/github?callbackURL=${encodeURIComponent(window.location.pathname + window.location.search)}`;
};
```

Or show inline toast: "Sign in to vote" with link. Keep it simple for MVP.

### Step 8: Pass auth state from home page

In `apps/web/app/routes/home.tsx` loader, check session:

```ts
const session = await getSession(request, env).catch(() => null);
return { ..., isAuthenticated: !!session?.user };
```

Pass `isAuthenticated` to `<HomeLeaderboard>`.

## Todo List

- [x] Create `api.user-interactions.ts` (batch favorites + votes fetch)
- [x] Register `/api/user/interactions` in routes.ts
- [x] Create `leaderboard-vote-controls.tsx`
- [x] Create `leaderboard-favorite-button.tsx`
- [x] Add Votes column + Favorite button to `leaderboard-table.tsx`
- [x] Add interaction fetch + state management in `home-leaderboard.tsx`
- [x] Implement optimistic vote handler with **actual revert logic** (store prev state)
- [x] Implement optimistic favorite toggle with **actual revert logic**
- [x] Add loading skeleton for vote/favorite buttons on newly scrolled entries
- [x] Add auth check in home loader, pass `isAuthenticated` prop
- [x] Add auth-required handler (redirect to GitHub signin)
- [x] Re-fetch interactions when infinite scroll loads new entries
- [x] Run `pnpm typecheck`
- [x] Test: logged-in user can upvote, sees highlighted arrow
- [x] Test: logged-in user can favorite, sees filled heart
- [x] Test: anonymous user clicks vote, redirected to login
- [x] Test: vote toggle (up -> same up = remove)

## Success Criteria

- Heart icon toggles filled/unfilled state with optimistic UI
- Up/down arrows highlight user's current vote with colored state
- Net vote count updates instantly (optimistic)
- Anonymous users see all counts but get login redirect on interaction
- Interactions fetch uses batch endpoint (1 request for all visible slugs)
- No flicker on mount (interactions load async, overlay existing cached data)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Interaction fetch adds latency | Non-blocking; table renders immediately with default states |
| Optimistic revert flicker | Only revert on actual network error; rare case |
| Too many slugs in query param | Cap at 100; infinite scroll loads 20 at a time |
| Session check in home loader adds latency | Use `.catch(() => null)` for fast fallback |

## Security Considerations

- Interactions endpoint returns only current user's data (user_id from session)
- Slug list capped at 100 to prevent abuse
- Vote/favorite mutations go through their respective auth-checked endpoints
- No sensitive data exposed in interaction response (just slug + vote_type)
