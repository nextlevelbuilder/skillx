# SkillX Codebase Summary

## Directory Structure

```
skillx/
├── apps/
│   └── web/                           # React + Cloudflare Workers SSR app
│       ├── app/
│       │   ├── routes/                # React Router v7 page routes (16 files)
│       │   ├── components/            # React UI components (14 files)
│       │   ├── lib/
│       │   │   ├── db/                # Drizzle ORM schema + database helpers
│       │   │   ├── auth/              # Better Auth config + session helpers + authenticate-request
│       │   │   ├── github/            # GitHub API utilities + validate-repo-ownership
│       │   │   ├── search/            # Hybrid search orchestration (5 modules)
│       │   │   ├── vectorize/         # Embedding indexing (3 modules)
│       │   │   └── cache/             # KV caching utilities
│       │   ├── root.tsx               # App shell (navbar, footer)
│       │   ├── entry.server.tsx       # SSR entry point
│       │   └── app.css                # Tailwind v4 + @theme tokens
│       ├── workers/
│       │   └── app.ts                 # Cloudflare Worker entry + env types
│       ├── drizzle/
│       │   └── migrations/            # D1 SQL migration files
│       ├── public/                    # Static assets
│       ├── wrangler.jsonc             # Cloudflare bindings config
│       └── package.json
├── packages/
│   └── cli/                           # skillx npm package
│       ├── src/
│       │   ├── commands/              # CLI commands (4 files)
│       │   ├── lib/                   # API client, config store
│       │   └── index.ts               # Commander.js CLI setup
│       └── package.json
├── .claude-plugin/
│   └── marketplace.json               # Claude Code plugin marketplace catalog
├── .claude/skills/
│   ├── skill-creator/                 # Skill creation tool (v3.0.0)
│   │   └── .claude-plugin/
│   │       └── plugin.json            # skill-creator plugin manifest
│   └── skillx/                        # SkillX marketplace CLI skill (v1.0.0)
│       └── .claude-plugin/
│           └── plugin.json            # skillx plugin manifest
├── scripts/
│   ├── seed-data.json                 # 30 real skills from skills.sh
│   └── seed-skills.mjs                # Seed script runner
├── docs/                              # Documentation
├── plans/                             # Planning & reports
└── README.md                          # Project overview
```

## Core Modules Overview

### Web App Routes (apps/web/app/routes)

| Route | Type | LOC | Purpose |
|-------|------|-----|---------|
| `home.tsx` | Page | 162 | Hero + stats + featured skills + leaderboard |
| `skill-detail.tsx` | Page | 184 | Skill page with ratings, reviews, favorites, references, scripts |
| `leaderboard.tsx` | Page | 78 | Sortable skills table with tier badges |
| `search.tsx` | Page | 110 | Search results page (uses API) |
| `profile.tsx` | Page | 115 | User profile + favorite skills |
| `settings.tsx` | Page | 248 | API key CRUD + usage stats |
| `auth-catchall.tsx` | Handler | 12 | Better Auth webhook handler |
| `api.search.ts` | API | 240 | Hybrid search: query → vectorize → rank |
| `api.skill-detail.ts` | API | 75 | Fetch single skill + ratings + references + scripts |
| `api.skill-rate.ts` | API | 100 | Create/update rating (0-10) |
| `api.skill-review.ts` | API | 109 | Create/list reviews |
| `api.skill-favorite.ts` | API | 74 | Add/remove favorites |
| `api.skill-vote.ts` | API | 107 | Upvote/downvote skill (rate limited) |
| `api.skill-install.ts` | API | - | Track skill install (fire-and-forget) |
| `api.skill-references.ts` | API | - | Add/list skill references |
| `api.skill-register.ts` | API | 182 | Register/publish skills from GitHub repos (auth + ownership validation) |
| `api.user-interactions.ts` | API | 57 | Fetch user's ratings, reviews, votes, favorites |
| `api.leaderboard.ts` | API | - | Get leaderboard with filters & sorting |
| `api.usage-report.ts` | API | 99 | Log skill execution outcomes |
| `api.user-api-keys.ts` | API | 133 | Create/list/revoke API keys |
| `api.admin.seed.ts` | API | 121 | Load demo seed data |
| `$.tsx` | Catch-all | 23 | 404 page |

**Total Routes:** ~1,883 LOC

### Components (apps/web/app/components)

