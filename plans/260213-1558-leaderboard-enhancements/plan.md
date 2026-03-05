---
title: "Leaderboard Enhancements: Votes, Sort/Filter, Favorites, Preview"
description: "Add vote system, sort/filter controls, quick favorites, preview modal, and integrate votes into scoring algorithms"
status: complete
priority: P1
effort: 10h
branch: main
tags: [leaderboard, votes, ui, scoring, database]
created: 2026-02-13
---

# Leaderboard Enhancements

## Summary

Enhance the leaderboard with community engagement features: Reddit-style votes, sort/filter controls, quick favorites, preview modal, and integrate vote signal into search + leaderboard scoring algorithms.

## Context

- [Brainstorm Report](../reports/brainstorm-260213-1550-leaderboard-enhancements.md)
- [Schema](../../apps/web/app/lib/db/schema.ts)
- [Leaderboard API](../../apps/web/app/routes/api.leaderboard.ts)
- [Leaderboard Table](../../apps/web/app/components/leaderboard-table.tsx)
- [Home Leaderboard](../../apps/web/app/components/home-leaderboard.tsx)

## Phases

| # | Phase | Effort | Status | File |
|---|-------|--------|--------|------|
| 1 | Database + Vote API | 2h | complete | [phase-01](./phase-01-database-vote-api.md) |
| 2 | Sort/Filter + Author Link + Preview Modal | 3h | complete | [phase-02](./phase-02-leaderboard-sort-filter-preview.md) |
| 3 | Favorites Button + Vote Arrows + Auth Overlay | 3h | complete | [phase-03](./phase-03-leaderboard-favorites-votes-ui.md) |
| 4 | Scoring Algorithm Updates | 2h | complete | [phase-04](./phase-04-scoring-algorithm-updates.md) |

## Key Decisions

1. Votes coexist with 0-10 ratings (not replace)
2. Author links to `https://github.com/{author}` (GitHub profile)
3. Votes as 8th signal in search boost (7%, reduce RRF 50% -> 43%)
4. Votes as 7th signal in leaderboard composite (10%, reduce rating 35% -> 30%, installs 25% -> 20%)
5. Anon users see vote/favorite counts; login required to interact
6. Client-side overlay for user's own favorites/votes state (preserves KV cache)
7. Leaderboard API expanded with `description` + `category` for preview modal

## Dependencies

- Phase 2 depends on Phase 1 (vote count column in API response)
- Phase 3 depends on Phase 1 (vote API endpoint)
- Phase 4 depends on Phase 1 (vote_count column + votes table)
- Phases 2 and 3 are independent of each other

## Execution Order

```
Phase 1 (DB + API) --> Phase 2 (Sort/Filter/Preview) --|
                   --> Phase 3 (Favorites/Votes UI)  --|--> Phase 4 (Scoring)
```

## Cross-Plan Dependencies

**[Skill References & Scripts plan](../260213-1218-skill-references-scripts/plan.md)** also modifies `schema.ts` and adds a D1 migration (`0006`). No code conflicts — different columns and tables — but migration numbering matters:
- If refs plan implemented first: this plan uses migration `0007`
- If this plan implemented first: use `0006`, refs plan becomes `0007`
- Both add columns to skills table in `schema.ts` — non-overlapping, safe to merge in either order
- Scoring files (`boost-scoring.ts`, `leaderboard-scoring.ts`) are only modified by this plan, not refs plan

## Risks

| Risk | Level | Mitigation |
|------|-------|------------|
| Vote gaming (bots) | Medium | Auth required + rate limit |
| KV cache shows stale counts | Low | 5-min TTL acceptable; client overlay for own state |
| Score rebalancing shifts rankings | Medium | Monitor search quality post-deploy |
| Migration on 133K skills | Low | ALTER TABLE is fast; no data rewrite |

## Red Team Review

