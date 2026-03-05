---
phase: 2
priority: critical
status: pending
effort: 15 min
---

# Phase 2: Log-Scale Normalization

## Overview

Replace linear normalization with logarithmic for usage_count and github_stars. Prevents a single viral skill from crushing all others' scores.

## Key Insight

Current: `normalized = count / maxCount`. If one skill has 100k installs and the rest average 50, every non-viral skill gets ~0.0005 usage boost — effectively zero. Log-scale compresses the range.

```
Linear:  50 / 100000 = 0.0005
Log:     log(51) / log(100001) = 3.93 / 11.51 = 0.34
```

## Related Code Files

- **Modify**: `apps/web/app/lib/search/boost-scoring.ts`

## Implementation Steps

1. Add a `logNormalize` helper function at the top of `boost-scoring.ts`:

```ts
/** Log-scale normalization: compresses large ranges to 0-1 */
function logNormalize(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.log(1 + value) / Math.log(1 + max);
}
```

2. Replace linear normalization for usage in `applyBoostScoring`:

```ts
// FROM:
const normalizedUsage = stats.usage_count / maxUsage;

// TO:
const normalizedUsage = logNormalize(stats.usage_count, maxUsage);
```

3. Run `pnpm typecheck`.

## Todo

- [ ] Add `logNormalize` helper function
- [ ] Replace linear usage normalization with `logNormalize`
- [ ] Verify typecheck passes

## Success Criteria

- Skills with moderate install counts (100-500) get meaningful usage boost (>0.1)
- Skills with extreme install counts don't dominate the usage signal
- All boost scores still in 0-1 range

## Risk

**Low**. Logarithmic normalization is strictly better than linear for skewed distributions. The function is monotonic so relative ordering within the usage signal is preserved.
