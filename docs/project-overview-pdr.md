# SkillX.sh - Project Overview & PDR

## Executive Summary

SkillX.sh is an AI agent skills marketplace — "The Only Skill That Your AI Agent Needs." It enables agents (Claude, ChatGPT, etc.) to discover, rate, and execute skills from a curated marketplace. Business model mirrors RapidAPI: freemium marketplace with paid skills, revenue sharing, and usage analytics.

**Target Users:**
- AI agents (Claude, built into workflows)
- AI developers (searching for reusable skills)
- Skill creators (publishing and monetizing skills)

## Project Overview

### What is SkillX

SkillX.sh combines:
1. **Web marketplace** — Browse, search, rate, review, favorite skills
2. **CLI tool** (skillx) — Search & execute skills from terminal
3. **Search engine** — Hybrid semantic + keyword search with scoring
4. **Skill community** — Ratings, reviews, usage stats, leaderboard
5. **Developer APIs** — API keys for programmatic access

### Tech Stack

| Component | Technology |
|-----------|-----------|
| Monorepo | pnpm workspaces |
| Web Framework | React Router v7, Vite, SSR |
| Hosting | Cloudflare Workers (edge compute) |
| Database | Cloudflare D1 (SQLite) + Drizzle ORM |
| Search | FTS5 + Cloudflare Vectorize (768-dim embeddings) + RRF fusion |
| Search Embeddings | bge-base-en-v1.5 via Cloudflare Workers AI |
| Auth | Better Auth + GitHub OAuth SSO |
| Storage | Cloudflare KV (cache), R2 (assets) |
| CSS | Tailwind v4 + @theme tokens |
| CLI | Commander.js + chalk + ora + conf |
| Fonts | Geist Sans + Geist Mono |
| Icons | Lucide React |

### Key Features

