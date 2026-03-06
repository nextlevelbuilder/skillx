# SkillX Project Roadmap

## Current Status

**Phase 1: Core Platform** — 100% COMPLETE ✓

MVP launched with all foundational features:
- Web marketplace UI
- Hybrid semantic + keyword search (vector + FTS5 + RRF fusion)
- User authentication (GitHub OAuth via Better Auth)
- Ratings & reviews system (0-10 scale)
- API key management (SHA-256 hashed)
- CLI tool (skillx) with search, use, publish, report, config commands
- Deployment on Cloudflare Workers + D1 + Vectorize stack
- Content security scanning (prompt injection, invisible chars, ANSI escapes)
- Install tracking with device ID deduplication

**Phase 3.1: Leaderboard Enhancements** — 100% COMPLETE ✓
- Voting system (up/down, Redis-style)
- Sort tabs (best, rating, installs, trending, newest)
- Category + risk filter dropdown
- Skill preview modal (description, category, stats)
- Scoring algorithm with 7 signals (rating 30%, installs 20%, votes 10%, rating_count 15%, recency 15%, reviews 5%, verified 5%)
- Client-side vote/favorite state overlay on KV-cached leaderboard
- Rate limiting (10 votes/min per user)

**Phase 3.2: Skill References & Scripts** — 100% COMPLETE ✓
- Database: `skill_references` table (title, filename, url, type enum, content)
- Database: `scripts` JSON column on skills table
- Database: `fts_content` computed column for extended FTS5 search
- GitHub fetcher: Tree API scan for SKILL.md + metadata extraction
- Seed pipeline: Top 50 skills → 500 → full rollout (progressive)
- API: Detail endpoint returns references + scripts arrays
- UI: Skill detail page displays references + scripts sections
- CLI: `--include-refs` and `--include-scripts` flags for `skillx use`
- Vectorize indexing: Skill content + reference titles (200K vectors)

**Phase 3.5: Skill Publishing & Registration** — 100% COMPLETE ✓
- Register API: `/api/skills/register` with auth validation
- GitHub ownership verification via repo write access check
- Multi-skill scanning (single SKILL.md or repo-wide scan)
- Content sanitization & security scanning before storage
- CLI `skillx publish` command: auto-detect owner/repo
- Usage tracking via install counts and execution reports

---

## Phase 2: Production Hardening & Monetization

**Status:** Next Priority (after Phase 3.3+)
**Duration:** 4-6 weeks
**Goals:** Enable paid skills, payment processing, production deployment

### Milestones

#### 2.1 Payment Integration (Weeks 1-2)
- [ ] Stripe account setup + API keys
- [ ] Product setup in Stripe (paid skills)
- [ ] Payment UI (card entry, checkout modal)
- [ ] Webhook handlers (payment.created, payment.failed)
- [ ] Revenue tracking database (transactions table)
- [ ] Payout calculation (70% creator, 30% platform)

#### 2.2 GitHub OAuth Production Setup (Weeks 1-2)
- [ ] Create GitHub OAuth app (prod environment)
- [ ] Configure redirect URIs (skillx.sh domain)
- [ ] Set client ID/secret in production wrangler config
- [ ] Test full OAuth flow on production domain
- [ ] Disable development OAuth credentials

#### 2.3 Cloudflare Production Setup (Weeks 2-3)
- [ ] Create production Cloudflare account
- [ ] Set up custom domain (skillx.sh) + SSL
- [ ] Create production D1 database (skillx-db-prod)
- [ ] Create production KV namespace (kv-prod)
- [ ] Create production Vectorize index (skillx-skills-prod)
- [ ] Configure environment variables (.env.production)
- [ ] Enable Cloudflare Analytics + Observability

#### 2.4 Database Migration & Seeding (Weeks 3-4)
- [ ] Backup dev D1 database
- [ ] Run migrations on production D1
- [ ] Load seed data (30 initial skills)
- [ ] Verify data integrity
- [ ] Index skills in production Vectorize

#### 2.5 Testing & QA (Weeks 4-5)
- [ ] Load testing (1K concurrent users)
- [ ] Search performance testing (p95 <800ms)
- [ ] Payment flow testing (multiple payment methods)
- [ ] Auth flow testing (OAuth + API keys)
- [ ] Security audit (OWASP Top 10)
- [ ] Bug fixes & optimizations

