# Phase 6: Search Personalization

## Overview
- **Priority:** P2
- **Status:** pending
- **Effort:** 4h
- **Depends on:** Phase 1, Phase 5

Boost owned/favorited/installed skills and kit members in search scoring.

## Requirements

### Functional
- Purchased skills rank higher for that user
- Favorited skills get boost
- Skills in user's saved kits get boost
- Anonymous users: no personalization (unchanged behavior)

### Non-functional
- Minimal latency impact (one extra query for user signals)
- Boost is additive signal, not filter

## Architecture

Add "user affinity" signal to existing boost-scoring.ts. Current weights sum to 1.0. Rebalance:

```
WEIGHTS (updated):
  rrf: 0.45      (was 0.50)
  rating: 0.14   (was 0.15)
  stars: 0.09    (was 0.10)
  usage: 0.07    (was 0.08)
  success: 0.07  (unchanged)
  recency: 0.05  (unchanged)
  favorite: 0.05 (unchanged)
  affinity: 0.08 (NEW)
```

Affinity signal:
- 1.0 if user purchased/installed this skill
- 0.7 if skill is in a user's saved kit
- 0.5 if user favorited this skill (overlaps with existing favorite_boost but that's for global popularity; this is personal)
- Signals stack: purchased + in kit = max(1.0, 0.7) = 1.0

## Related Code Files

| File | Action |
|------|--------|
| `apps/web/app/lib/search/boost-scoring.ts` | MODIFY — add affinity weight + signal |
| `apps/web/app/lib/search/hybrid-search.ts` | MODIFY — pass userId, fetch user signals |
| `apps/web/app/lib/search/user-affinity.ts` | CREATE — fetch user's owned/fav/kit skill IDs |
| `apps/web/app/routes/api.search.ts` | MODIFY — pass userId from auth (optional) |

## Implementation Steps

1. Create `user-affinity.ts`:
   - `getUserAffinityMap(db, userId)` → `Map<skillId, affinityScore>`
   - Query installs (purchased), favorites, user_kits → kit_skills
   - Merge with max() for overlapping skills
   - Return map

2. Modify `boost-scoring.ts`:
   - Add `affinity` to WEIGHTS (rebalance as above)
   - Add `affinity_score` to SkillStats interface
   - Add `affinity_boost` to BoostedResult
   - In `applyBoostScoring()`: look up affinity from statsMap, apply weight

3. Modify `hybrid-search.ts`:
   - Accept optional `userId` parameter
   - If userId present: call `getUserAffinityMap(db, userId)`
   - Merge affinity scores into statsMap before boost scoring

4. Modify `api.search.ts`:
   - Extract userId from optional auth (session or API key)
   - Pass to hybrid search

## Todo List

- [ ] Create user-affinity.ts
- [ ] Modify boost-scoring.ts
- [ ] Modify hybrid-search.ts
- [ ] Modify api.search.ts
- [ ] Typecheck
- [ ] Test: same query returns different order for user with purchases vs anonymous

## Success Criteria

- Authenticated user sees purchased/favorited skills ranked higher
- Anonymous search unchanged
- No measurable latency increase (affinity query < 10ms on D1)

## Risk Assessment

- **Filter bubble**: Over-boosting owned skills may hide new relevant results. 0.08 weight is mild enough.
- **Cold start**: New users have no affinity data — falls back to standard scoring.
- **KV cache invalidation**: Per-user personalization breaks shared cache. Fix: if userId present, include userId in cache key (`cache:{queryHash}:{userId}`) or bypass KV cache entirely. Anonymous searches remain cached as-is.

## Security Considerations

- User affinity data never exposed in API response (internal scoring only)
- Don't leak other users' purchase history
