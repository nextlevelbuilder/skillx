# SkillX.sh

**The Only Skill That Your AI Agent Needs.**

SkillX is an AI agent skills marketplace — combining a web marketplace, CLI tool, and hybrid search engine to help agents discover and execute the best skills for their tasks.

## Quick Start

### Web Interface

```bash
# Install dependencies
pnpm install

# Start development server
cd apps/web && pnpm dev

# Open http://localhost:5173
# Test with: curl http://localhost:5173/api/admin/seed
```

### CLI Tool

```bash
# Install globally
npm install -g skillx-sh

# Search for skills
skillx search "data processing"

# Use a skill
skillx use skillx-search

# Search and use in one command
skillx use "data processing" --search

# Report execution result
skillx report --outcome success --duration 1234

# Configure API key
skillx config set SKILLX_API_KEY sk_prod_...
```

## What is SkillX?

SkillX combines three components:

### 1. Web Marketplace
- Browse 500+ skills with ratings, reviews, usage stats
- Leaderboard sorted by quality metrics
- Add skills to favorites for personalized search
- GitHub OAuth login (no passwords)

### 2. Hybrid Search Engine
- **Semantic search** via vector embeddings (bge-base-en-v1.5)
- **Keyword search** via SQLite FTS5
- **Ranking** using reciprocal rank fusion + boost scoring
- Search latency: <800ms p95

### 3. CLI Tool (skillx)
```bash
skillx search "email validation"
skillx use skillx-email
skillx report --outcome success
skillx config set/get KEY VALUE
```

### 4. Claude Code Plugin Marketplace
Discover and install skills directly in Claude Code:
```bash
/plugin marketplace add nextlevelbuilder/skillx
/plugin install skill-creator@skillx-marketplace
/plugin install skillx@skillx-marketplace
```

**Plugins:**
- **skill-creator** (v3.0.0) — Create/update skills optimized for Skillmark benchmarks
- **skillx** (v1.0.0) — Search and use skills from SkillX.sh marketplace

Chinese users can also search and install skills through [Skills宝](https://skilery.com).

## Architecture

**Tech Stack:**
- Frontend: React Router v7 + Tailwind v4 (dark theme, mint accent)
- Backend: Cloudflare Workers + D1 (SQLite)
- Search: Vectorize (embeddings) + FTS5 (keywords) + RRF fusion
- Auth: Better Auth + GitHub OAuth
- Storage: KV (cache), R2 (assets)
- AI: Cloudflare Workers AI (bge-base-en-v1.5 embeddings)

**Codebase:**
```
skillx/
├── apps/web/              # React Router SSR app (~2,000 LOC)
│   ├── routes/            # Pages (home, search, detail, settings) + APIs
│   ├── components/        # UI components
│   └── lib/               # DB, auth, search, vectorization
├── packages/cli/          # skillx npm package (~400 LOC)
├── .claude-plugin/        # Claude Code plugin marketplace
│   └── marketplace.json   # Marketplace catalog + plugin manifests
├── .claude/skills/        # Claude Code skills
│   ├── skill-creator/     # Skill creation tool (v3.0.0)
│   └── skillx/            # SkillX marketplace CLI skill (v1.0.0)
├── scripts/               # Seed data (30 real skills)
└── docs/                  # Documentation
```

## Features

**User-Facing:**
- Semantic + keyword search with instant results
- Rate skills (0-10) and write reviews
- Favorites for personalized recommendations
- Leaderboard with sorting & filtering
- API key management for CLI access
- User profiles with usage stats

**Admin:**
- Seed endpoint for demo data
- Usage analytics & reporting
- Skill indexing & vectorization
- Analytics dashboard

**Developer:**
- REST API with session + API key auth
- CLI for programmatic access
- Flexible search filters (category, price, rating)
- Pagination (limit, offset)

## Deployment

### Development
```bash
cd apps/web
pnpm dev                    # Local with D1 SQLite
```

### Production (Cloudflare)
```bash
# Setup Cloudflare account, create bindings, set secrets
wrangler d1 create skillx-db
wrangler kv:namespace create skillx-cache
wrangler vectorize create skillx-skills

# Deploy
cd apps/web
pnpm build
wrangler deploy --env production

# Seed production data
curl https://skillx.sh/api/admin/seed
```

**See [deployment-guide.md](./docs/deployment-guide.md) for detailed instructions.**

## Documentation

| Doc | Purpose |
|-----|---------|
| [project-overview-pdr.md](./docs/project-overview-pdr.md) | Product requirements, features, business model |
| [codebase-summary.md](./docs/codebase-summary.md) | Directory structure, modules, data flow |
| [code-standards.md](./docs/code-standards.md) | Coding patterns, conventions, best practices |
| [system-architecture.md](./docs/system-architecture.md) | Architecture diagrams, API contracts, security |
| [project-roadmap.md](./docs/project-roadmap.md) | Phases, milestones, timelines |
| [deployment-guide.md](./docs/deployment-guide.md) | Setup, deployment, troubleshooting |
| [design-guidelines.md](./docs/design-guidelines.md) | UI/UX design system (dark theme, mint) |

## API Endpoints

**Search (public):**
```
POST /api/search
{ query, category?, is_paid?, limit?, offset? }
Returns: { results: [Skill], count }
```

**Skill Details (public):**
```
GET /api/skills/:slug
Returns: { skill, ratings: [], reviews: [] }
```

**Auth-Protected (session or API key):**
```
POST /api/skills/:slug/rate { score }           # Rate 0-10
POST /api/skills/:slug/review { content }       # Write review
POST /api/skills/:slug/favorite                 # Add favorite
DELETE /api/skills/:slug/favorite               # Remove favorite
POST /api/report { outcome, duration_ms }       # Report usage
```

**User APIs (session only):**
```
GET /api/user/api-keys                          # List keys
POST /api/user/api-keys { name }                # Create key
DELETE /api/user/api-keys/:id                   # Revoke key
```

## Development

### Prerequisites
- Node.js >=18
- pnpm
- Cloudflare account

### Commands
```bash
pnpm install                # Install dependencies
pnpm dev                    # Start dev server (apps/web)
pnpm test                   # Run tests
pnpm build                  # Build for production
pnpm lint                   # Check linting
```

### Running Tests
```bash
# Unit tests
pnpm test

# Type checking
pnpm tsc --noEmit

# Linting
pnpm lint
```

## Project Status

**Phase 1 (Complete):** MVP with web marketplace, CLI, hybrid search, auth, ratings/reviews, API keys

**Phase 2 (Next):** Payment integration (Stripe), production hardening, GitHub OAuth setup

**Phase 3 (Future):** MCP server mode, skill execution sandbox, Skillmark integration

See [project-roadmap.md](./docs/project-roadmap.md) for details.

## Performance Metrics

| Metric | Target |
|--------|--------|
| Search latency (p95) | <800ms |
| Leaderboard load | <500ms |
| Page FCP | <2s |
| Uptime | 99.9% |

## Security

- API keys hashed (SHA-256)
- Session cookies (httpOnly, secure, sameSite)
- SQL injection prevention (Drizzle ORM)
- CORS enabled for trusted origins
- Rate limiting (100 req/min per IP)
- HTTPS enforced (Cloudflare TLS 1.3)

## License

MIT

## Contributing

1. Read [code-standards.md](./docs/code-standards.md)
2. Create feature branch
3. Test locally: `pnpm test && pnpm lint`
4. Submit PR with description

---

**Learn more:** [docs/](./docs/) directory