#### 2.6 Deployment & Monitoring (Weeks 5-6)
- [ ] Deploy to production (wrangler publish)
- [ ] Monitor error rates, latency, uptime
- [ ] Set up alerts (error spikes, slow queries)
- [ ] Create runbook for common incidents
- [ ] Document rollback procedure

### Success Criteria
- [ ] Search latency p95 <800ms in production
- [ ] 99.5% uptime (first 30 days)
- [ ] Zero critical security issues
- [ ] Payment processing working for 10+ transactions
- [ ] GitHub OAuth SSO verified

---

## Phase 3: Skill Discovery & Execution

**Status:** Planned
**Duration:** 7-9 weeks
**Goals:** Leaderboard enhancements, skill references & scripts, MCP server, sandbox execution

### Milestones

> **Implementation order:** Ready-to-implement plans first (3.1, 3.2), then features with external dependencies (3.3-3.6).

#### 3.1 Leaderboard Enhancements — COMPLETE ✓

**Status:** All 4 phases implemented and merged
**Implementation plan:** [plans/260213-1558-leaderboard-enhancements/plan.md](../plans/260213-1558-leaderboard-enhancements/plan.md)

- [x] Phase 1: Database migration (`votes` table + skills columns) + Vote API
- [x] Phase 2: Sort/filter controls + clickable author + preview modal
- [x] Phase 3: Favorites button + vote arrows + auth overlay
- [x] Phase 4: Scoring algorithm updates (7 signals: rating 30%, installs 20%, votes 10%, rating_count 15%, recency 15%, reviews 5%, verified 5%)

#### 3.2 Skill References & Scripts — COMPLETE ✓

**Status:** All 6 phases implemented and merged
**Implementation plan:** [plans/260213-1218-skill-references-scripts/plan.md](../plans/260213-1218-skill-references-scripts/plan.md)

- [x] Phase 1: DB schema migration (`scripts`, `fts_content` columns + `skill_references` table)
- [x] Phase 2: GitHub fetcher script (Trees API, progressive rollout)
- [x] Phase 3: Seed pipeline + Vectorize integration
- [x] Phase 4: API & search updates (detail endpoint returns refs/scripts)
- [x] Phase 5: UI skill detail page (references + scripts sections)
- [x] Phase 6: CLI updates (`--include-refs`, `--include-scripts` flags)

#### 3.3 Skill Publishing & Registration — COMPLETE ✓

**Status:** Auth validation + CLI publish command implemented
**Implementation plan:** [plans/260305-skillx-publish-command/plan.md](../plans/260305-skillx-publish-command/plan.md)

- [x] Phase 1: Add auth + ownership validation to Register API
- [x] Phase 2: Create CLI `publish` command
- [x] Phase 3: Typecheck + manual verification

Features:
- GitHub repo ownership verification (write access check)
- Automatic content scanning for security
- Multi-skill registration support (single file or repo scan)
- CLI `skillx publish owner/repo` with dry-run mode

#### 3.4 MCP Server Implementation (Weeks 4-5) — NEXT UP

- [ ] Design MCP protocol for skill discovery
- [ ] Implement MCP server in CLI tool
- [ ] `skillx-mcp-server` package
- [ ] Claude integration via MCP
- [ ] Skill result formatting (JSON/markdown)

Example usage:
```bash
npx skillx-mcp-server
# Server listens on stdio
# Claude makes requests: { method: 'tools/call', name: 'search', args: { query } }
```

#### 3.5 Skillmark Integration (Weeks 5-6)

- [ ] Fetch radar charts from Skillmark.sh API
- [ ] Embed in skill detail page
- [ ] Cache radar charts (30 min TTL)
- [ ] Display skill verification badge

#### 3.6 Skill Execution Sandbox (Weeks 6-7)

- [ ] Research: Deno Deploy, AWS Lambda, or Cloudflare Workers
- [ ] Design execution environment (timeouts, resource limits)
- [ ] Implement skill runner (fetch SKILL.md, parse commands)
- [ ] Output capture (stdout, stderr, exit code)
- [ ] Security: sandboxing, env var isolation

### Success Criteria

**Phase 3.1-3.3 (Complete):**
- [x] References & scripts displayed on skill detail pages
- [x] CLI `skillx use --include-refs --include-scripts` shows all content
- [x] Leaderboard sort/filter/preview working
- [x] Vote system functional with rate limiting (10 votes/min per user)
- [x] Scoring algorithm updated with vote signal (7 signals total)
- [x] Skill publishing with GitHub ownership validation
- [x] Multi-skill registration from GitHub repos

