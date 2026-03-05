---
phase: 3
priority: high
status: pending
effort: M
depends_on: [2]
---

# Phase 3: API Routes — Triggers + Leaderboard Tabs

## Context

- Recompute fn from Phase 2: `apps/web/app/lib/leaderboard/recompute-skill-scores.ts`
- Current API routes: `apps/web/app/routes/api.skill-rate.ts`, `api.skill-favorite.ts`, `api.usage-report.ts`
- Leaderboard API: `apps/web/app/routes/api.leaderboard.ts`

## Overview

Add recomputation triggers to write APIs. Update leaderboard API to support 5 tab sort modes and return signal badges.

## Requirements

### Recomputation Triggers

Add `await recomputeSkillScores(db, skill.id)` after the existing write operations in:

**`api.skill-rate.ts`** — after updating `avg_rating`/`rating_count` (line ~89):
```ts
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";
// ... existing code ...
await recomputeSkillScores(db, skill.id);
```

**`api.skill-favorite.ts`** — after insert/delete favorite (line ~67):
```ts
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";
// ... existing code ...
await recomputeSkillScores(db, skill.id);
```

**`api.usage-report.ts`** — after inserting usage stat (line ~92):
```ts
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";
// ... existing code ...
await recomputeSkillScores(db, skill.id);
```

### Leaderboard API — `api.leaderboard.ts`

Update `?sort=` param to support 5 modes:

| Sort value | ORDER BY column | Fallback |
|---|---|---|
| `best` (default) | `composite_score` DESC | — |
| `rating` | `bayesian_rating` DESC | — |
| `installs` | `install_count` DESC | — |
| `trending` | `trending_score` DESC | — |
| `newest` | `created_at` DESC | — |

Add signal badges to response. Compute per-entry badges based on thresholds:

```ts
interface LeaderboardEntry {
  rank: number;
  slug: string;
  name: string;
  author: string;
  installs: number;
  rating: number;        // bayesian_rating for display
  badges: string[];      // e.g. ["top-rated", "popular", "trending"]
}
```

Badge logic (compute from query results + global thresholds):
- `top-rated`: `bayesian_rating > 8.0`
- `popular`: `install_count` in top 10% (precompute threshold from COUNT)
- `trending`: `trending_score > 0` and in top 10%
- `well-maintained`: `updated_at` within 30 days
- `community-pick`: `favorite_count` in top 10%

**Threshold query** (cached in KV 5min):

```sql
SELECT
  COUNT(*) as total,
  -- Use NTILE or percentile approximation
  install_count as p90_installs,
  trending_score as p90_trending,
  favorite_count as p90_favorites
FROM skills
ORDER BY install_count DESC
LIMIT 1 OFFSET (SELECT COUNT(*)/10 FROM skills)
```

Simpler approach: fetch top 10% cutoff values in a single query, cache them.

### Updated Select Fields

Add to the leaderboard query select:

```ts
.select({
  slug: skills.slug,
  name: skills.name,
  author: skills.author,
  installs: skills.install_count,
  rating: skills.bayesian_rating,  // was avg_rating
  compositeScore: skills.composite_score,
  trendingScore: skills.trending_score,
  favoriteCount: skills.favorite_count,
  updatedAt: skills.updated_at,
})
```

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/web/app/routes/api.skill-rate.ts` |
| Modify | `apps/web/app/routes/api.skill-favorite.ts` |
| Modify | `apps/web/app/routes/api.usage-report.ts` |
| Modify | `apps/web/app/routes/api.leaderboard.ts` |

## Implementation Steps

1. Add recompute import + call to `api.skill-rate.ts`
2. Add recompute import + call to `api.skill-favorite.ts`
3. Add recompute import + call to `api.usage-report.ts`
4. Rewrite `api.leaderboard.ts` sort mapping for 5 modes
5. Add badge threshold query (cached)
6. Add badge computation to entry mapping
7. Update select fields to include new columns
8. Run `pnpm typecheck`

## Success Criteria

- [ ] Rating, favorite, usage APIs trigger score recomputation
- [ ] Leaderboard API accepts `sort=best|rating|installs|trending|newest`
- [ ] Default sort is `best` (composite_score)
- [ ] Response includes `badges: string[]` per entry
- [ ] Badge thresholds cached in KV
- [ ] `pnpm typecheck` passes
