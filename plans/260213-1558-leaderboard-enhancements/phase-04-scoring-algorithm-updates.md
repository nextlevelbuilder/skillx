# Phase 4: Scoring Algorithm Updates

## Context

- [Search Boost Scoring](../../apps/web/app/lib/search/boost-scoring.ts) (124 LOC)
- [Leaderboard Scoring](../../apps/web/app/lib/leaderboard/leaderboard-scoring.ts) (80 LOC)
- [Recompute Pipeline](../../apps/web/app/lib/leaderboard/recompute-skill-scores.ts) (137 LOC)
- [Hybrid Search](../../apps/web/app/lib/search/hybrid-search.ts) (241 LOC)
- [Scoring Utils](../../apps/web/app/lib/scoring-utils.ts) (19 LOC)

## Overview

- **Priority:** P1
- **Status:** Complete
- **Effort:** 2h
- **Description:** Add votes as 8th signal in search boost scoring (7%) and 7th signal in leaderboard composite scoring (10%). Update recompute pipeline to include vote counts. Update hybrid search to fetch vote data.

## Key Insights

- Search boost currently 7 signals summing to 1.0; votes becomes 8th (reduce RRF from 0.50 to 0.43)
- Leaderboard composite currently 6 signals summing to 1.0; votes becomes 7th (reduce rating 0.35->0.30, installs 0.25->0.20)
- Vote normalization: `logNormalize(max(0, net_votes), max_net_votes)` -- clamp to 0 (negative net_votes contribute 0 boost)
- Recompute pipeline already queries 8 things sequentially; vote count is already precomputed on skills table (from Phase 1), so it's free -- just read `net_votes` from existing skill query
- After updating scoring functions, need to recompute all 133K skills' composite scores

## Architecture

### Search Boost Scoring (8 signals)

| Signal | Old Weight | New Weight |
|--------|-----------|-----------|
| RRF Score | 0.50 | **0.43** |
| Rating | 0.15 | 0.15 |
| Stars | 0.10 | 0.10 |
| Usage | 0.08 | 0.08 |
| Success | 0.07 | 0.07 |
| **Votes** | -- | **0.07** |
| Recency | 0.05 | 0.05 |
| Favorites | 0.05 | 0.05 |
| **Total** | 1.00 | 1.00 |

### Leaderboard Composite (7 signals)

| Signal | Old Weight | New Weight |
|--------|-----------|-----------|
| Bayesian Rating | 0.35 | **0.30** |
| Installs | 0.25 | **0.20** |
| Stars | 0.15 | 0.15 |
| **Votes** | -- | **0.10** |
| Success | 0.10 | 0.10 |
| Recency | 0.10 | 0.10 |
| Favorites | 0.05 | 0.05 |
| **Total** | 1.00 | 1.00 |

## Related Code Files

### Files to Modify
- `apps/web/app/lib/search/boost-scoring.ts` -- add vote signal, update weights
- `apps/web/app/lib/search/hybrid-search.ts` -- fetch `net_votes` in `fetchSkillStats()`
- `apps/web/app/lib/leaderboard/leaderboard-scoring.ts` -- add vote signal, update weights + interface
- `apps/web/app/lib/leaderboard/recompute-skill-scores.ts` -- read net_votes, pass to composite

## Implementation Steps

### Step 1: Update search boost scoring

In `apps/web/app/lib/search/boost-scoring.ts`:

1. Update WEIGHTS:

```ts
const WEIGHTS = {
  rrf: 0.43,
  rating: 0.15,
  stars: 0.10,
  usage: 0.08,
  success: 0.07,
  votes: 0.07,
  recency: 0.05,
  favorite: 0.05,
} as const;
```

2. Extend `SkillStats` interface:

```ts
export interface SkillStats {
  avg_rating: number;
  usage_count: number;
  github_stars: number;
  success_rate: number;
  updated_at: Date | null;
  is_favorited: boolean;
  net_votes: number; // NEW
}
```

3. Extend `BoostedResult` interface:

```ts
export interface BoostedResult {
  // ... existing fields
  vote_boost: number; // NEW
}
```

4. In `applyBoostScoring()`, add vote normalization:

