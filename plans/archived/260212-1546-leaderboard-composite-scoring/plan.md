---
status: archived
created: 2026-02-12
archived: 2026-03-05
branch: main
brainstorm: plans/reports/brainstorm-260212-1546-leaderboard-composite-scoring.md
---

# Leaderboard Composite Scoring

Replace naive single-column leaderboard sorting with multi-signal composite scoring, Bayesian average ratings, trending detection, and signal badges.

## Problem

Current leaderboard sorts by raw `avg_rating` or `install_count` DESC. A skill with 1 perfect rating outranks one with 500 solid ratings. FilterTabs is cosmetic. Search has 7-signal boost scoring but leaderboard ignores it.

## Solution Overview

- Precomputed `composite_score`, `bayesian_rating`, `trending_score`, `favorite_count` columns
- 5 tab modes: Best (composite), Top Rated (Bayesian), Most Installed, Trending (7d), Newest
- Signal badges (Top Rated, Popular, Trending, Well Maintained, Community Pick)
- Recomputation on write events (rate, favorite, usage report)
- Shared scoring utils with search's boost-scoring module

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | Schema migration + scoring utils | complete | S | schema.ts, scoring-utils.ts, boost-scoring.ts |
| 2 | Leaderboard scoring + recompute logic | complete | M | leaderboard-scoring.ts, recompute-skill-scores.ts |
| 3 | API routes — triggers + leaderboard tabs | complete | M | api.leaderboard.ts, api.skill-rate.ts, api.skill-favorite.ts, api.usage-report.ts |
| 4 | UI — FilterTabs, signal badges, table updates | complete | M | filter-tabs.tsx, signal-badge.tsx, leaderboard-table.tsx, leaderboard.tsx, home-leaderboard.tsx, home.tsx |
| 5 | Seed data backfill + typecheck + test | complete | S | seed script, typecheck |

## Key Dependencies

- Phase 2 depends on Phase 1 (schema columns + utils)
- Phase 3 depends on Phase 2 (scoring functions)
- Phase 4 depends on Phase 3 (API shape changes)
- Phase 5 runs after all phases (validation)
