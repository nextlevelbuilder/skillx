# CLAUDE.md

## Project

SkillX.sh — AI agent skills marketplace. Web marketplace + CLI + hybrid search engine. "The Only Skill That Your AI Agent Needs."

**Related documents:**
- Project initial brief: `./docs/project-initial-brief.md`
- Project overview: `./docs/project-overview-pdr.md`
- Project roadmap: `./docs/project-roadmap-pdr.md`
- Design guidelines: `./docs/design-guidelines.md`

## Tech Stack

Code standards: `./docs/code-standards.md`
Codebase summary: `./docs/codebase-summary.md`

- **Monorepo**: pnpm workspaces (`apps/web`, `packages/cli`)
- **Web**: React Router v7 + Vite + SSR on Cloudflare Workers
- **Database**: Cloudflare D1 (SQLite) + Drizzle ORM
- **Search**: FTS5 + Vectorize (768-dim, bge-base-en-v1.5) + RRF fusion
- **Auth**: Better Auth + GitHub OAuth (route: `api/auth/*`)
- **Cache**: Cloudflare KV (5min TTL search, 5min leaderboard)
- **Storage**: R2 (assets), Workers AI (embeddings)
- **CSS**: Tailwind v4 + `@theme` tokens (dark-only, mint accent `#00E5A0`)
- **CLI**: Commander.js + chalk + ora + conf (package name: `skillx-sh`, bin name: `skillx`)

## Directory Structure

```
apps/web/app/
├── routes/              # React Router pages + API handlers
│   ├── home.tsx         # Home page + leaderboard
│   ├── skill-detail.tsx # Skill page + ratings/reviews
│   ├── profile.tsx      # User favorites
│   ├── settings.tsx     # API key management
│   ├── auth-catchall.tsx# Better Auth handler
│   ├── api.search.ts    # Hybrid search API
│   ├── api.admin.seed.ts# Demo data seeding
│   └── api.skill-*.ts   # Rate, review, favorite APIs
├── components/          # UI components
│   ├── layout/          # Navbar, footer
│   ├── search-command-palette.tsx  # Cmd+K modal
│   └── leaderboard-table.tsx      # Sortable table
├── lib/
│   ├── db/              # schema.ts (Drizzle), queries
│   ├── auth/            # auth-server.ts, session-helpers.ts, api-key-utils.ts
│   ├── github/          # fetch-github-skill, scan-github-repo (Tree API)
│   ├── search/          # hybrid-search, vector-search, fts5-search, rrf-fusion, boost-scoring
│   ├── vectorize/       # embed-text, chunk-text, index-skill
│   └── cache/           # KV caching utilities
├── root.tsx             # App shell
└── app.css              # Tailwind + theme tokens

packages/cli/src/        # `skillx` npm package
├── commands/            # search, use, publish, report, config
├── lib/                 # api-client, config-store
└── index.ts             # Commander.js entry
```

## Commands

```bash
pnpm install              # Install all dependencies
pnpm dev                  # Start dev server (apps/web) → http://localhost:5173
pnpm build                # Build for production
pnpm typecheck            # TypeScript check (every workspace package)
pnpm test                 # Run unit tests (vitest) once
pnpm test:watch           # Run unit tests in watch mode
pnpm seed                 # Seed DB (requires ADMIN_SECRET env var)

# Inside apps/web:
pnpm db:generate          # Generate Drizzle migrations
pnpm db:migrate           # Apply migrations locally
pnpm db:migrate:remote    # Apply migrations to remote D1
```

## Routes (apps/web/app/routes.ts)

