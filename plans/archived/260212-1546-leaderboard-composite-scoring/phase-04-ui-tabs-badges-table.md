---
phase: 4
priority: high
status: pending
effort: M
depends_on: [3]
---

# Phase 4: UI — FilterTabs, Signal Badges, Table Updates

## Context

- Current FilterTabs: `apps/web/app/components/filter-tabs.tsx` (cosmetic, not wired)
- Leaderboard table: `apps/web/app/components/leaderboard-table.tsx`
- Leaderboard page: `apps/web/app/routes/leaderboard.tsx`
- Home page leaderboard: `apps/web/app/components/home-leaderboard.tsx`
- Home loader: `apps/web/app/routes/home.tsx`

## Overview

Wire FilterTabs to real sort modes via URL params. Create signal badge component. Update leaderboard table to show badges. Update home page to use composite_score.

## Requirements

### FilterTabs — Modify `apps/web/app/components/filter-tabs.tsx`

Replace cosmetic tabs with real sort-linked tabs:

```ts
const TABS = [
  { id: "best", label: "Best" },
  { id: "rating", label: "Top Rated" },
  { id: "installs", label: "Most Installed" },
  { id: "trending", label: "Trending" },
  { id: "newest", label: "Newest" },
];
```

`onTabChange` should update `?sort=` URL param (same pattern as existing `handleSort` in leaderboard.tsx, but now for tabs instead of column headers).

### Signal Badge — NEW `apps/web/app/components/signal-badge.tsx`

Small pill/tag component. Styling per badge type:

```ts
interface SignalBadgeProps {
  type: "top-rated" | "popular" | "trending" | "well-maintained" | "community-pick";
}
```

| Badge | Label | Color (mint accent variants) |
|---|---|---|
| `top-rated` | Top Rated | `bg-yellow-500/10 text-yellow-400` |
| `popular` | Popular | `bg-sx-accent-muted text-sx-accent` |
| `trending` | Trending | `bg-orange-500/10 text-orange-400` |
| `well-maintained` | Maintained | `bg-blue-500/10 text-blue-400` |
| `community-pick` | Community Pick | `bg-pink-500/10 text-pink-400` |

Keep it simple: rounded pill, mono text, small font.

### Leaderboard Table — Modify `apps/web/app/components/leaderboard-table.tsx`

1. Add `badges` to `LeaderboardEntry` interface:
   ```ts
   badges?: string[];
   ```

2. Render badges inline next to skill name:
   ```tsx
   <td>
     <Link ...>{entry.name}</Link>
     {entry.badges?.map(b => <SignalBadge key={b} type={b} />)}
   </td>
   ```

3. Remove column header sort buttons (sorting now controlled by FilterTabs). Keep column headers as static labels.

### Leaderboard Page — Modify `apps/web/app/routes/leaderboard.tsx`

1. Update loader: default sort to `best`, select `bayesian_rating` as `rating`
2. Wire `FilterTabs` `onTabChange` to URL navigation (`?sort=` param)
3. Remove `handleSort` column-header function (replaced by tabs)
4. Pass `activeTab` from `sort` URL param (sync state)
5. Update `loadMore` fetch URL to use current tab's sort value

### Home Page — Modify `apps/web/app/routes/home.tsx`

1. Change home leaderboard sort from `install_count` to `composite_score`:
   ```ts
   .orderBy(desc(skills.composite_score))
   ```
2. Update KV cache key to `leaderboard:page:best:0:${PAGE_SIZE}`

### Home Leaderboard — Modify `apps/web/app/components/home-leaderboard.tsx`

1. Update `loadMore` fetch URL from `sort=installs` to `sort=best`

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/web/app/components/filter-tabs.tsx` |
| Create | `apps/web/app/components/signal-badge.tsx` |
| Modify | `apps/web/app/components/leaderboard-table.tsx` |
| Modify | `apps/web/app/routes/leaderboard.tsx` |
| Modify | `apps/web/app/routes/home.tsx` |
| Modify | `apps/web/app/components/home-leaderboard.tsx` |

## Implementation Steps

1. Update `filter-tabs.tsx` with 5 real tabs
2. Create `signal-badge.tsx` component
3. Add `badges` to `leaderboard-table.tsx` entry interface + render
4. Remove column-header sort from leaderboard table
5. Update `leaderboard.tsx` loader (default `best`, wire tabs to URL)
6. Update `home.tsx` loader to sort by `composite_score`
7. Update `home-leaderboard.tsx` loadMore to `sort=best`
8. Run `pnpm typecheck`

## Success Criteria

- [ ] FilterTabs wired to `?sort=` URL param
- [ ] Tab selection persists across page loads
- [ ] Signal badges render next to skill names
- [ ] Home page sorts by composite_score
- [ ] No column-header sort UI (tabs handle sorting)
- [ ] `pnpm typecheck` passes
