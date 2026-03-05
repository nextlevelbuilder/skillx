---
phase: 3
priority: high
status: pending
effort: 1-2h
depends_on: [2]
---

# Phase 3: Expanded Boost Formula

## Overview

Add github_stars, success_rate, and recency decay to boost scoring. Reweight all 7 signals: 50% RRF, 15% rating, 10% stars, 8% usage, 7% success rate, 5% recency, 5% favorite.

## Key Insights

- `github_stars` column exists in schema but unused in scoring
- `usage_stats.outcome` tracks success/failure/partial — actual quality signal
- `updated_at` available for recency decay — prevents stale skills dominating
- Reducing favorite from 10→5% fixes authenticated/anonymous scoring asymmetry

## Related Code Files

- **Modify**: `apps/web/app/lib/search/boost-scoring.ts` — new weights, new stats fields
- **Modify**: `apps/web/app/lib/search/hybrid-search.ts` — expand `fetchSkillStats` to include stars, success rate, updated_at

## Implementation Steps

### Step 1: Expand `SkillStats` interface in `boost-scoring.ts`

```ts
export interface SkillStats {
  avg_rating: number;
  usage_count: number;
  github_stars: number;       // NEW
  success_rate: number;       // NEW: 0-1 ratio
  updated_at: Date | null;    // NEW: for recency decay
  is_favorited: boolean;
}
```

### Step 2: Expand `BoostedResult` interface in `boost-scoring.ts`

```ts
export interface BoostedResult {
  skill_id: string;
  final_score: number;
  rrf_score: number;
  rating_boost: number;
  usage_boost: number;
  stars_boost: number;        // NEW
  success_boost: number;      // NEW
  recency_boost: number;      // NEW
  favorite_boost: number;
  semantic_rank: number | null;
  keyword_rank: number | null;
}
```

### Step 3: Add recency decay helper in `boost-scoring.ts`

```ts
/** Exponential recency decay. Half-life ~140 days (lambda=0.005). */
function recencyScore(updatedAt: Date | null): number {
  if (!updatedAt) return 0;
  const daysSinceUpdate = (Date.now() - updatedAt.getTime()) / (1000 * 60 * 60 * 24);
  return Math.exp(-0.005 * daysSinceUpdate);
}
```

### Step 4: Update `applyBoostScoring` formula

New weights:
```ts
const WEIGHTS = {
  rrf: 0.50,
  rating: 0.15,
  stars: 0.10,
  usage: 0.08,
  success: 0.07,
  recency: 0.05,
  favorite: 0.05,
} as const;
```

Normalization:
```ts
const maxStars = Math.max(...allStats.map((s) => s.github_stars), 1);

const normalizedRrf = maxRrfScore > 0 ? result.rrf_score / maxRrfScore : 0;
const normalizedRating = stats.avg_rating / maxRating;
const normalizedStars = logNormalize(stats.github_stars, maxStars);
const normalizedUsage = logNormalize(stats.usage_count, maxUsage);
const normalizedSuccess = stats.success_rate;  // already 0-1
const normalizedRecency = recencyScore(stats.updated_at);
const favoriteBoost = stats.is_favorited ? 1.0 : 0;

const finalScore =
  normalizedRrf * WEIGHTS.rrf +
  normalizedRating * WEIGHTS.rating +
  normalizedStars * WEIGHTS.stars +
  normalizedUsage * WEIGHTS.usage +
  normalizedSuccess * WEIGHTS.success +
  normalizedRecency * WEIGHTS.recency +
  favoriteBoost * WEIGHTS.favorite;
```

### Step 5: Update `fetchSkillStats` in `hybrid-search.ts`

Expand the DB query to include `github_stars` and `updated_at`:

```ts
const skillData = await db
  .select({
    id: skills.id,
    avg_rating: skills.avg_rating,
    install_count: skills.install_count,
    github_stars: skills.github_stars,      // NEW
    updated_at: skills.updated_at,          // NEW
  })
  .from(skills)
  .where(inArray(skills.id, skillIds));
```

### Step 6: Compute success rates

Add a new query for success rates from `usage_stats`:

```ts
import { usageStats } from '~/lib/db/schema';
import { sql } from 'drizzle-orm';

// Compute success_rate per skill from usage_stats
const successRates = await db
  .select({
    skill_id: usageStats.skill_id,
    success_rate: sql<number>`
      CAST(SUM(CASE WHEN ${usageStats.outcome} = 'success' THEN 1 ELSE 0 END) AS REAL)
      / COUNT(*)
    `.as('success_rate'),
  })
  .from(usageStats)
  .where(inArray(usageStats.skill_id, skillIds))
  .groupBy(usageStats.skill_id);

const successMap = new Map(successRates.map((r) => [r.skill_id, r.success_rate]));
```

### Step 7: Build expanded stats map

```ts
statsMap.set(skill.id, {
  avg_rating: skill.avg_rating || 0,
  usage_count: skill.install_count || 0,
  github_stars: skill.github_stars || 0,
  success_rate: successMap.get(skill.id) ?? 0.5,  // default 0.5 if no usage data
  updated_at: skill.updated_at,
  is_favorited: userFavorites.has(skill.id),
});
```

### Step 8: Run `pnpm typecheck`

## Todo

- [ ] Expand `SkillStats` interface with github_stars, success_rate, updated_at
- [ ] Expand `BoostedResult` interface with stars_boost, success_boost, recency_boost
- [ ] Add `recencyScore` helper function
- [ ] Define `WEIGHTS` constant object
- [ ] Rewrite `applyBoostScoring` with 7-signal formula
- [ ] Update `fetchSkillStats` to query github_stars and updated_at
- [ ] Add success_rate aggregation query from usage_stats
- [ ] Build expanded stats map with all signals
- [ ] Verify typecheck passes

## Success Criteria

- All 7 boost components contribute to final_score
- High-starred, well-rated skills rank above obscure ones for ambiguous queries
- Skills with no usage_stats default to 0.5 success_rate (neutral)
- Recency gently boosts recently updated skills (~5% weight, 140-day half-life)
- Total weights sum to 1.0

## Risk

**Medium**. Wrong weights could degrade results for specific queries. Mitigation:
- Test with known-good queries before deploying
- Keep old 4-signal formula commented as fallback
- Weights are in a single `WEIGHTS` const — easy to tune

## Security

Success rate query uses parameterized Drizzle `inArray` — no SQL injection risk.
