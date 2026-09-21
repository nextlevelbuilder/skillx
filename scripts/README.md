# Data Seeding Scripts

Scripts for fetching, transforming, and seeding skill data into the SkillX database.

## Files

| Script | Purpose |
|--------|---------|
| `fetch-skillsmp-skills.mjs` | Fetch skills from SkillsMP API (single query, up to 5K) |
| `fetch-skillsmp-all.mjs` | Fetch ALL skills via multi-query strategy (130K+) |
| `build-seed-data.mjs` | Add manually curated skills to seed data |
| `seed-skills.mjs` | Seed skills to the SkillX API in batches (resumable) |
| `seed-data.json` | Combined seed data (~133K skills) |
| `seed-batches/` | Split batch files (1K skills each, 134 files) |

## Workflow

```
SkillsMP API ──► fetch-skillsmp-skills.mjs ──► seed-data.json ◄── build-seed-data.mjs (manual)
             ──► fetch-skillsmp-all.mjs    ──┘       │
                                                     ├──► split into seed-batches/*.json (1K each)
                                                     ▼
                                              seed-skills.mjs ──► /api/admin/seed ──► D1 + Vectorize
```

## Usage

### 1. Fetch skills from SkillsMP

```bash
SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-skills.mjs
SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-skills.mjs --reset  # start fresh
```

- Fetches up to 5,000 skills (100/page, 50 pages max)
- Resumable: saves progress to `.fetch-progress.json` after each page
- Merges new skills into `seed-data.json` (existing slugs preserved)
- Maps GitHub stars → `github_stars` (not `install_count`)

### 2. Add curated skills manually

Edit `build-seed-data.mjs` to add skills, then run:

```bash
node scripts/build-seed-data.mjs
```

### 3. Fetch ALL skills (multi-query)

```bash
SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-all.mjs
SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-all.mjs --reset
```

- Uses ~100+ keyword queries to bypass the 5K-per-query API cap
- Deduplicates across queries by skill ID
- Resumable: saves progress to `.fetch-all-progress.json`
- Fetched 133K+ unique skills in last run

### 4. Seed to database

```bash
# From seed-data.json (default)
ADMIN_SECRET=xxx API_URL=https://skillx.sh node scripts/seed-skills.mjs

# From batch files (recommended for large datasets)
ADMIN_SECRET=xxx API_URL=https://skillx.sh node scripts/seed-skills.mjs --from-batches
ADMIN_SECRET=xxx API_URL=https://skillx.sh node scripts/seed-skills.mjs --file=5        # single batch
ADMIN_SECRET=xxx API_URL=https://skillx.sh node scripts/seed-skills.mjs --range=6-134   # range of batches

# Options
--reset         Clear progress, seed all from scratch
--batch=N       Skills per batch sent to API (default: 50)
--skip-vectors  Skip Vectorize embedding (faster, backfill later)
--from-batches  Read from seed-batches/*.json instead of seed-data.json
--file=N        Seed only batch file N (e.g. --file=5 → batch-005.json)
--range=A-B     Seed batch files A through B (e.g. --range=6-134)
```

- Resumable: saves progress to `.seed-progress.json`
- Re-run without `--reset` to continue from last checkpoint
- Batch files: 134 files × 1K skills each in `seed-batches/`

## How It Works

1. `seed-skills.mjs` reads `seed-data.json` and sends batches to `POST /api/admin/seed`
2. API validates `X-Admin-Secret` header
3. For each skill:
   - Upserts into D1 via Drizzle ORM (conflict on `slug`)
   - Chunks content into ~512-token segments (10% overlap)
   - Generates 768-dim embeddings via Workers AI (bge-base-en-v1.5)
   - Upserts vectors to Vectorize index
4. Returns `{ skills: count, vectors: count }`

## Skill Schema

```json
{
  "name": "skill-name",
  "slug": "author-skill-name",
  "description": "Short description",
  "content": "Markdown content with features, usage, etc.",
  "author": "author-name",
  "source_url": "https://github.com/...",
  "category": "implementation|testing|planning|devops|security|documentation|marketing|database",
  "install_command": "npx skills add author/repo/skill",
  "version": "1.0.0",
  "is_paid": false,
  "price_cents": 0,
  "github_stars": 1234,
  "install_count": 0,
  "avg_rating": 7.2,
  "rating_count": 25
}
```

**Note:** `github_stars` and `install_count` are separate metrics. Stars come from GitHub; installs are tracked by actual usage.

## Idempotency

- D1 upserts on slug conflict (updates existing skills)
- Vectorize upserts replace existing vectors by ID
- Safe to run multiple times

## Leaderboard Recompute (Operations)

`run-recompute.sh` bulk-recomputes every skill's leaderboard composite score through
the admin endpoint. It loops batches client-side because a single `all=true` request is
capped at 50 batches to stay under the Worker CPU limit.

```bash
ADMIN_SECRET=xxx ./scripts/run-recompute.sh          # batch_size defaults to 10
ADMIN_SECRET=xxx ./scripts/run-recompute.sh 25       # larger batches
```

- Calls `POST /api/admin/recompute` with the `X-Admin-Secret` header (never a query param)
- Resumable: checkpoint lives in KV, so re-run the same command after an interruption
- `API_URL` (default `https://skillx.sh/api/admin/recompute`) and `DELAY` (seconds between batches, default 1) are overridable via env