```ts
// Find max for normalization
const maxNetVotes = Math.max(...allStats.map((s) => Math.max(0, s.net_votes)), 1);

// Inside the map function:
const normalizedVotes = logNormalize(Math.max(0, stats.net_votes), maxNetVotes);
const voteBoost = normalizedVotes * WEIGHTS.votes;

// Update final score formula to include voteBoost:
const finalScore =
  normalizedRrf * WEIGHTS.rrf +
  ratingBoost + starsBoost + usageBoost + successBoost +
  voteBoost + recencyBoostVal + favBoost;
```

### Step 2: Update hybrid search stats fetching

In `apps/web/app/lib/search/hybrid-search.ts`, in `fetchSkillStats()`:

1. Add `net_votes` to skill data select:

```ts
// In the skill data select, add:
net_votes: skills.net_votes,
```

2. Include in stats map:

```ts
statsMap.set(skill.id, {
  avg_rating: skill.avg_rating || 0,
  usage_count: skill.install_count || 0,
  github_stars: skill.github_stars || 0,
  success_rate: successMap.get(skill.id) ?? 0.5,
  updated_at: skill.updated_at,
  is_favorited: userFavorites.has(skill.id),
  net_votes: skill.net_votes || 0, // NEW
});
```

### Step 3: Update leaderboard composite scoring

In `apps/web/app/lib/leaderboard/leaderboard-scoring.ts`:

1. Update WEIGHTS:

```ts
const WEIGHTS = {
  bayesianRating: 0.30,
  installs: 0.20,
  stars: 0.15,
  votes: 0.10,
  success: 0.10,
  recency: 0.10,
  favorites: 0.05,
} as const;
```

2. Extend `CompositeInputs`:

```ts
export interface CompositeInputs {
  bayesianRating: number;
  installCount: number;
  githubStars: number;
  netVotes: number;     // NEW
  successRate: number;
  updatedAt: Date | null;
  favoriteCount: number;
  maxInstalls: number;
  maxStars: number;
  maxNetVotes: number;  // NEW
  maxFavorites: number;
}
```

3. Update `computeCompositeScore()`:

```ts
export function computeCompositeScore(inputs: CompositeInputs): number {
  const normalizedRating = inputs.bayesianRating / 10;
  const normalizedInstalls = logNormalize(inputs.installCount, inputs.maxInstalls);
  const normalizedStars = logNormalize(inputs.githubStars, inputs.maxStars);
  const normalizedVotes = logNormalize(Math.max(0, inputs.netVotes), inputs.maxNetVotes);
  const normalizedFavorites = logNormalize(inputs.favoriteCount, inputs.maxFavorites);
  const normalizedRecency = recencyScore(inputs.updatedAt);

  return (
    normalizedRating * WEIGHTS.bayesianRating +
    normalizedInstalls * WEIGHTS.installs +
    normalizedStars * WEIGHTS.stars +
    normalizedVotes * WEIGHTS.votes +
    inputs.successRate * WEIGHTS.success +
    normalizedRecency * WEIGHTS.recency +
    normalizedFavorites * WEIGHTS.favorites
  );
}
```

### Step 4: Update recompute pipeline

In `apps/web/app/lib/leaderboard/recompute-skill-scores.ts`:

1. Add `maxNetVotes` to global stats query:

```ts
const [globalStats] = await db
  .select({
    globalAvgRating: sql<number>`coalesce(avg(avg_rating), 0)`,
    maxInstalls: sql<number>`coalesce(max(install_count), 1)`,
    maxStars: sql<number>`coalesce(max(github_stars), 1)`,
    maxFavorites: sql<number>`coalesce(max(favorite_count), 1)`,
    maxNetVotes: sql<number>`coalesce(max(net_votes), 1)`, // NEW
  })
  .from(skills);
```

2. Add `net_votes` to skill-specific select:

```ts
const [skill] = await db
  .select({
    // ... existing fields
    netVotes: skills.net_votes, // NEW
  })
  .from(skills)
  .where(eq(skills.id, skillId));
```

3. Pass to `computeCompositeScore()`:

```ts
const compositeScore = computeCompositeScore({
  bayesianRating,
  installCount: skill.installCount ?? 0,
  githubStars: skill.githubStars ?? 0,
  netVotes: skill.netVotes ?? 0,           // NEW
  successRate,
  updatedAt: skill.updatedAt,
  favoriteCount,
  maxInstalls: globalStats.maxInstalls,
  maxStars: globalStats.maxStars,
  maxNetVotes: Math.max(globalStats.maxNetVotes, 1), // NEW
  maxFavorites: Math.max(globalStats.maxFavorites, 1),
});
```