| Pattern | File | Auth |
|---------|------|------|
| `/` | home.tsx | None |
| `/skills/:slug` | skill-detail.tsx | None |
| `/skills/<slug>.md` | lib/markdown/skill-markdown-handler.ts, dispatched in `workers/app.ts` (React Router has no partial dynamic segment) | None; always anonymous, public cache |
| `/llms.txt`, `/llms-full.txt` | llms-txt.ts, llms-full-txt.ts (`?limit=` snaps to fixed sizes; KV-cached per origin and size) | None; protected bodies withheld |
| `/docs/harness`, `/docs/publishers` | docs-harness.tsx, docs-publishers.tsx | None |
| `/privacy`, `/terms`, `/support` | privacy.tsx, terms.tsx, support.tsx (shared `components/legal/`; linked from the footer and the ChatGPT plugin listing) | None |
| `*` (unknown path) | $.tsx (loader answers 404) | None |
| `/api/mcp` | api.mcp.ts (read-only MCP over JSON-RPC: `search_packages`, `get_package`, `get_release`, `check_compatibility`, `get_kit`; 64 KiB body cap, `RELEASE_READ_LIMITER` under `mcp:`) | None; only `get_kit` reads an unscoped Key/Session (owner view). Tools are annotated read-only; the ChatGPT plugin in `integrations/chatgpt/plugin` (docs/chatgpt-plugin.md) depends on them |
| `/profile` | profile.tsx | Session |
| `/settings` | settings.tsx | Session |
| `/api/auth/*` | auth-catchall.tsx | Better Auth |
| `/api/search` | api.search.ts | None |
| `/api/skills/:slug` | api.skill-detail.ts | None |
| `/api/skills/:slug/rate` | api.skill-rate.ts | Session, same-origin only |
| `/api/skills/:slug/review` | api.skill-review.ts | None (GET), Session same-origin only (POST) |
| `/api/skills/:slug/favorite` | api.skill-favorite.ts | Session, same-origin only |
| `/api/skills/:slug/install` | api.skill-install.ts | Optional (API key or X-Device-Id) |
| `/api/skills/:slug/vote` | api.skill-vote.ts | Session, same-origin only |
| `/api/report` | api.usage-report.ts | API key |
| `/api/user/api-keys` | api.user-api-keys.ts | Session |
| `/api/user/interactions` | api.user-interactions.ts | Session (graceful fallback) |
| `/api/skills/register` | api.skill-register.ts | Session (same-origin only)/Key |
| `/api/admin/seed` | api.admin.seed.ts | Admin secret |
| `/api/v1/packages/:scope/:slug/releases` | api.v1.package-releases.ts (GET list); action re-exported from api.v1.release-publish.ts (POST publish) | GET: optional Key/Session; POST: scoped key `releases:publish:@handle` (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/packages/:scope/:slug/releases/:version`, `/api/v1/releases/:digest/manifest` | api.v1.release-manifest.ts | Optional Key/Session (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/releases/:digest/files/*`, `/api/v1/releases/:digest/artifact` | api.v1.release-file.ts, api.v1.release-artifact.ts (digest reads take `?version=` and `?package=` selectors) | Optional Key/Session (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/packages/:scope/:slug/releases/:version/status` | api.v1.release-status.ts (GET signed `skillx.release-status/v1`, lazily issued) | Optional Key/Session (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/packages/:scope/:slug/releases/:version/state`, `/api/v1/publishers/:handle/state` | api.v1.release-state.ts (POST compare-and-set state change, audited) | Admin `X-Admin-Secret` or owner session/full API key; scoped keys refused (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/publishers` | api.v1.publishers.ts (POST provision an active publisher; idempotent, audited) | Admin `X-Admin-Secret` only; accounts 403 (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/keys` | api.v1.signing-keys.ts | None (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/packages/:scope/:slug/releases/:version/promote` | api.v1.release-promote.ts (POST channel move, audited; publish credentials may only promote) | Scoped key / OIDC publish token, owner session/key, or admin (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/packages/:scope/:slug/releases/:version/review`, `/api/v1/admin/quarantine` | api.v1.release-review.ts, api.v1.admin-quarantine.ts (approve/reject quarantined releases; see docs/release-resolution-policy.md) | Admin `X-Admin-Secret` only (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/publishers/:handle/trusted-publishers`, `.../:id/revoke` | api.v1.trusted-publishers.ts (GitHub OIDC trust config, audited) | Admin `X-Admin-Secret` only (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/oidc/github/token` | api.v1.oidc-github-token.ts (GitHub Actions JWT → 15 min `sxo_` token scoped `releases:publish:@handle`; jti replay-checked) | GitHub OIDC JWT (503 without `SKILLX_TOKEN_SECRET`; 404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/releases/:digest/artifact/url`, `/api/v1/downloads/:token` | api.v1.release-download-url.ts, api.v1.release-download.ts (5 min signed artifact URL for private/entitled releases) | URL: entitled Key/Session; download: the token (404 unless `SKILLX_RELEASES_API` on) |
| `/api/v1/kits/:scope/:name`, `/api/v1/kits/:scope/:name/*` | api.v1.kits.ts (personal kit revisions, rebase, conflicts, session-derived proposals and review, activate/rollback, lock; see docs/personal-kits-api.md) | Owner session or unscoped API key; scoped keys 401, non-owners 404; `revisions/:id/quarantine` admin secret only (404 unless `SKILLX_PERSONAL_KITS_API` on) |
| `/api/v1/collections`, `/api/v1/collections/:id`, `/api/v1/collections/:id/*` | api.v1.collections.ts (collections: create/update/delete, immutable revisions, members, clone; per-account cap, default 100; `:id/moderation` hides/unhides, audited; see docs/api-reference.md#collections) | Reads: owner, or anyone for unlisted/public and not hidden; writes: owner session or unscoped key; `moderation`: admin `X-Admin-Secret` only (404 unless `SKILLX_COLLECTIONS_API` on) |

## Database Tables (Drizzle schema)

`skills`, `skill_references`, `ratings`, `reviews`, `favorites`, `votes`, `usageStats`, `apiKeys`, `installs`
Plus Better Auth tables: `user`, `session`, `account`, `verification`

## Key Patterns

System architecture: `./docs/system-architecture.md`
Search algorithm: `./docs/search-algorithm.md`

**Page routes**: Loader (server-side data) + Component (React) + Action (form handling)

**API routes**: Auth check → Validate input → DB operation → JSON response

**Auth**: `getSession(request, env)` for session, `requireAuth(request, env)` for redirect

**Search**: Query → Embed (Workers AI) → Vectorize + FTS5 parallel → RRF fusion → 8-signal Boost scoring (vector 50%, FTS5 21.5%, rating 3%, installs 2%, votes 0.7%, recency 1%, reviews 0.15%, favorites 0.15%) → Filter → Cache (KV)

**Leaderboard**: 7-signal composite scoring (rating 30%, installs 20%, votes 10%, rating_count 15%, recency 15%, reviews 5%, verified 5%). Sort tabs (best/rating/installs/trending/newest), category + risk_label filter, preview modal. Client-side interaction overlay (votes + favorites) on KV-cached data.

**Skill Detail API**: Returns skill metadata + `references` array (title, url, type) + `scripts` array (name, description, language, url). References indexed in Vectorize for search.

**References & Scripts**: Stored separately — `skill_references` table for external docs/links/examples (title, filename, url, type enum, content). Scripts stored as JSON in `skills.scripts` (name, description, language, url). CLI flags: `skillx use --include-refs --include-scripts` to display.

**Vote API**: POST `/api/skills/:slug/vote` with `{ type: 'up'|'down'|'none' }` (`none` clears the vote). Rate limited 10 votes/min per user. Atomic count update via SQL subquery. Returns `{ vote_type, net_votes }`.

**CLI `skillx use` resolution**: `author/skill` (two-part → DB slug `author-skill`) | `org/repo/skill` (three-part → DB slug `org-skill`, fallback register from GitHub) | `slug` (direct lookup, fallback search) | `"keywords"` (search mode). Flags: `--include-refs`, `--include-scripts` for extended content. Display logic split into `use-display.ts` module.

**Register & Publish APIs**: POST `/api/skills/register` with `{ owner, repo, skill_path?, scan? }`. GitHub ownership verified via collaborator check. Content scanned for security (risk_label: safe/caution/danger/unknown). CLI `skillx import owner/repo [--path X] [--scan] [--dry-run]` — requires API key auth (`skillx publish owner/repo` is a deprecated alias). Releases: `skillx validate|pack|publish <dir>|promote` (`skillx release pack|publish` are aliases), JSON envelope via `--json`.

**Styling**: Always dark theme. Use `bg-slate-900`, `text-white`, `text-mint`, `border-mint/20`. Geist Sans/Mono fonts. Lucide icons.

## Important Caveats

- **Vectorize unavailable locally** — search falls back to FTS5-only in local dev. Use `--remote` flag or deploy for vector search.
- **Auth route must be `api/auth/*`** not `auth/*` — Better Auth client SDK calls `/api/auth/` paths.
- **API keys hashed with SHA-256** — never store or log plaintext keys.
- **Env vars** in `apps/web/.dev.vars` (local) or Cloudflare Secrets (production). Never commit `.dev.vars`.
- **Max 200 LOC per file** — split into focused modules if exceeded.
- **Seed data** in `scripts/seed-data.json` (30 real skills from skills.sh). Seed via `ADMIN_SECRET=... pnpm seed`.
- **Scoped API keys** — `api_keys.scopes` NULL = legacy key; scoped keys work only where their scope is checked: `releases:publish:@handle` on release publish/promote, `library:read` on release reads and kit reads, `kits:write:@handle` on that handle's kits (`lib/auth/scoped-viewer.ts`). They are stored under `hashScopedApiKey` (domain-separated), so legacy routes (`authenticateApiKey`, by plain key hash) never accept them. Apply migration 0012 to remote D1 before deploying (`docs/deployment-guide.md`).
- **Releases are byte-exact** — the release publish API (`app/lib/releases/`) never sanitizes; the scan only picks `published` vs `quarantined`. R2 writes are create-only, the D1 row is written last. Only `@agentkit/*` kit releases (metadata `provenance.provider = "kit"`) are signed as `skillx.release/v2`; everything else stays v1, and a registry signature never yields `signed-kit` trust. Kit release slugs omit `ak-` (`@agentkit/ak-*` is 400; AgentKit maps `ak-<x>` to `@agentkit/<x>`), and clients need skillx-sh 0.7.0+ to verify v2. See `docs/api-reference.md#publishing-releases`.
- **Same-origin on cookie mutations** — `SameSite=Lax` alone lets a sibling subdomain ride the session cookie, so a mutation a session can authenticate must refuse a foreign origin with `crossOriginRefusal` (`app/lib/auth/same-origin.ts`) before it writes. Session-only routes (rate, review, favorite, vote, user API keys) check first; routes that also take a Bearer key check only on the session path (register after `authenticateRequest`; every `resolveLimitedActor` caller — release state, promote, review, collections, personal kits —, 403 `cross_origin`). Add the check to any new cookie-authenticated mutation.
- **Content security scanning** — all SKILL.md content scanned for prompt injection, invisible chars, ANSI escapes, shell injection. `risk_label` column stores result ("safe"/"caution"/"danger"/"unknown"). Sanitization strips zero-width Unicode + ANSI escapes before storage.

## Deployment

Read here: `./docs/deployment-guide.md`

## Cloudflare Bindings (wrangler.jsonc)

| Binding | Service |
|---------|---------|
| `DB` | D1 Database |
| `VECTORIZE` | Vectorize Index |
| `KV` | KV Namespace |
| `R2` | R2 Bucket |
| `AI` | Workers AI |
| `RELEASE_READ_LIMITER` | Workers Rate Limiting (release read API, 300/60s per caller) |
| `RELEASE_WRITE_LIMITER` | Workers Rate Limiting (release state API, 30/60s per caller) |

## Documentation

All docs in `./docs/` — see design-guidelines.md for full UI/UX spec, code-standards.md for patterns, system-architecture.md for diagrams.

## Issue Workflow

Claim an issue before working on it so parallel contributors and agents do not
collide: assign yourself and move it through the labels `in progress` → `in review`
(code review running) → `done` (PR open) → `shipped` (merged to `main`); use `blocked`
with a comment naming the blocker while work cannot proceed. Search open
and closed issues first; comment on a related or duplicate issue with a reference
instead of starting parallel work. File an issue for an unrelated bug or gap you
find instead of widening the current PR silently.
