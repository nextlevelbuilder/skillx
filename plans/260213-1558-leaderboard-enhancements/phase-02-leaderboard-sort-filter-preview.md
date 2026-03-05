# Phase 2: Sort/Filter Controls + Author Link + Preview Modal

## Context

- [Leaderboard Table](../../apps/web/app/components/leaderboard-table.tsx) (117 LOC)
- [Home Leaderboard](../../apps/web/app/components/home-leaderboard.tsx) (95 LOC)
- [Leaderboard API](../../apps/web/app/routes/api.leaderboard.ts) (136 LOC)
- [Home Page](../../apps/web/app/routes/home.tsx) (176 LOC)
- [Signal Badge](../../apps/web/app/components/signal-badge.tsx)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 3h
- **Description:** Add sort tabs, category filter dropdown, clickable GitHub author links, and a preview modal to the leaderboard. Expand API to return `description`, `category`, `net_votes` fields.

## Key Insights

- Leaderboard API already supports 5 sort modes but UI hardcodes `sort=best`
- API does NOT return `description` or `category` -- need to add for preview modal
- API does NOT return `net_votes` -- need to add for vote display (Phase 3)
- Author field maps directly to GitHub username (SkillsMP convention)
- Category list can be derived from a distinct query in home loader or API
- Changing sort/filter must reset entries list + offset in infinite scroll

## Architecture

```
Home Page
  |
  HomeLeaderboard (manages sort, category state + infinite scroll)
    |-- LeaderboardControls (sort tabs + category dropdown)
    |-- LeaderboardTable (rows with author link)
    |-- SkillPreviewModal (triggered by eye icon in row)
```

- Sort/category state lives in `HomeLeaderboard`, passed as params to API calls
- State change resets entries array and offset to 0
- Preview modal receives entry data (already in API response), no extra fetch

## Related Code Files

### Files to Create
- `apps/web/app/components/leaderboard-controls.tsx` -- sort tabs + category filter
- `apps/web/app/components/skill-preview-modal.tsx` -- preview popup

### Files to Modify
- `apps/web/app/routes/api.leaderboard.ts` -- add `description`, `category`, `net_votes` to select; add `category` filter param
- `apps/web/app/components/home-leaderboard.tsx` -- add sort/category state, pass to controls and API calls, reset on change
- `apps/web/app/components/leaderboard-table.tsx` -- add author GitHub link, add preview button, expand `LeaderboardEntry` interface
- `apps/web/app/routes/home.tsx` -- pass category list to HomeLeaderboard; add `description`, `category` to SSR leaderboard query

## Implementation Steps

### Step 1: Expand leaderboard API

In `apps/web/app/routes/api.leaderboard.ts`:

1. Add `category` query param with WHERE filter:

```ts
const category = url.searchParams.get("category") || "";

// In the select, add:
description: skills.description,
category: skills.category,
netVotes: skills.net_votes,

// After .orderBy(), before .limit():
// Build WHERE clause
const conditions = [];
if (category) {
  conditions.push(eq(skills.category, category));
}
// Apply: .where(conditions.length ? and(...conditions) : undefined)
```

2. Include new fields in entry mapping:

```ts
entries.map((e, i) => ({
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
}));
```

<!-- Red Team: Unvalidated Category in Cache Key — 2026-02-13 -->
3. Update KV cache key to include category: `leaderboard:v3:${sort}:${category}:${offset}:${limit}`
   - **Validate category:** Before caching, verify category exists in the known categories list (or cap to 50 chars). If unknown category, skip KV caching and return empty result. Prevents cache key pollution from arbitrary strings.

### Step 2: Update home page SSR loader

In `apps/web/app/routes/home.tsx`:

1. Add `description` and `category` to the leaderboard SSR select query
2. Fetch distinct categories for filter dropdown:

```ts
const categories = await getCached(env.KV, "categories:distinct", 300, async () => {
  const rows = await db
    .selectDistinct({ category: skills.category })
    .from(skills)
    .orderBy(skills.category);
  return rows.map((r) => r.category);
});
```

