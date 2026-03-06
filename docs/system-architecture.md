# SkillX System Architecture

## High-Level Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        USER INTERFACE LAYER                      │
├─────────────────────────────────────────────────────────────────┤
│  Web Browser (React Router v7)    │    CLI (skillx)        │
│  - Home / Leaderboard              │  - search command           │
│  - Skill Detail Page               │  - use command              │
│  - Search (Cmd+K palette)          │  - report command           │
│  - User Profile                    │  - config command           │
│  - Settings (API keys)             │                             │
└──────────────┬──────────────────────────┬───────────────────────┘
               │                          │
               │ HTTPS / gRPC             │ HTTPS
               ↓                          ↓
┌──────────────────────────────────────────────────────────────────┐
│           CLOUDFLARE WORKERS (Edge Compute)                      │
├──────────────────────────────────────────────────────────────────┤
│  Routes: /, /skills/:slug, /api/*, /auth/*                      │
│  - Page routes (React Router loaders)                            │
│  - API handlers (search, rate, review, favorite, report)         │
│  - Auth handlers (Better Auth middleware)                        │
└──────────────┬──────────────────────────────────────────────────┘
               │
    ┌──────────┼──────────┬────────────┬──────────────┐
    │          │          │            │              │
    ↓          ↓          ↓            ↓              ↓
┌─────────┐ ┌───────┐ ┌──────────┐ ┌──────┐ ┌──────────────┐
│ D1 DB   │ │  KV   │ │Vectorize │ │ R2   │ │ Workers AI   │
│ (SQLite)│ │(Cache)│ │(Embeddings)│ │(Assets)│ │(Embeddings)│
└─────────┘ └───────┘ └──────────┘ └──────┘ └──────────────┘
```

## Cloudflare Bindings

**wrangler.jsonc configuration:**

| Binding | Service | Purpose |
|---------|---------|---------|
| `DB` | D1 Database | Primary data store (SQLite) |
| `VECTORIZE` | Vectorize Index | Vector search (768-dim) |
| `KV` | KV Namespace | Query result caching (5min TTL) |
| `R2` | R2 Bucket | Asset storage (SKILL.md files) |
| `AI` | Workers AI | Text embedding (bge-base-en-v1.5) |

## Database Schema

```
┌──────────────────────────────────────────────────────────────┐
│                         SKILLS (Primary Entity)               │
├──────────────────────────────────────────────────────────────┤
│ id (PK), slug (unique), name, description, content           │
│ author, category, version, is_paid, price_cents              │
│ avg_rating, rating_count, install_count                      │
│ upvote_count, downvote_count, net_votes                      │
│ scripts (JSON), fts_content (computed for FTS5)              │
│ source_url, created_at, updated_at                           │
└──────┬──────────────────────┬──────────────────────┬──────────┬───────────┘
       │                      │                      │          │
       ├─ has many →          ├─ has many →         ├─ many →  ├─ many →
       ↓                      ↓                      ↓          ↓
┌────────────────┐   ┌──────────────┐    ┌────────────────┐ ┌──────────────┐
│    RATINGS     │   │   REVIEWS    │    │  REFERENCES    │ │    VOTES     │
├────────────────┤   ├──────────────┤    ├────────────────┤ ├──────────────┤
│ id (PK)        │   │ id (PK)      │    │ id (PK)        │ │ id (PK)      │
│ skill_id (FK)  │   │ skill_id (FK)│    │ skill_id (FK)  │ │ skill_id (FK)│
│ user_id        │   │ user_id      │    │ title          │ │ user_id (FK) │
│ score (0-10)   │   │ content      │    │ filename       │ │ direction    │
│ is_agent (bool)│   │ is_agent     │    │ url            │ │ (up/down)    │
│ created_at     │   │ created_at   │    │ type (enum)    │ │ created_at   │
│ updated_at     │   │              │    │ content        │ │ updated_at   │
└────────────────┘   └──────────────┘    │ created_at     │ │(unique combo)│
                                         └────────────────┘ └──────────────┘

┌────────────────────────┐    ┌─────────────────────┐
│    USAGE_STATS         │    │    API_KEYS         │
├────────────────────────┤    ├─────────────────────┤
│ id (PK)                │    │ id (PK)             │
│ skill_id (FK)          │    │ user_id             │
│ user_id                │    │ name                │
│ model (Claude/GPT4)    │    │ key_hash (unique)   │
│ outcome (success/fail) │    │ key_prefix          │
│ duration_ms            │    │ last_used_at        │
│ created_at             │    │ revoked_at          │
└────────────────────────┘    │ created_at          │
                              └─────────────────────┘

┌────────────────────────┐
│    INSTALLS            │
├────────────────────────┤
│ id (PK)                │
│ skill_id (FK)          │
│ user_id (nullable)     │
│ device_id (nullable)   │
│ created_at             │
│ (dedup per user/device)│
└────────────────────────┘
```

**Indexes:**
- `idx_skills_category` — Fast category filtering
- `idx_skills_avg_rating` — Sorting by rating
- `idx_skills_net_votes` — Sorting by votes
- `idx_ratings_skill` — Find ratings for skill
- `idx_ratings_user_skill` (unique) — Prevent duplicate ratings
- `idx_votes_skill` — Find votes for skill
- `idx_votes_user_skill` (unique) — Prevent duplicate votes per user
- `idx_references_skill` — Find references for skill (NEW)
- `idx_api_keys_hash` — Fast API key lookup

## Search Architecture

### 1. Query Processing

```
User Query (text)
    ↓
Hash query string
    ↓
Check KV cache: cache:{hash}
    ↓
    ├─ Hit (5min TTL) → Return cached results
    │
    └─ Miss:
        ↓
        Embed query via Workers AI
        (bge-base-en-v1.5, 768 dimensions)
        ↓
        ┌────────────────────────────────────┐
        │ Parallel Search (no await)         │
        ├────────────────────────────────────┤
        │ 1. Vectorize cosine search         │
        │    - Query embedding vs skill data │
        │    - Returns top 100 by similarity │
        │                                    │
        │ 2. FTS5 keyword search (D1)        │
        │    - Match skill name/description  │
        │    - Returns BM25-ranked results   │
        └────────────────────────────────────┘
        ↓
        RRF Fusion: Merge rank lists
        (reciprocal rank fusion formula)
        ↓
        Boost Scoring (8 signals):
        - avg_rating × 0.3
        - install_count × 0.2
        - net_votes × 0.07
        - freshness × 0.1
        - has_reviews × 0.015
        - is_favorited × 0.015
        (vector: 0.5, FTS5: 0.215)
        ↓
        Filter:
        - category (if specified)
        - is_paid (if specified)
        ↓
        Sort by final score, limit 100
        ↓
        Cache result (KV, 5min TTL)
        ↓
        Response JSON
```

### 2. Vectorization Pipeline

```
Skill Created/Updated
    ↓
Extract content from SKILL.md + references + scripts
    ↓
Chunk text (512 tokens, 10% overlap)
    ↓
For each chunk:
  ├─ Embed via Workers AI (bge-base-en-v1.5)
  └─ Upsert into Vectorize index
        namespace: {skill_id}
        vector: [768 floats]
        metadata: { chunk_index, section }

Reference Added (NEW)
    ↓
Extract reference title + first paragraph
    ↓
Embed via Workers AI
    ↓
Upsert into Vectorize index
     namespace: {skill_id}_refs
     vector: [768 floats]
     metadata: { reference_id, type }
```

### 3. Hybrid Search Fallback

```
Normal flow:
User query → embed + vector search + FTS5 → results

If Vectorize unavailable (dev/error):
User query → FTS5 only → results

(Graceful degradation enabled for local development)
```

### 4. Leaderboard Ranking Formula (7 Signals)

```
score = (avg_rating / 10) × 0.30 +
        log(install_count + 1) × 0.20 +
        (net_votes / 100) × 0.10 +
        (rating_count / 100) × 0.15 +
        (1 / (days_since_created + 1)) × 0.15 +
        (review_count / 50) × 0.05 +
        (is_verified × 0.05)

Sorting tabs (5 modes):
- best: composite score (default)
- rating: avg_rating descending
- installs: install_count descending
- trending: net_votes descending (recent)
- newest: created_at descending

Filters: Category, risk_label (safe/caution/danger/unknown), is_paid, date_range (configurable)

Where:
- avg_rating: [0, 10] — user ratings (0-10 scale)
- install_count: integer — skill usage tracking
- net_votes: upvote_count - downvote_count (community feedback via votes)
- rating_count: total ratings received
- freshness: newer skills ranked higher
- review_count: number of text reviews
- is_verified: skill author verified status
```

## Authentication Flow

### Better Auth + GitHub OAuth

```
┌─────────┐
│ Browser │
└────┬────┘
     │ 1. Click "Sign in with GitHub"
     ↓
┌─────────────────────────────────────┐
│   Cloudflare Worker                 │
│   /auth/callback (Better Auth)       │
└────┬────────────────────────────────┘
     │ 2. Redirect to GitHub OAuth
     ↓
┌─────────────────────────────────────┐
│   GitHub OAuth Server               │
│   User grants permission             │
└────┬────────────────────────────────┘
     │ 3. Authorization code
     ↓
┌─────────────────────────────────────┐
│   Better Auth Handler                │
│   - Exchange code for token          │
│   - Fetch user profile from GitHub   │
│   - Create/update user in D1         │
│   - Issue session cookie             │
└────┬────────────────────────────────┘
     │ 4. Set-Cookie: auth_token=...
     ↓
┌─────────┐
│ Browser │ (cookie stored, httpOnly, secure)
└─────────┘

Session Cookie Details:
- Name: auth_token
- Expiry: 7 days
- Update age: 1 day (refresh if active)
- httpOnly: true (JS cannot access)
- secure: true (HTTPS only)
- sameSite: lax
```

### API Key Authentication

```
CLI: skillx search --api-key sk_prod_abc...

Request:
Authorization: Bearer sk_prod_abc...

Server:
1. Extract key from Authorization header
2. Hash via SHA-256
3. Query: SELECT * FROM api_keys WHERE key_hash = ?
4. Check: revoked_at IS NULL
5. Update last_used_at timestamp
6. Use api_keys.user_id for request context

Response:
- 401 if key invalid or revoked
- 200 if valid, proceed with request
```

## Caching Strategy

### KV Cache Layers

| Key Pattern | TTL | Size | Purpose |
|-------------|-----|------|---------|
| `cache:{query_hash}` | 5 min | <25KB | Search results |
| `user:{userId}` | 1 hour | <10KB | User profile (favorites) |
| `skill:{skillId}:detail` | 30 min | <20KB | Skill detail page |
| `leaderboard:top100` | 10 min | <25KB | Leaderboard rankings |

**Cache Invalidation:**
- On rating/review/favorite write → invalidate skill cache + leaderboard
- On skill content change → invalidate vectorize index

## API Endpoints

### Public Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/` | None | Home page |
| GET | `/api/search` | Session/Key | Search skills |
| GET | `/api/leaderboard` | None | Leaderboard with sorting & category filter |
| GET | `/api/skills/:slug` | None | Skill detail + references + scripts (public) |
| GET | `/api/skills/:slug/references` | None | List skill references (NEW) |

### Protected Endpoints (Session or API Key)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/skills/:slug/rate` | Submit rating |
| POST | `/api/skills/:slug/review` | Write review |
| POST | `/api/skills/:slug/favorite` | Add/remove favorite |
| POST | `/api/skills/:slug/vote` | Upvote/downvote skill |
| POST | `/api/skills/:slug/install` | Track install (fire-and-forget) |
| POST | `/api/skills/:slug/references` | Add reference to skill (NEW) |
| POST | `/api/skills/register` | Register/publish skills from GitHub repo (validates write access) |
| POST | `/api/report` | Report usage |

### User Endpoints (Session Only)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/user/api-keys` | List user's API keys |
| POST | `/api/user/api-keys` | Create new API key |
| DELETE | `/api/user/api-keys/:id` | Revoke API key |
| GET | `/api/user/favorites` | List user's favorites |
| GET | `/api/user/interactions` | List user's ratings, reviews, votes, favorites (NEW) |

### Admin Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/admin/seed` | Load demo data (dev only) |

## Voting System (NEW)

### Vote Flow

```
User clicks up/down arrow on skill card/row
    ↓
POST /api/skills/:slug/vote { direction: "up" | "down" }
    ↓
[Authenticate via session]
    ↓
Check existing vote: SELECT * FROM votes WHERE user_id = ? AND skill_id = ?
    ↓
    ├─ If exists & same direction → DELETE (toggle off)
    │
    └─ Otherwise → INSERT OR REPLACE vote
        ↓
        UPDATE skills SET
          upvote_count = (SELECT COUNT(*) FROM votes WHERE skill_id = ? AND direction = 'up'),
          downvote_count = (SELECT COUNT(*) FROM votes WHERE skill_id = ? AND direction = 'down'),
          net_votes = upvote_count - downvote_count
        ↓
        Response: { direction, upvote_count, downvote_count, net_votes }
```

### Scoring Impact

- Votes contribute 7% to search ranking (0.07 weight)
- Leaderboard composite score: 10% of total (votes at 0.1 weight)
- Higher `net_votes` = better leaderboard ranking
- Negative votes penalize skills but don't remove them


## Skill References & Scripts

### References Management (NEW)

**Adding a Reference:**

```
POST /api/skills/:slug/references
{ title, filename, url, type: "doc"|"link"|"example", content? }
    ↓
[Authenticate: session or API key]
    ↓
INSERT INTO skill_references (skill_id, title, filename, url, type, content, ...)
    ↓
[Optionally: index in Vectorize (title + first 100 tokens of content)]
    ↓
Response: { id, skill_id, title, url, type, created_at }
```

**Retrieving References:**

```
GET /api/skills/:slug/references
    ↓
SELECT * FROM skill_references WHERE skill_id = ? ORDER BY created_at DESC
    ↓
Response: [{ id, title, filename, url, type, created_at }, ...]
```

**On Skill Detail Page:**

- Show References section with metadata + links
- Support: documentation (title + link), external links, code examples
- Reference type enum: "doc" | "link" | "example"

### Scripts Management (NEW)

**Scripts Field:**

- Stored as JSON array in `skills.scripts` column
- Schema: `[{ name: string, description?: string, language?: string, url?: string }, ...]`
- Extracted from SKILL.md frontmatter or metadata block
- Indexed for Vectorize search (script names + descriptions)

**CLI Usage:**

```bash
skillx use skill-name --include-scripts
skillx use skill-name --include-refs --include-scripts
```

**API Response (skill detail):**

```json
{
  "skill": { ... },
  "references": [
    { "id": 1, "title": "Docs", "url": "...", "type": "doc" },
    ...
  ],
  "scripts": [
    { "name": "main", "description": "Entry point", "language": "python" },
    { "name": "helper", "language": "js" }
  ]
}
```

**On Skill Detail Page:**

- Show Scripts section with names, descriptions, language badges
- Link to source URLs if provided
- Expandable code preview if content available

## Skill Registration, Publishing & Content Scanning

### Register API

**Endpoint:** `POST /api/skills/register`

**Authentication:** Required (API key or session)

**Request Body:**
```json
{
  "owner": "github-username",
  "repo": "repo-name",
  "skill_path": "path/to/skill",      // optional: specific skill subfolder
  "scan": true                         // optional: scan entire repo for SKILL.md files
}
```

**Validation:**
- User must authenticate (API key or session)
- GitHub repo ownership verified (write access via collaborator API check)
- Content scanned & sanitized before DB insert
- Scans repo for SKILL.md files at specified path or root
- Falls back to repo-wide scan if single skill not found
- Lazy-fetch: full content fetched on demand (skill-detail API)

### CLI Publish Command

**Command:** `skillx publish [owner/repo]`

**Modes:**
- `skillx publish owner/repo` — Auto-detect single SKILL.md or scan all
- `skillx publish owner/repo --path path/to/skill` — Specific skill path
- `skillx publish owner/repo --scan` — Force full repo scan
- `skillx publish --dry-run` — Validation only (requires auth)

**Authentication:** Requires API key (stored in `~/.skillx/config.json`)

**Workflow:**
1. Parse owner/repo from command argument
2. Validate authentication
3. Fetch user's GitHub access token from Better Auth `account` table
4. Check collaborator status on target repo via GitHub API
5. Scan repo for SKILL.md files (top 50, then 500, then all)
6. Extract metadata (name, description, author, etc.)
7. Sanitize & scan content for security risks
8. POST to `/api/skills/register` with auth token
9. Return slug or error

### Content Security Scanning

```
Skill content (SKILL.md)
    ↓
[scanContent: detect patterns]
    ├─ DANGER: invisible Unicode (zero-width, bidi overrides), ANSI escapes,
    │          prompt injection patterns, javascript: URLs, shell injection
    │          → risk_label = "danger"
    │
    ├─ CAUTION: script/iframe/form tags, URL shorteners, base64 blocks,
    │           XML-style tags (2+ matches threshold) → risk_label = "caution"
    │
    └─ else → risk_label = "safe"
    ↓
[sanitizeContent: remove zero-width chars & ANSI escapes]
    ↓
INSERT INTO skills (content, risk_label, ...) VALUES (sanitized_content, label, ...)
    ↓
Lazy-fetch (skill-detail API) also scans + sanitizes before returning
```

**Invisible Unicode Detection (Trojan Source Prevention):**

- **Zero-width chars** — U+200B, U+200C, U+200D, U+FEFF, U+2060-U+2064, U+2066-U+206F
- **Bidirectional overrides** — U+202A-U+202E (used to reverse code logic visually)
- Both types trigger "danger" label immediately

**Risk Labels:**

- **"safe"** — No dangerous patterns detected
- **"caution"** — Multiple suspicious patterns (2+), warnings shown to users
- **"danger"** — Prompt injection, invisible chars, ANSI escapes, or injection vectors detected (strong warnings)
- **"unknown"** — Not yet scanned (legacy data)

**Response (single skill):**
```json
{
  "skill": {
    "slug": "owner-skill-name",
    "name": "Skill Name",
    "author": "github-username",
    "description": "..."
  },
  "created": true
}
```

**Response (multi-skill scan):**
```json
{
  "skills": [
    { "slug": "owner-skill-1", "name": "...", "author": "..." },
    { "slug": "owner-skill-2", "name": "...", "author": "..." }
  ],
  "registered": 2,
  "skipped": 1
}
```

**Status Codes:**
- 200: Success
- 401: Unauthenticated
- 403: No write access to GitHub repo
- 404: No SKILL.md files found

## Deployment Architecture

```
┌──────────────────────────────────────────────────────────┐
│              Cloudflare Global Network                    │
│         (Anycast routing, auto-scaling)                   │
├──────────────────────────────────────────────────────────┤
│                                                           │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Cloudflare Workers (Edge Compute)                  │  │
│  │ - Runs React Router v7 SSR app                     │  │
│  │ - Routes requests to handlers                      │  │
│  │ - Executes auth, validation, DB queries           │  │
│  └──────────┬──────────────────────────────────────────┘  │
│             │                                             │
│  ┌──────────┴──────────────────────────────────────────┐  │
│  │ Cloudflare D1 (SQLite Database)                    │  │
│  │ - Primary data store                               │  │
│  │ - Geo-replicated (3x copies)                       │  │
│  │ - Atomic transactions                              │  │
│  │ - FTS5 extension enabled                           │  │
│  └─────────────────────────────────────────────────────┘  │
│                                                           │
│  ┌──────────┬────────────────┬────────────────────────┐  │
│  │          │                │                        │  │
│  ↓          ↓                ↓                        ↓  │
│ ┌──────┐ ┌────────┐ ┌──────────────┐ ┌──────────────┐│
│ │  KV  │ │Vectorize│ │   Workers AI │ │     R2      ││
│ │Cache │ │Embedding│ │(Embeddings) │ │   Storage   ││
│ │      │ │Index    │ │             │ │             ││
│ └──────┘ └────────┘ └──────────────┘ └──────────────┘│
│                                                       │
└──────────────────────────────────────────────────────┘
```

## Security Architecture

### Network Security
- TLS 1.3 (Cloudflare default)
- DDoS protection (Cloudflare)
- WAF rules enabled
- Rate limiting: 100 req/min per IP

### Application Security
- API key hashing (SHA-256)
- Session cookie (httpOnly, secure, sameSite)
- CORS enabled for trusted origins
- SQL injection prevention (Drizzle ORM)
- XSS protection (React escapes by default)

### Data Security
- D1 encryption at rest
- KV encryption at rest
- R2 encryption at rest
- No plaintext API keys stored
- Audit logging for sensitive operations

## Performance Characteristics

| Operation | Latency | Notes |
|-----------|---------|-------|
| Skill search | 200-800ms | Vectorize + FTS5, cached |
| Leaderboard | 100-500ms | D1 query, sorted by rating |
| Rate skill | 100-300ms | D1 insert + update |
| API key lookup | 50-150ms | D1 hash index |
| Page load (FCP) | <2s | React Router SSR |
| Vector embedding | 100-200ms | Workers AI via Cloudflare |

## Disaster Recovery

| Scenario | Recovery |
|----------|----------|
| Vectorize unavailable | Switch to FTS5-only search |
| D1 replica down | Automatic failover (3x replicas) |
| Cache miss (KV) | Recompute & recache |
| Worker crash | Cloudflare auto-restart |
| Data corruption | D1 point-in-time restore |

## Claude Code Plugin Marketplace Distribution

SkillX provides two Claude Code plugins via marketplace:

**Marketplace Catalog:** `.claude-plugin/marketplace.json`
- Registered as `skillx-marketplace` owned by SkillX.sh
- Contains plugin manifest entries with version, description, homepage, repository

**Plugins:**

1. **skill-creator** (v3.0.0)
   - Source: `.claude/skills/skill-creator/`
   - Purpose: Create/update Claude skills optimized for Skillmark benchmarks
   - Install: `/plugin install skill-creator@skillx-marketplace`

2. **skillx** (v1.0.0)
   - Source: `.claude/skills/skillx/`
   - Purpose: Search, install, use skills from SkillX.sh marketplace
   - Install: `/plugin install skillx@skillx-marketplace`

**Discovery Flow:**
```
/plugin marketplace add nextlevelbuilder/skillx
  ↓
Loads .claude-plugin/marketplace.json
  ↓
User sees skillx-marketplace with 2 plugins
  ↓
/plugin install skill-creator@skillx-marketplace
```

---

**Last Updated:** Mar 5, 2026
**Version:** 1.1
**Recent Additions:** Voting system, skill references/scripts, CLI publish command, GitHub ownership verification, content security scanning, lazy-fetch skill detail API
