# Phase 2: Batch Seed with Progress Tracking

**Priority:** High
**Status:** Pending

## Overview

Read scraped skills data and seed to SkillX DB in batches. Track progress in a JSON file so the script can resume from where it left off.

## Progress File Schema

```json
// scripts/scrape-progress.json
{
  "last_updated": "2026-02-12T12:00:00Z",
  "total_scraped": 200,
  "stats": {
    "completed": 150,
    "failed": 5,
    "pending": 45
  },
  "skills": {
    "find-skills": { "status": "completed", "seeded_at": "2026-02-12T12:01:00Z" },
    "web-design-guidelines": { "status": "failed", "error": "HTTP 500", "attempts": 2 },
    "remotion-best-practices": { "status": "pending" }
  }
}
```

## Implementation Steps

1. **Load progress file** — Read `scrape-progress.json` if exists, otherwise initialize empty
2. **Load scraped skills** — Read `scraped-skills.json` from Phase 1
3. **Filter pending skills** — Skip `completed` skills, retry `failed` (max 3 attempts)
4. **Batch POST to seed API** — Send 10 skills per batch to `/api/admin/seed`
   - Wait 1s between batches to avoid overwhelming the API
   - On success: mark each skill as `completed` in progress file
   - On failure: mark as `failed` with error message, increment attempts
5. **Save progress after each batch** — Write to `scrape-progress.json` immediately
6. **Summary output** — Print final stats: completed/failed/pending/total

## CLI Interface

```bash
# Full pipeline: scrape + seed
node scripts/scrape-skills-sh.mjs

# Resume from where we left off (reads progress file)
node scripts/scrape-skills-sh.mjs --resume

# Only scrape, don't seed
node scripts/scrape-skills-sh.mjs --scrape-only

# Only seed (from existing scraped-skills.json)
node scripts/scrape-skills-sh.mjs --seed-only

# Set batch size
node scripts/scrape-skills-sh.mjs --batch-size 5

# Use GitHub token for higher rate limits
GITHUB_TOKEN=ghp_xxx node scripts/scrape-skills-sh.mjs
```

## Environment Variables

| Var | Required | Default | Description |
|-----|----------|---------|-------------|
| `API_URL` | No | `http://localhost:5173` | SkillX API base URL |
| `ADMIN_SECRET` | Yes | — | Admin auth secret |
| `GITHUB_TOKEN` | No | — | GitHub PAT for higher rate limits |

## Success Criteria

- [ ] Batch seeding works with 10 skills per batch
- [ ] Progress file updates after each batch
- [ ] `--resume` skips already-completed skills
- [ ] Failed skills logged with error details
- [ ] Script can be interrupted and resumed without data loss