<!-- Updated: Validation Session 1 - Recompute immediately after deploy -->
<!-- Updated: Phase 4 completion - Bulk recompute admin endpoint deferred -->
### Step 5: Bulk recompute all skills (run immediately after deploy)

After deploying scoring changes, recompute all 133K skills' composite scores. Scoring functions and recompute pipeline are updated to include vote signal.

**Bulk recompute admin endpoint: Deferred to post-deploy**

The bulk recompute script/endpoint was NOT created in this phase to keep scope focused on scoring functions. Should be added in a follow-up:
- Create temporary admin endpoint or extend existing seed admin: `/api/admin/recompute?secret=ADMIN_SECRET&batch=100&offset=0`
- Iterates skills in batches, calls recomputeSkillScores for each
- Include offset/checkpoint tracking (resume from last successful batch on failure)
- Progress logging (batch N of M, skills processed)
- Batch size of 100 with configurable `--batch` flag
- `--offset` flag to resume from specific position

For now, scoring functions are ready. Recompute will be a quick task once admin endpoint template exists.

### Step 6: Update scoring documentation

Update comment headers in all modified files to reflect new signal counts:
- boost-scoring.ts: "8 signals" in module doc
- leaderboard-scoring.ts: "7 weighted signals" in module doc
- recompute-skill-scores.ts: update comment

## Todo List

- [x] Update WEIGHTS in `boost-scoring.ts` (RRF 0.50->0.43, add votes 0.07)
- [x] Add `net_votes` to `SkillStats` interface
- [x] Add `vote_boost` to `BoostedResult` interface
- [x] Add vote normalization + boost in `applyBoostScoring()`
- [x] Add `net_votes` to `fetchSkillStats()` in hybrid-search.ts
- [x] Update WEIGHTS in `leaderboard-scoring.ts` (rating 0.35->0.30, installs 0.25->0.20, add votes 0.10)
- [x] Add `netVotes`, `maxNetVotes` to `CompositeInputs` interface
- [x] Update `computeCompositeScore()` with vote signal
- [x] Add `maxNetVotes` to global stats query in recompute pipeline
- [x] Add `netVotes` to skill select in recompute pipeline
- [x] Pass `netVotes` + `maxNetVotes` to composite score call
- [x] Update module doc comments (signal counts)
- [x] Run `pnpm typecheck`
- [ ] Create batch recompute mechanism with checkpoint/resume support for 133K skills (deferred)
- [ ] Run recompute on production after deploy (deferred)
- [x] Verify composite_score values are reasonable (0-1 range)

## Success Criteria

- Search results incorporate vote signal at 7% weight
- Leaderboard composite uses 7 signals with votes at 10%
- All weights sum to 1.0 in both scoring modules
- Skills with high net_votes rank higher (all else equal)
- Skills with negative net_votes get 0 vote boost (clamped)
- Recompute runs successfully on all 133K skills
- No TypeScript errors after interface changes

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Weight rebalance degrades search quality | Monitor search relevance post-deploy; old weights well-tested |
| Recompute 133K skills times out | Batch in groups of 100; same pattern as seed script |
| Net_votes = 0 for all skills initially | No ranking change until votes accumulate; scores still valid |
| Breaking interface change in CompositeInputs | All callers in single codebase; `pnpm typecheck` catches all |

## Security Considerations

- Vote boost clamped at 0 (negative votes can't harm score below neutral)
- No user data in scoring computations (just aggregate counts)
- Admin recompute endpoint protected by ADMIN_SECRET
- Weight values hardcoded (not configurable by users)
<!-- Red Team: Fire-and-Forget Recompute Monitoring — 2026-02-13 -->
- Fire-and-forget recompute on individual votes: failures are logged but not retried. Monitor for consistent failures. Consider periodic full recompute job to catch drift.

## Next Steps

After all 4 phases complete:
1. Deploy with `pnpm build && cd apps/web && npx wrangler deploy`
2. Run migration: `npx wrangler d1 migrations apply skillx-db --remote`
3. Batch recompute all composite scores
4. Monitor leaderboard rankings for anomalies
5. Consider future: rate limiting (10 votes/min), vote analytics dashboard