| Component | LOC | Purpose |
|-----------|-----|---------|
| `layout/navbar.tsx` | 99 | Sticky header with Cmd+K search + auth |
| `layout/footer.tsx` | 31 | Footer with links |
| `search-command-palette.tsx` | 189 | Modal palette: debounced search + kbd nav |
| `home-leaderboard.tsx` | 226 | Leaderboard with votes, sort tabs, preview modal |
| `leaderboard-table.tsx` | 140 | Sortable table with tier badges + vote counts |
| `leaderboard-controls.tsx` | 58 | Sort tabs + category filter dropdown |
| `skill-preview-modal.tsx` | 80 | Preview modal for skill descriptions |
| `skill-card.tsx` | 108 | Card: title, rating, installs, category |
| `search-input.tsx` | 59 | Input field with debounce |
| `star-rating.tsx` | 69 | Interactive 0-10 rating control |
| `favorite-button.tsx` | 45 | Heart icon + add/remove logic |
| `auth-button.tsx` | 41 | GitHub sign in/out |
| `review-form.tsx` | 65 | Text input for writing reviews |
| `review-list.tsx` | 60 | Display reviews from DB |
| `skill-content-renderer.tsx` | 31 | Render skill SKILL.md with references + scripts |
| `filter-tabs.tsx` | 31 | Category + price filters |
| `rating-badge.tsx` | 36 | S/A/B/C tier display |
| `command-box.tsx` | 32 | Copyable code block |

### Database Layer (apps/web/app/lib/db)

**schema.ts** — Drizzle ORM schema:

| Table | Columns | Purpose |
|-------|---------|---------|
| `skills` | id, name, slug, description, content, author, source_url, category, version, is_paid, price_cents, avg_rating, rating_count, install_count, upvote_count, downvote_count, net_votes, scripts (JSON), fts_content (computed), risk_label, timestamps | Core skill metadata + voting counters + scripts array + FTS5 search content + security risk classification |
| `skill_references` | id, skill_id (FK), title, filename, url, type (enum: doc/link/example), content, created_at | External references, documentation links, code examples |
| `ratings` | id, skill_id, user_id, score, is_agent, timestamps | 0-10 scores |
| `reviews` | id, skill_id, user_id, content, is_agent, created_at | Text feedback |
| `favorites` | user_id, skill_id, created_at | Many-to-many bookmarks |
| `votes` | id, skill_id, user_id, direction (up/down), created_at, updated_at | Upvote/downvote tracking (deduplicated per user) |
| `installs` | id, skill_id, user_id, device_id, created_at | Install tracking (deduplicated per user/device) |
| `usageStats` | id, skill_id, user_id, model, outcome, duration_ms, created_at | Execution tracking |
| `apiKeys` | id, user_id, name, key_hash, key_prefix, last_used_at, revoked_at, created_at | API authentication |

**Indexes:** 15+ indexes on foreign keys, ratings, avg_rating, created_at, etc.

### Search System (apps/web/app/lib/search)

**Architecture:** Query → Embed → Vectorize + FTS5 → RRF Fusion → Boost Score

| Module | LOC | Function |
|--------|-----|----------|
| `hybrid-search.ts` | 239 | Orchestrator: accepts query, returns ranked results (8 signals) |
| `vector-search.ts` | 83 | Vectorize cosine search (768-dim embeddings) |
| `fts5-search.ts` | 58 | SQLite FTS5 keyword search (includes fts_content column) |
| `rrf-fusion.ts` | 79 | Merge vector & FTS results using reciprocal rank fusion |
| `boost-scoring.ts` | 82 | Adjust scores: 8-signal formula (vector 50%, FTS5 21.5%, rating 3%, installs 2%, votes 0.7%, recency 1%, reviews 0.15%, favorites 0.15%) |

**Flow:**
1. Query (text) → Hash & cache check (KV)
2. If cached, return cached results (5min TTL)
3. Otherwise: embed via Workers AI (bge-base-en-v1.5)
4. Parallel: Vectorize cosine search + FTS5 search
5. RRF: merge rank lists (v_rank, fts_rank)
6. Boost: multiply by rating/installs/recency scores
7. Filter by category, is_paid
8. Cache results, return top N

### Auth System (apps/web/app/lib/auth)

| Module | Purpose |
|--------|---------|
| `auth-server.ts` | Better Auth config + GitHub OAuth provider setup |
| `auth-client.ts` | React client for sessions (getSession, signIn, signOut) |
| `session-helpers.ts` | `getSession(request, env)`, `requireAuth()` — request-level auth |
| `api-key-utils.ts` | Hash/verify API keys (SHA-256), generate prefixes (sk_prod format) |
| `authenticate-request.ts` | Unified auth: tries API key first, fallbacks to session; returns `{ userId, method }` |