### Session — 2026-02-13
**Findings:** 13 total (10 accepted, 3 rejected)
**Severity breakdown:** 2 Critical, 5 High, 6 Medium (accepted: 2 Critical, 4 High, 4 Medium)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Vote count race condition (COUNT-then-UPDATE not atomic) | Critical | Accept | Phase 1 |
| 2 | No vote rate limiting (deferred to "future") | Critical | Accept | Phase 1 |
| 3 | Optimistic UI revert not implemented (comment placeholder) | High | Accept | Phase 3 |
| 4 | Bulk recompute 133K skills — no rollback/checkpoint | High | Accept | Phase 4 |
| 5 | Cache key versioning — stale v2 keys linger 5 min | High | Reject | — |
| 6 | Interaction fetch race on infinite scroll | High | Accept | Phase 3 |
| 7 | Unvalidated category in cache key (pollution) | High | Accept | Phase 2 |
| 8 | Category filter missing DB index | Medium | Accept | Phase 1 |
| 9 | Author GitHub username assumption | Medium | Accept | Phase 2 |
| 10 | Auth redirect loses context (no return URL) | Medium | Accept | Phase 3 |
| 11 | XSS in preview modal description | Medium | Reject | — |
| 12 | Batch interactions privacy concern | Medium | Reject | — |
| 13 | Fire-and-forget recompute monitoring | Medium | Accept | Phase 4 |

**Rejected rationale:**
- #5: 5-min TTL is the design intent. New requests use v3 key, old entries expire naturally. Not worth KV purge complexity.
- #11: React JSX auto-escapes text content. No dangerouslySetInnerHTML used. Standard React security.
- #12: Slug list contains public skill identifiers visible on public page. Same info in HTTP referer headers.

## Validation Log

### Session 1 — 2026-02-13
**Trigger:** Initial plan creation, post red-team review
**Questions asked:** 4

#### Questions & Answers

1. **[Migration]** Phase 1 migration: should the `idx_skills_category` index (added by red team) go in this leaderboard migration (0007), or in the refs/scripts migration (0006)?
   - Options: This migration (0007) | Refs/scripts migration (0006) | Separate migration (0008)
   - **Answer:** This migration (0007)
   - **Rationale:** Keep all leaderboard-related indexes together. Category filter is a leaderboard feature.

2. **[Architecture]** Vote rate limiting approach: how should the 10 votes/min limit be enforced?
   - Options: DB query (count recent votes) | KV-based counter | In-memory rate limiter
   - **Answer:** DB query: count recent votes
   - **Rationale:** Simple, no new dependencies. COUNT votes WHERE user_id=? AND updated_at > (now - 60s).

3. **[Scope]** Should `netVotes` display in the leaderboard table itself (new column), or only in the preview modal?
   - Options: Table column + modal | Modal only | Vote arrows show count
   - **Answer:** Table column + modal
   - **Rationale:** Visible at a glance alongside vote arrows. Provides quick comparison across skills.

4. **[Tradeoffs]** Bulk recompute after scoring changes: when should this run relative to the deploy?
   - Options: Immediately after deploy | Scheduled off-peak | Skip
   - **Answer:** Immediately after deploy
   - **Rationale:** ~30 min for 133K skills at batch=100. Ensures consistent scoring from the start.

#### Confirmed Decisions
- **Category index:** Goes in migration 0007 (leaderboard plan)
- **Rate limiting:** DB-based, count recent votes in 60s window
- **Net votes display:** Visible in table column AND preview modal
- **Bulk recompute:** Run immediately after deploy

#### Action Items
- [ ] Add rate limiting implementation detail (DB query pattern) to Phase 1
- [ ] Ensure Phase 2 shows netVotes as a table column (not just modal data)
- [ ] Document immediate post-deploy recompute in Phase 4

#### Impact on Phases
- Phase 1: Rate limiting uses DB query (`COUNT(*) FROM votes WHERE user_id=? AND updated_at > ?`). No KV dependency.
- Phase 2: `netVotes` shown as a visible table column in leaderboard (not hidden in modal only)
- Phase 4: Bulk recompute runs immediately after deploy, not deferred to off-peak
