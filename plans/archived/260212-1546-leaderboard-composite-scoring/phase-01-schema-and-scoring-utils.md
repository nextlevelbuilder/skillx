---
phase: 1
priority: critical
status: pending
effort: S
---

# Phase 1: Schema Migration + Scoring Utils

## Context

- Brainstorm: `plans/reports/brainstorm-260212-1546-leaderboard-composite-scoring.md`
- Schema: `apps/web/app/lib/db/schema.ts`
- Existing scoring: `apps/web/app/lib/search/boost-scoring.ts`

## Overview

Add 4 precomputed columns to `skills` table. Extract shared normalization functions from `boost-scoring.ts` into a reusable utility module.

## Requirements

### Schema Changes — `apps/web/app/lib/db/schema.ts`

Add to `skills` table definition:

```ts
composite_score: real("composite_score").default(0),
bayesian_rating: real("bayesian_rating").default(0),
trending_score: real("trending_score").default(0),
favorite_count: integer("favorite_count").default(0),
```

Add index for composite_score (primary leaderboard sort):

```ts
index("idx_skills_composite_score").on(table.composite_score),
index("idx_skills_trending_score").on(table.trending_score),
```

### Drizzle Migration

Run `pnpm db:generate` in `apps/web` to generate migration SQL. Verify migration adds columns with defaults (no data loss).

### Shared Scoring Utils — NEW `apps/web/app/lib/scoring-utils.ts`

Extract from `boost-scoring.ts`:

```ts
/** Log-scale normalization: compresses large ranges to 0-1 */
export function logNormalize(value: number, max: number): number

/** Exponential recency decay. Half-life ~140 days (lambda=0.005). */
export function recencyScore(updatedAt: Date | null): number
```

### Update `boost-scoring.ts`

Replace local `logNormalize()` and `recencyScore()` with imports from `~/lib/scoring-utils`.

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/web/app/lib/db/schema.ts` |
| Create | `apps/web/app/lib/scoring-utils.ts` |
| Modify | `apps/web/app/lib/search/boost-scoring.ts` |
| Generate | Drizzle migration file |

## Implementation Steps

1. Add 4 columns + 2 indexes to `schema.ts`
2. Create `scoring-utils.ts` with `logNormalize()` and `recencyScore()`
3. Update `boost-scoring.ts` to import from `scoring-utils.ts`
4. Run `cd apps/web && pnpm db:generate` to create migration
5. Run `pnpm typecheck` to verify no type errors

## Success Criteria

- [ ] 4 new columns in schema
- [ ] 2 new indexes
- [ ] Migration generated successfully
- [ ] `scoring-utils.ts` < 30 LOC
- [ ] `boost-scoring.ts` still works (imports updated)
- [ ] `pnpm typecheck` passes