3. Pass `categories` to component props

### Step 3: Create LeaderboardControls component

Create `apps/web/app/components/leaderboard-controls.tsx` (~60 LOC):

```tsx
interface LeaderboardControlsProps {
  sort: string;
  onSortChange: (sort: string) => void;
  category: string;
  onCategoryChange: (category: string) => void;
  categories: string[];
}

const SORT_OPTIONS = [
  { value: "best", label: "Best" },
  { value: "rating", label: "Rating" },
  { value: "installs", label: "Installs" },
  { value: "trending", label: "Trending" },
  { value: "newest", label: "Newest" },
];

export function LeaderboardControls({ sort, onSortChange, category, onCategoryChange, categories }: LeaderboardControlsProps) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3">
      {/* Sort tabs */}
      <div className="flex gap-1 rounded-lg border border-sx-border bg-sx-bg-elevated p-1">
        {SORT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => onSortChange(opt.value)}
            className={`rounded-md px-3 py-1.5 font-mono text-xs transition-colors ${
              sort === opt.value
                ? "bg-sx-accent text-sx-bg font-bold"
                : "text-sx-fg-muted hover:text-sx-fg"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Category filter */}
      <select
        value={category}
        onChange={(e) => onCategoryChange(e.target.value)}
        className="rounded-lg border border-sx-border bg-sx-bg-elevated px-3 py-1.5 font-mono text-xs text-sx-fg"
      >
        <option value="">All Categories</option>
        {categories.map((c) => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    </div>
  );
}
```

### Step 4: Create SkillPreviewModal component

Create `apps/web/app/components/skill-preview-modal.tsx` (~80 LOC):

```tsx
import { X } from "lucide-react";
import { Link } from "react-router";
import { RatingBadge } from "./rating-badge";

interface SkillPreviewModalProps {
  entry: {
    slug: string;
    name: string;
    author: string;
    description: string;
    category: string;
    installs: number;
    rating: number;
    netVotes: number;
  };
  onClose: () => void;
}

export function SkillPreviewModal({ entry, onClose }: SkillPreviewModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="mx-4 w-full max-w-lg rounded-xl border border-sx-border bg-sx-bg-elevated p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <h3 className="text-lg font-bold text-sx-fg">{entry.name}</h3>
          <button onClick={onClose} className="text-sx-fg-muted hover:text-sx-fg">
            <X size={20} />
          </button>
        </div>

        <p className="mt-1 text-sm text-sx-fg-muted">
          by <a href={`https://github.com/${entry.author}`} target="_blank" rel="noopener noreferrer" className="text-sx-accent hover:underline">{entry.author}</a>
        </p>

        <span className="mt-2 inline-block rounded-full bg-sx-bg px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-sx-fg-muted border border-sx-border">
          {entry.category}
        </span>

        <p className="mt-3 text-sm leading-relaxed text-sx-fg">{entry.description}</p>

        <div className="mt-4 flex items-center gap-4 text-sm">
          <span className="font-mono text-sx-fg-muted">{formatNumber(entry.installs)} installs</span>
          <RatingBadge score={entry.rating} />
          <span className="font-mono text-sx-fg-muted">{entry.netVotes} votes</span>
        </div>

        <Link
          to={`/skills/${entry.slug}`}
          className="mt-4 inline-flex w-full items-center justify-center rounded-lg bg-sx-accent py-2 text-sm font-bold text-sx-bg hover:opacity-90"
        >
          View Full Details
        </Link>
      </div>
    </div>
  );
}
```

### Step 5: Update HomeLeaderboard

In `apps/web/app/components/home-leaderboard.tsx`:

1. Add `sort` and `category` state (default `"best"` and `""`)
2. Accept `categories: string[]` prop
3. On sort/category change: reset entries, offset, call API with new params
4. Update `loadMore` to use current sort + category in fetch URL
5. Render `<LeaderboardControls>` above table

```ts
const [sort, setSort] = useState("best");
const [category, setCategory] = useState("");

