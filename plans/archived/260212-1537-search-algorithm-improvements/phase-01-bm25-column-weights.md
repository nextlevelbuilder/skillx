---
phase: 1
priority: critical
status: pending
effort: 5 min
---

# Phase 1: BM25 Column Weights

## Overview

Add column weights to FTS5 `bm25()` function: name (10x), description (5x), content (1x). Single-line change, biggest bang-for-buck improvement.

## Key Insight

FTS5 `bm25()` accepts optional weight args per column in column-definition order. Current code uses default equal weights — a name match scores same as a content match.

## Related Code Files

- **Modify**: `apps/web/app/lib/search/fts5-search.ts` (lines 35-41)

## Implementation Steps

1. In `fts5-search.ts`, update the SQL query:

```sql
-- FROM:
SELECT s.id as skill_id, bm25(skills_fts) as bm25_score
FROM skills_fts
JOIN skills s ON skills_fts.rowid = s.rowid
WHERE skills_fts MATCH ?
ORDER BY bm25(skills_fts)
LIMIT ?

-- TO:
SELECT s.id as skill_id, bm25(skills_fts, 10.0, 5.0, 1.0) as bm25_score
FROM skills_fts
JOIN skills s ON skills_fts.rowid = s.rowid
WHERE skills_fts MATCH ?
ORDER BY bm25(skills_fts, 10.0, 5.0, 1.0)
LIMIT ?
```

Column order matches FTS5 definition: `fts5(name, description, content, ...)` → weights: `10.0, 5.0, 1.0`.

2. Run `pnpm typecheck` to verify no compile errors.

## Todo

- [ ] Update `bm25()` calls with column weights `10.0, 5.0, 1.0`
- [ ] Verify typecheck passes

## Success Criteria

- Searching an exact skill name returns that skill at rank 1
- BM25 scores change (higher for name matches, lower for content-only matches)
- No latency regression

## Risk

**Low**. BM25 weights are a standard FTS5 feature. Can revert to `bm25(skills_fts)` instantly.
