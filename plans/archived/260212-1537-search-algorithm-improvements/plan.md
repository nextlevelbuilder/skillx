---
status: archived
created: 2026-02-12
archived: 2026-03-05
branch: main
---

# Search Algorithm Improvements

Improve hybrid search ranking quality across 6 changes: BM25 column weights, log-scale normalization, expanded boost formula (7 signals), pre-filtering, prefix matching, query aliases.

## Context

- **Brainstorm**: `plans/reports/brainstorm-260212-1537-search-algorithm-improvements.md`
- **Current docs**: `docs/search-algorithm.md`
- **Scale**: 1000+ skills, ranking quality priority
- **Architecture**: FTS5 + Vectorize + RRF + boost scoring (no infra changes)

## Phases

| # | Phase | Status | Effort | Files |
|---|-------|--------|--------|-------|
| 1 | BM25 column weights | complete | 5 min | fts5-search.ts |
| 2 | Log-scale normalization | complete | 15 min | boost-scoring.ts |
| 3 | Expanded boost formula | complete | 1-2h | boost-scoring.ts, hybrid-search.ts |
| 4 | Pre-filtering | complete | 1h | fts5-search.ts, vector-search.ts, hybrid-search.ts |
| 5 | Prefix matching | complete | 30 min | fts5-search.ts |
| 6 | Query aliases | complete | 30 min | query-aliases.ts (new), fts5-search.ts |

## Key Dependencies

- Phase 3 depends on phase 2 (log-scale used in new formula)
- Phase 4 changes function signatures in fts5-search.ts and vector-search.ts → update callers in hybrid-search.ts
- Phase 5 modifies FTS5 query construction → build on phase 4's filter changes
- Phase 6 is optional, evaluate ROI after phases 1-5

## Risk

- **Medium**: Wrong boost weights degrade results. Mitigate: test with sample queries, keep old weights as fallback.
- **Low**: Pre-filtering reduces candidate pool too much. Mitigate: only filter at retrieval when filters explicitly provided.