// Reset on sort/category change
const handleSortChange = (newSort: string) => {
  setSort(newSort);
  resetAndFetch(newSort, category);
};
const handleCategoryChange = (newCategory: string) => {
  setCategory(newCategory);
  resetAndFetch(sort, newCategory);
};

// Update loadMore URL:
const url = `/api/leaderboard?sort=${sort}&category=${encodeURIComponent(category)}&offset=${offset}&limit=${PAGE_SIZE}`;
```

### Step 6: Update LeaderboardTable

In `apps/web/app/components/leaderboard-table.tsx`:

<!-- Updated: Validation Session 1 - netVotes shown as table column -->
1. Expand `LeaderboardEntry` interface with `description`, `category`, `netVotes`
   - `netVotes` should be displayed as a visible table column (between Rating and Actions), not hidden in modal only
<!-- Red Team: Author GitHub Assumption — 2026-02-13 -->
2. Make author a GitHub link (only if valid GitHub username pattern):

```tsx
const isGitHubUsername = (name: string) => /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(name);

<td className="px-4 py-3 text-sm">
  {isGitHubUsername(entry.author) ? (
    <a
      href={`https://github.com/${entry.author}`}
      target="_blank"
      rel="noopener noreferrer"
      className="text-sx-fg-muted hover:text-sx-accent"
    >
      {entry.author}
    </a>
  ) : (
    <span className="text-sx-fg-muted">{entry.author}</span>
  )}
</td>
```

3. Add Eye icon button in Actions column that calls `onPreview(entry)` callback
4. Accept `onPreview` prop from parent

### Step 7: Wire preview modal in HomeLeaderboard

```tsx
const [previewEntry, setPreviewEntry] = useState<LeaderboardEntry | null>(null);

// In render:
<LeaderboardTable entries={entries} onPreview={setPreviewEntry} />
{previewEntry && <SkillPreviewModal entry={previewEntry} onClose={() => setPreviewEntry(null)} />}
```

## Todo List

- [x] Add `description`, `category`, `net_votes` to leaderboard API select
- [x] Add `category` filter param to leaderboard API
- [x] Update cache key version to v3
- [x] Add distinct categories query to home loader
- [x] Create `leaderboard-controls.tsx` (sort tabs + category dropdown)
- [x] Create `skill-preview-modal.tsx` (preview popup)
- [x] Update `home-leaderboard.tsx` with sort/category state + reset logic
- [x] Update `LeaderboardEntry` interface with new fields
- [x] Make author column clickable GitHub link
- [x] Add preview (Eye) button in Actions column
- [x] Wire preview modal state in HomeLeaderboard
- [x] Pass categories prop from home page to HomeLeaderboard
- [x] Add category validation before KV cache key insertion
- [x] Add `isGitHubUsername` guard on author link
- [x] Run `pnpm typecheck`
- [x] Test: sort tabs switch API calls and reset list
- [x] Test: category filter narrows results
- [x] Test: author link opens GitHub in new tab
- [x] Test: preview modal opens/closes correctly

## Success Criteria

- Sort tabs switch between all 5 modes; list resets on change
- Category dropdown filters skills; "All" shows unfiltered
- Author name links to `https://github.com/{author}` with external tab
- Preview modal shows name, author, description, category, rating, installs, votes
- Infinite scroll works with dynamic sort + category params
- No extra API call for preview (data already in leaderboard response)

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Sort/filter reset flicker | Show loading spinner during fetch |
| Category list too long | Cap at first 50 categories; sorted alphabetically |
| Preview modal blocks scroll | Use `fixed` overlay with backdrop close |
| Cache key explosion with category | Categories are finite (~20); 5-min TTL keeps volume manageable |

## Security Considerations

- Author link uses `rel="noopener noreferrer"` to prevent tab-napping
- Category param sanitized by exact match in WHERE clause (no injection)
- Preview modal uses no-fetch pattern (data from existing API response)
