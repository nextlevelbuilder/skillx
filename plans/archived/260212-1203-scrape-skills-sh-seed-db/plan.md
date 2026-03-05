# Scrape skills.sh & Seed SkillX Database

**Date:** 2026-02-12
**Status:** Archived (2026-03-05)
**Archive reason:** Draft only, never implemented. Seed data approach changed — now using register API + GitHub fetch instead of scraping skills.sh HTML.
**Branch:** main

## Goal

Scrape all skills from skills.sh, transform to SkillX schema, and seed into D1 database. Script must be resumable — tracks completed/failed/pending per skill.

## Context

- **Source:** skills.sh (~54K skills total, ~200 on leaderboard, no public API)
- **Target:** SkillX D1 database via existing `/api/admin/seed` endpoint
- **Existing:** 30 hand-curated skills in `scripts/seed-data.json`
- **Constraint:** skills.sh is SSR (Next.js), data embedded in HTML

## Strategy

**Two-step pipeline:**
1. **Scrape** — Extract skill metadata from skills.sh leaderboard HTML + fetch SKILL.md from GitHub raw content
2. **Seed** — Batch POST to `/api/admin/seed` (already supports upsert via `onConflictDoUpdate`)

**Resumability:** JSON progress file (`scripts/scrape-progress.json`) tracks state per skill slug.

## Phases

| # | Phase | File | Status |
|---|-------|------|--------|
| 1 | Scrape skills.sh leaderboard & fetch SKILL.md content | [phase-01](phase-01-scrape-and-fetch.md) | Pending |
| 2 | Batch seed with progress tracking | [phase-02](phase-02-batch-seed-with-progress.md) | Pending |
| 3 | Run, validate, and verify | [phase-03](phase-03-run-and-validate.md) | Pending |

## Dependencies

- Node.js 18+ (native fetch)
- Dev server running (`pnpm dev`) or remote API URL
- `ADMIN_SECRET` env var
- GitHub token (optional, increases rate limit from 60→5000 req/hr)

## Risk

- **HTML structure changes:** skills.sh may change DOM. Mitigate: fail gracefully, log errors, resume from last checkpoint.
- **GitHub rate limits:** 60 req/hr unauthenticated. Mitigate: support `GITHUB_TOKEN` env, batch with delays.
- **Large payload:** Seed API processes one-at-a-time. Mitigate: batch size of 10 with pauses.

## Files Created/Modified

| Action | File |
|--------|------|
| Create | `scripts/scrape-skills-sh.mjs` — Main scraper + seeder script |
| Create | `scripts/scrape-progress.json` — Progress tracking (gitignored) |
| Modify | `scripts/.gitignore` — Ignore progress file |
