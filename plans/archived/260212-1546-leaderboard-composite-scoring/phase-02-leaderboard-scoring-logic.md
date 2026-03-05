---
phase: 2
priority: critical
status: pending
effort: M
depends_on: [1]
---

# Phase 2: Leaderboard Scoring + Recompute Logic

## Context

- Brainstorm formula: `plans/reports/brainstorm-260212-1546-leaderboard-composite-scoring.md`
- Shared utils from Phase 1: `apps/web/app/lib/scoring-utils.ts`
- Schema (Phase 1): `apps/web/app/lib/db/schema.ts`

## Overview

Create scoring module with Bayesian average, composite score, and trending calculations. Create recomputation function that updates a single skill's precomputed columns.

## Requirements

### Leaderboard Scoring — NEW `apps/web/app/lib/leaderboard/leaderboard-scoring.ts`

**Bayesian Average:**

```ts
export function computeBayesianRating(
  avgRating: number,
  ratingCount: number,
  globalAvgRating: number,
  confidenceThreshold?: number // default 10
): number
// Formula: (C * m + avgRating * n) / (C + n)
```

**Composite Score:**

```ts
export interface CompositeInputs {
  bayesianRating: number;
  installCount: number;
  githubStars: number;
  successRate: number;
  updatedAt: Date | null;
  favoriteCount: number;
  // Max values for normalization (from global stats)
  maxInstalls: number;
  maxStars: number;
  maxFavorites: number;
}

export function computeCompositeScore(inputs: CompositeInputs): number
// Weights: bayesian 0.35, installs 0.25, stars 0.15, success 0.10, recency 0.10, favorites 0.05
```

**Trending Score:**

```ts
export function computeTrendingScore(
  recentRatings7d: number,
  recentUsage7d: number,
  maxTrendingRaw: number // for normalization
): number
// Formula: log-normalize((ratings_7d * 2) + usage_7d)
```

### Recompute Function — NEW `apps/web/app/lib/leaderboard/recompute-skill-scores.ts`

Single function that:
1. Queries global stats (avg rating, max installs, max stars, max favorites, max trending)
2. Queries skill-specific stats (avg_rating, rating_count, favorite_count, 7d ratings, 7d usage, success_rate)
3. Computes bayesian_rating, composite_score, trending_score
4. Updates the skill's precomputed columns in one UPDATE

```ts
export async function recomputeSkillScores(
  db: DrizzleD1Database,
  skillId: string
): Promise<void>
```

**Global stats query** (for normalization max values):

```sql
SELECT
  AVG(avg_rating) as global_avg_rating,
  MAX(install_count) as max_installs,
  MAX(github_stars) as max_stars,
  MAX(favorite_count) as max_favorites
FROM skills
```

**Skill-specific stats:**

```sql
-- Favorite count
SELECT COUNT(*) FROM favorites WHERE skill_id = ?

-- 7-day ratings count
SELECT COUNT(*) FROM ratings WHERE skill_id = ? AND created_at > (now - 7 days)

-- 7-day usage count
SELECT COUNT(*) FROM usage_stats WHERE skill_id = ? AND created_at > (now - 7 days)

-- Success rate
SELECT
  COUNT(CASE WHEN outcome = 'success' THEN 1 END)::float / NULLIF(COUNT(*), 0)
FROM usage_stats WHERE skill_id = ?
```

## Related Code Files

| Action | File |
|--------|------|
| Create | `apps/web/app/lib/leaderboard/leaderboard-scoring.ts` |
| Create | `apps/web/app/lib/leaderboard/recompute-skill-scores.ts` |
| Read | `apps/web/app/lib/scoring-utils.ts` (from Phase 1) |
| Read | `apps/web/app/lib/db/schema.ts` |

## Implementation Steps

1. Create `apps/web/app/lib/leaderboard/` directory
2. Implement `leaderboard-scoring.ts` with 3 pure functions
3. Implement `recompute-skill-scores.ts` with DB queries + score computation
4. Run `pnpm typecheck`

## Success Criteria

- [ ] `computeBayesianRating()` pulls low-sample ratings toward global mean
- [ ] `computeCompositeScore()` returns 0-1 range
- [ ] `computeTrendingScore()` uses 7-day window
- [ ] `recomputeSkillScores()` updates all 4 precomputed columns
- [ ] All functions are pure (except recompute which takes db)
- [ ] `pnpm typecheck` passes