**Phase 3.4-3.6 (Pending):**
- [ ] MCP server working with Claude
- [ ] 10+ skills successfully published via `skillx publish`
- [ ] Sandbox execution <5s per skill
- [ ] Radar charts loading & caching

---

## Phase 4: Advanced Features & Community

**Status:** Future
**Duration:** Q3-Q4 2025
**Goals:** Community features, advanced search, monetization

### Potential Features

#### Community
- [ ] User profiles with bio, avatar, verified badge
- [ ] Skill review comments (replies, threading)
- [ ] User reputation system (badges, achievements)
- [ ] Discussion forum per skill

#### Search & Discovery
- [ ] Trending skills (by rating, usage, recency)
- [ ] Personalized recommendations (based on favorites)
- [ ] Skill collections (curated bundles)
- [ ] Advanced filters (tags, language, performance)

#### Monetization
- [ ] Subscription tiers (free, pro, enterprise)
- [ ] Usage-based pricing (per API call)
- [ ] Team management (multi-user accounts)
- [ ] API quota system (e.g., 1K searches/month)

#### Analytics
- [ ] Skill creator dashboard (usage stats, revenue)
- [ ] User analytics (most-used skills, success rate)
- [ ] Platform analytics (total searches, revenue, growth)

---

## Metrics & Success Tracking

### Phase 1 (Complete)
| Metric | Target | Actual | Status |
|--------|--------|--------|--------|
| Skills indexed | 30+ | 30 | ✓ |
| Feature completeness | 100% | 100% | ✓ |
| Code coverage | 70%+ | TBD | ? |
| Documentation coverage | 100% | 100% | ✓ |

### Phase 2 (Next Priority)
| Metric | Target | Status |
|--------|--------|--------|
| Production uptime | 99.5% | Planned |
| Payment processing | 100% | Pending |
| Search latency p95 | <800ms | On track (local: <200ms) |
| GitHub OAuth production | Working | Planned |

### Phase 3 (In Progress)
| Metric | Target | Status |
|--------|--------|--------|
| Skills with references | 100% | Complete (all skills) |
| Skills with scripts | 100% | Complete (where applicable) |
| Leaderboard performance | <500ms | Complete |
| Vote system uptime | 99%+ | Complete |
| Security scanning coverage | 100% | Complete (all new skills) |
| Skills published via CLI | 10+ | In progress |
| MCP server adoption | 50+ users | Planned |
| Sandbox execution success | 95%+ | Planned |

---

## Dependencies & Blockers

### Phase 2 Dependencies
- Stripe account approval (usually <24hrs)
- Cloudflare domain setup (DNS changes)
- GitHub OAuth app creation (instant)

### Phase 3 Dependencies
- Skillmark.sh API documentation
- Deno Deploy or alternative sandbox provider
- MCP protocol finalization (Claude ecosystem)

### Known Blockers
- None currently identified

---

## Resource Allocation

| Phase | Team Size | Estimated Hours |
|-------|-----------|-----------------|
| Phase 1 (Complete) | 2 devs | 160h |
| Phase 2 | 2 devs | 180h |
| Phase 3 | 2-3 devs | 240h |
| Phase 4 | TBD | TBD |

---

## Timeline

```
Jan 2025    Feb 2025    Mar 2025    Apr 2025    May 2025
│           │           │           │           │
├─ Phase 1 ─┤
  Complete
            ├────── Phase 2 ──────┤
            Hardening & Payments
                        ├──────────── Phase 3 ─────────┤
                        MCP & Execution
                                    ├────── Phase 4 ──→
                                    Community & Advanced
```

---

## Decision Log

| Decision | Context | Date |
|----------|---------|------|
| Use Cloudflare stack | Serverless, edge compute, free tier | Jan 2025 |
| Hybrid search (vector + FTS5) | Balance semantic + keyword search | Jan 2025 |
| Better Auth + GitHub OAuth | Passwordless, minimal setup | Jan 2025 |
| Stripe for payments (Phase 2) | Market-leading, good CLI/API | TBD |
| MCP server for Claude (Phase 3) | Leverage Claude ecosystem | TBD |

---

**Last Updated:** Mar 5, 2026
**Next Review:** Mar 12, 2026
**Current Phase:** Phase 3 (Features) — Leaderboard (complete), References/Scripts (complete), Publishing (complete)
**Next Milestone:** Phase 3.4 MCP Server Implementation