### Security Scanning (apps/web/app/lib/security)

| Module | Purpose |
|--------|---------|
| `content-scanner.ts` | Scan SKILL.md for prompt injection, invisible chars, ANSI escapes, shell injection. Returns RiskLabel + findings. |

**Flow:**
1. User clicks "Sign in with GitHub"
2. Better Auth → GitHub OAuth → session cookie (7d expiry)
3. Routes check: `const session = await getSession(request, env)`
4. Protected routes: `await requireAuth(session)` → 401 if missing
5. For dual-auth endpoints (CLI + Web): `const auth = await authenticateRequest(request, env)` → try API key, fallback to session

### GitHub Integration (apps/web/app/lib/github)

| Module                       | Purpose |
|------------------------------|---------|
| `validate-repo-ownership.ts` | Verify user has write access to GitHub repo via collaborator API check (used by skill registration + publish) |
| `fetch-github-skill.ts` | Fetch SKILL.md metadata from GitHub repos using Tree API |
| `scan-github-repo.ts` | Progressive scan for SKILL.md files across repo (top 50, then 500, then all) |

**Used by:** Register API to validate author owns the GitHub repository before publishing skills. Skills API to fetch skill content lazily.

### Vectorization (apps/web/app/lib/vectorize)

| Module | LOC | Purpose |
|--------|-----|---------|
| `embed-text.ts` | ? | Call Workers AI to embed text (bge-base-en-v1.5) |
| `chunk-text.ts` | 30 | Split skill content into 512-token chunks (10% overlap) |
| `index-skill.ts` | 67 | On skill create: chunk → embed → index in Vectorize |
| `index-reference.ts` | ? | On reference add: index title + first paragraph via Workers AI |

**Flow:**
1. Skill created/updated
2. Extract content (SKILL.md, readme, references, scripts)
3. Chunk into 512-token pieces (10% overlap)
4. Embed each chunk via Workers AI
5. Upsert into Vectorize index (namespace: skill_id)
6. On reference add: embed title + first paragraph, index separately

### CLI Package (packages/cli)

| File | LOC | Purpose |
|------|-----|---------|
| `index.ts` | - | Commander.js CLI entry + command registration |
| `commands/search.ts` | 86 | `skillx search "..."` → API call → table output |
| `commands/use.ts` | 78 | `skillx use skill1 skill2` → fetch SKILL.md + flags, POST install, echo to stdout |
| `commands/publish.ts` | 182 | `skillx publish [owner/repo]` → register/publish skills from GitHub with auth |
| `commands/report.ts` | 90 | `skillx report` → POST usage metrics to API |
| `commands/config.ts` | 91 | `skillx config set/get KEY VALUE` → local store |
| `lib/api-client.ts` | 35 | HTTP client with API key auth (Bearer token) |
| `lib/use-display.ts` | - | Display formatter for skill content (references, scripts, content) |
| `utils/config-store.ts` | - | conf package: ~/.skillx/config.json, includes getDeviceId() |

**Usage:**
```bash
npm install -g skillx-sh
skillx search "data processing"
skillx use skillx-search skillx-email
skillx use skillx-search --include-refs       # Include references section
skillx use skillx-search --include-scripts    # Include scripts array
skillx publish owner/repo                     # Register/publish from GitHub
skillx publish owner/repo --path path/to/skill  # Single skill path
skillx publish owner/repo --scan              # Scan entire repo
skillx publish --dry-run                      # Validation only (requires auth)
skillx config set api-key sk_...
skillx report --outcome success --duration 1234
```

## Data Flow Diagrams (ASCII)

### Search Request Flow

```
User Query
    ↓
[Cmd+K Palette / Search Page]
    ↓
POST /api/search { query, category?, is_paid? }
    ↓
[Authenticate via session or API key]
    ↓
[Check KV cache (5min TTL)]
    ↓ Cache miss
[Embed query via Workers AI (bge-base-en-v1.5)]
    ↓
┌─────────────────────────────────────┐
│ Parallel Search                     │
├─────────────┬───────────────────────┤
│ Vectorize   │ FTS5 (D1)             │
│ cosine      │ keyword search        │
│ search      │                       │
└─────────────┴───────────────────────┘
    ↓
[RRF Fusion: merge rank lists]
    ↓
[Boost Scoring: rating × 0.3 + installs × 0.2 + freshness × 0.1]
    ↓
[Filter: category, is_paid]
    ↓
[Cache result (KV, 5min)]
    ↓
Response: { results: [{ id, name, rating, ... }], count }
```