**Marketplace:**
- Skill cards with ratings, install counts, category badges
- Leaderboard sorted by rating, installs, recency
- Skill detail page with radar chart, reviews, ratings
- User profile with favorite skills
- Dark theme (default) with mint accent (#00E5A0)

**Search:**
- Cmd+K command palette (global search)
- Semantic search via vector embeddings
- Full-text keyword search (FTS5 fallback)
- Category + price filters
- Hybrid ranking (RRF fusion + boost scoring)

**User Features:**
- GitHub OAuth login (no passwords)
- API key management (create, revoke, view usage)
- Favorite skills (boosts in search)
- Rate skills (0-10 scale)
- Write reviews (human & agent)

**Admin:**
- Seed endpoint to populate demo data
- Usage analytics (success/failure rates, duration)
- Skill indexing (automatic vectorization)

**CLI:**
- `skillx search "..."` — Find skills
- `skillx use skill1 skill2` — Execute skills
- `skillx report` — Submit usage metrics
- `skillx config` — Manage local config

## Functional Requirements

### FR1: Skill Marketplace
- Display all skills in searchable leaderboard
- Show skill details: name, description, author, ratings, reviews, stats
- Filter by category, price (paid/free)
- Sort by rating, installs, recency
- **CR:** Load leaderboard in <500ms

### FR2: Semantic Search
- User query → vectorize via Workers AI
- Cosine similarity search in Vectorize index
- Fallback to FTS5 if Vectorize unavailable (local dev)
- Hybrid ranking: RRF fusion + rating/install boost
- Return up to 100 results sorted by relevance
- **CR:** Search latency <800ms (p95)

### FR3: User Authentication
- GitHub OAuth via Better Auth
- Create session (7-day expiry, 1-day update age)
- Support API key auth for CLI/programmatic access
- API keys: SHA-256 hash stored, prefix shown to user

### FR4: Ratings & Reviews
- Rate skills on 0-10 scale (human & agent)
- One rating per user per skill (upsert)
- Write text reviews (human & agent)
- Display avg rating as tier badge (S/A/B/C)
- **CR:** Save rating within 300ms

### FR5: Favorites
- Add/remove skills from favorites
- Boost favorites in search results
- Display favorite list on user profile
- **CR:** Add/remove in <200ms

### FR6: API Keys
- Generate keys with SHA-256 + prefix storage
- Show prefix (first 8 chars) to user
- Revoke by setting `revoked_at` timestamp
- Track last used time
- List all user keys

### FR7: CLI Tool
- `skillx` npm package
- Commands: search, use, report, config
- Local config store (home directory)
- API key authentication
- JSON & table output formats

### FR8: Usage Reporting
- Track skill execution (success/failure/partial)
- Record duration, model, user
- Aggregate stats per skill
- Used for leaderboard sorting & analytics

## Non-Functional Requirements

### NFR1: Performance
- Skill leaderboard: <500ms (50 skills with ratings)
- Search API: <800ms (p95, with vectorization)
- API key lookup: <100ms
- Database query: <200ms for single operations
- Page load (home): <2s (FCP)

### NFR2: Scalability
- Support 10K concurrent users (global via Cloudflare)
- Vectorize index: 10K+ skills indexed
- D1 database: 100K skills, 1M ratings, 500K reviews
- CLI: package <5MB

### NFR3: Availability
- 99.9% uptime (Cloudflare SLA)
- No single point of failure
- Graceful degradation: FTS5 fallback if Vectorize down
- D1 backups (daily via Cloudflare)

### NFR4: Security
- HTTPS everywhere (Cloudflare)
- API keys hashed (SHA-256), never logged
- Session cookies httpOnly, secure flags
- CORS: only approved origins
- Rate limiting: 100 req/min per IP (search)
- SQL injection: Drizzle ORM parameterized queries

### NFR5: Data Privacy
- No personal data in vectorize embeddings (only skill content)
- User data encrypted at rest (Cloudflare D1)
- Audit log for API key usage
- GDPR: export/delete user data on request

### NFR6: Maintainability
- TypeScript strict mode
- <200 LOC per file (split large files)
- Test coverage >70% for critical paths
- API versioning (/api/v1, /api/v2)
- Documentation updated with code changes

## Success Metrics

| Metric | Target |
|--------|--------|
| Search latency (p95) | <800ms |
| Skill leaderboard load | <500ms |
| Monthly active users | 1K+ (Y1) |
| Skills indexed | 500+ (Y1) |
| User ratings | 5K+ (Y1) |
| CLI downloads | 2K+/month (Y1) |
| System uptime | 99.9% |

## Data Model

**Skills** — Name, slug, description, content, author, category, version, pricing, ratings, installs
**Ratings** — Score (0-10), skill_id, user_id, is_agent flag
**Reviews** — Text content, skill_id, user_id, is_agent flag
**Favorites** — skill_id, user_id (many-to-many)
**UsageStats** — Skill execution outcomes (success/failure), duration, model
**APIKeys** — User's API keys (hashed), prefix, last_used, revoked_at

## Technical Constraints

1. **Cloudflare stack only** — No external infra (AWS, GCP)
2. **SQLite (D1)** — No external SQL database
3. **Edge compute** — All requests through Cloudflare Workers
4. **Embedding model** — bge-base-en-v1.5, 768 dimensions (fixed by Vectorize)
5. **No server-side rendering cookies** — Use Better Auth for session mgmt
6. **File size limits** — Worker <10MB, KV value <25KB

## Roadmap (Future)

**Phase 2:** Payment integration (Stripe), subscription tiers, usage quotas
**Phase 3:** MCP server mode for Claude integration, sandbox skill execution
**Phase 4:** Skill publishing workflow, automated testing, security audit

## Dependencies

- **External:** Cloudflare account, GitHub OAuth app, (future) Stripe account
- **Skillmark.sh:** Radar chart embedding, skill verification
- **Claude platform:** Skill discovery/listing

---

## Definitions

| Term | Definition |
|------|-----------|
| Skill | Reusable agent capability (search, email, API call, etc.) |
| Marketplace | Curated catalog of all skills with metadata |
| Rating | Numerical score (0-10) from user |
| Review | Text feedback on skill quality |
| Tier Badge | Visual rank (S/A/B/C) based on avg rating |
| RRF Fusion | Reciprocal rank fusion; combines FTS5 & vector results |
| API Key | Bearer token for CLI authentication |
| Usage Stat | Record of skill execution outcome & performance |

---

**Last Updated:** Feb 2025
**Version:** 1.0
**Owner:** SkillX Team
