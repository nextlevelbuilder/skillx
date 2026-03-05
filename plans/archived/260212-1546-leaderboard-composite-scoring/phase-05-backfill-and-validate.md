---
phase: 5
priority: medium
status: pending
effort: S
depends_on: [4]
---

# Phase 5: Seed Data Backfill + Typecheck + Validate

## Context

- Recompute fn: `apps/web/app/lib/leaderboard/recompute-skill-scores.ts`
- Seed script: `apps/web/app/routes/api.admin.seed.ts`
- Existing seed data: `scripts/seed-data.json`

## Overview

Backfill precomputed scores for existing seeded skills. Validate everything typechecks and builds.

## Requirements

### Seed Backfill — Modify `apps/web/app/routes/api.admin.seed.ts`

After seeding skills, run score recomputation for all skills:

```ts
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";

// After skill insert loop:
const allSkills = await db.select({ id: skills.id }).from(skills);
for (const skill of allSkills) {
  await recomputeSkillScores(db, skill.id);
}
```

This ensures seeded data has valid composite/bayesian/trending scores.

### Typecheck

```bash
cd apps/web && pnpm typecheck
```

Must pass with zero errors.

### Build Validation

```bash
pnpm build
```

Must complete successfully (SSR build for Cloudflare Workers).

### Manual Smoke Test

1. `pnpm seed` — verify skills get non-zero composite_score
2. Visit `/leaderboard` — verify default tab is "Best"
3. Click each tab — verify sort changes and URL updates
4. Check signal badges appear on qualifying skills
5. Verify home page leaderboard shows composite-sorted order

## Related Code Files

| Action | File |
|--------|------|
| Modify | `apps/web/app/routes/api.admin.seed.ts` |

## Implementation Steps

1. Add recompute loop to seed script
2. Run `pnpm typecheck` — fix any errors
3. Run `pnpm build` — fix any build issues
4. Run `pnpm seed` locally and verify scores populated
5. Verify leaderboard UI works with 5 tabs

## Success Criteria

- [ ] Seeded skills have non-zero `composite_score` and `bayesian_rating`
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` passes
- [ ] All 5 leaderboard tabs return correctly sorted data
- [ ] Signal badges render for qualifying skills