### API Key Authentication Flow

```
CLI Request with API key
    ↓
Authorization: Bearer sk_1234...abcd
    ↓
POST /api/search
    ↓
[authenticateRequest: hash key]
    ↓
SHA-256(sk_1234...abcd) → hash
    ↓
SELECT * FROM apiKeys WHERE key_hash = ?
    ↓
Found & revoked_at IS NULL?
    ↓ Yes
[Update last_used_at]
    ↓
Proceed with request (user_id from apiKeys.user_id)
    ↓ No
Return 401 Unauthorized
```

### Skill Rating Flow

```
User Rates Skill
    ↓
[Star Rating Component: 1-10 score]
    ↓
POST /api/skills/:slug/rate { score }
    ↓
[Authenticate via session]
    ↓
INSERT OR REPLACE INTO ratings (skill_id, user_id, score, ...)
    ↓
UPDATE skills SET avg_rating = (SELECT AVG(score) FROM ratings WHERE skill_id = ?), rating_count = (SELECT COUNT(*) FROM ratings WHERE skill_id = ?)
    ↓
Response: { id, skill_id, user_id, score }
```

## Key Implementation Details

### Search Ranking Formula (8 Signals)

```
score = vector_relevance × 0.5 +
        fts5_relevance × 0.215 +
        (avg_rating / 10) × 0.3 +
        log(install_count + 1) × 0.2 +
        (net_votes / 100) × 0.07 +
        (1 / (days_since_created + 1)) × 0.1 +
        (has_reviews_flag × 0.015) +
        (is_favorited_flag × 0.015)

Where:
- vector_relevance: [0, 1] from Vectorize cosine distance
- fts5_relevance: [0, 1] from FTS5 BM25 rank (reduced from 0.3)
- avg_rating: [0, 10] stored in DB
- install_count: integer, increases with usage
- net_votes: upvote_count - downvote_count (NEW)
- freshness: penalizes old skills
- has_reviews: boolean flag for review existence (signal)
- is_favorited: boolean flag for user favorite (signal)
```

### API Key Format

```
sk_prod_abc123xyz789abc123...

prefix: "sk_prod" (6 chars)
secret: random 32 bytes (hex = 64 chars)
total: 70+ chars

Stored in DB:
- key_hash: SHA-256(full_key)
- key_prefix: "sk_prod_abc123xyz789abc123" (first 26 chars)
```

### Pagination Pattern

All list APIs support:
- `limit` (default 50, max 100)
- `offset` (default 0)
- Returns `count` (total available)

### Session Management

- Better Auth handles session creation
- Cookie: `auth_token`, httpOnly, secure, sameSite=lax
- Expiry: 7 days
- Update age: 1 day (refreshes cookie if active)

---

## Test Infrastructure

**Framework:** Vitest (Fast unit testing)

**Test Configuration:**

- Config file: `vitest.config.ts`
- Test file pattern: `**/*.test.ts`
- Test directories:
  - `apps/web/app/**/*.test.ts` — Web app tests
  - `packages/cli/src/**/*.test.ts` — CLI tests

**Current Test Suite (38 tests):**

- **content-scanner.test.ts** (30 tests) — Security scanning for prompt injection, invisible chars (zero-width, bidirectional override), ANSI escapes, shell injection, HTML/XML tags, risk classification
- **use.test.ts** (8 tests) — CLI identifier resolution (search, two-part, three-part, slug formats)

**Running Tests:**

```bash
pnpm test              # Run all tests once
pnpm test:watch       # Watch mode for development
```

**Test Coverage Areas:**

1. **Security scanning** — detect malicious content, Unicode tricks (trojan source), prompt injection patterns, invisible characters
2. **CLI identifier parsing** — correctly classify input formats (author/skill, org/repo/skill, slug, search query)

## Dependencies

**Production:**
- react-router v7
- drizzle-orm, drizzle-kit
- better-auth
- @cloudflare/workers-types
- tailwindcss v4
- lucide-react
- commander (CLI)
- chalk (CLI)
- ora (CLI)
- conf (CLI config)

**Dev:**
- vite
- typescript
- wrangler (Cloudflare CLI)
- vitest (unit testing)
- prettier

---

**Last Updated:** Mar 5, 2026
**Total LOC:** ~4,500 (excluding auto-generated and seed data)
**Test Suite:** 38 unit tests (content-scanner, CLI identifier parsing)
**Recent Changes:** Leaderboard enhancements, skill references/scripts, skill publishing with GitHub auth
