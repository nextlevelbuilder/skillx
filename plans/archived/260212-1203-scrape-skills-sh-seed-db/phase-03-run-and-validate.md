# Phase 3: Run, Validate, and Verify

**Priority:** Medium
**Status:** Pending

## Overview

Execute the scraper/seeder, validate results, and ensure all skills are properly stored.

## Steps

1. **Start dev server** — `pnpm dev` in `apps/web`
2. **Run scrape** — `node scripts/scrape-skills-sh.mjs --scrape-only`
   - Verify `scraped-skills.json` has 200+ skills
   - Spot-check 5 skills for correct data mapping
3. **Run seed** — `ADMIN_SECRET=xxx node scripts/scrape-skills-sh.mjs --seed-only`
   - Watch batch progress output
   - Verify progress file updates after each batch
4. **Test resume** — Interrupt midway (Ctrl+C), then run with `--resume`
   - Verify skips completed skills
   - Continues from last checkpoint
5. **Validate DB** — Check skills in app
   - Browse http://localhost:5173 — leaderboard shows new skills
   - Search for specific skills
   - Verify skill detail pages render correctly

## Success Criteria

- [ ] 200+ skills seeded successfully
- [ ] Resume works after interruption
- [ ] No duplicate skills (upsert handles correctly)
- [ ] Skills visible on frontend
