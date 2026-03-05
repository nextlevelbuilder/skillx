---
phase: 4
priority: high
status: pending
effort: 1h
depends_on: [1]
---

# Phase 4: Pre-Filtering

## Overview

Push category/is_paid filters from post-scoring stage into FTS5 WHERE clause and Vectorize metadata filter. Avoids scoring irrelevant results that get discarded.

## Key Insight

Current pipeline scores all candidates then filters. At 1000+ skills with category filter, this can mean scoring 200+ results to keep 20. Moving filters to retrieval eliminates waste.

## Related Code Files

- **Modify**: `apps/web/app/lib/search/fts5-search.ts` — add filter params to function signature and SQL WHERE
- **Modify**: `apps/web/app/lib/search/vector-search.ts` — add Vectorize metadata filter
- **Modify**: `apps/web/app/lib/search/hybrid-search.ts` — pass filters to retrieval functions, remove post-filter stage

## Implementation Steps

### Step 1: Update `fts5Search` signature and query

```ts
// NEW signature:
export async function fts5Search(
  db: D1Database,
  query: string,
  limit = 20,
  filters?: { category?: string; is_paid?: boolean }
): Promise<FTS5Result[]> {
```

Build dynamic SQL with conditional WHERE clauses:

```ts
const sanitized = query.replace(/[^\w\s]/g, '').trim();
if (!sanitized) return [];

// Build WHERE conditions and bind params
let sql = `
  SELECT s.id as skill_id, bm25(skills_fts, 10.0, 5.0, 1.0) as bm25_score
  FROM skills_fts
  JOIN skills s ON skills_fts.rowid = s.rowid
  WHERE skills_fts MATCH ?1
`;
const params: (string | number)[] = [sanitized];
let paramIdx = 2;

if (filters?.category) {
  sql += ` AND s.category = ?${paramIdx}`;
  params.push(filters.category);
  paramIdx++;
}

if (filters?.is_paid !== undefined) {
  sql += ` AND s.is_paid = ?${paramIdx}`;
  params.push(filters.is_paid ? 1 : 0);
  paramIdx++;
}

sql += ` ORDER BY bm25(skills_fts, 10.0, 5.0, 1.0) LIMIT ?${paramIdx}`;
params.push(limit);

const stmt = db.prepare(sql);
const results = await stmt.bind(...params)
  .all<{ skill_id: string; bm25_score: number }>();
```

### Step 2: Update `vectorSearch` signature

```ts
export async function vectorSearch(
  vectorize: VectorizeIndex,
  ai: Ai,
  query: string,
  limit = 20,
  filters?: { category?: string; is_paid?: boolean }
): Promise<VectorResult[]> {
```

Add metadata filter to Vectorize query:

```ts
// Build Vectorize filter from search filters
const vectorFilter: Record<string, string | number> = {};
if (filters?.category) {
  vectorFilter.category = filters.category;
}
if (filters?.is_paid !== undefined) {
  vectorFilter.is_paid = filters.is_paid ? 1 : 0;
}

const vectorResults = await vectorize.query(queryVector, {
  topK: limit * 3,
  returnMetadata: true,
  ...(Object.keys(vectorFilter).length > 0 && { filter: vectorFilter }),
});
```

**Note**: Vectorize metadata filter works because `index-skill.ts` already stores `category` and `is_paid` in vector metadata.

### Step 3: Update `hybridSearch` to pass filters

```ts
// Pass filters to both retrieval functions
const [fts5Results, vectorResults] = await Promise.all([
  fts5Search(d1, query, limit, filters),
  vectorSearch(vectorize, ai, query, limit, filters),
]);
```

### Step 4: Remove post-filter stage in `hybridSearch`

Delete the post-filter block (lines ~200-210):

```ts
// REMOVE this block:
let filteredResults = finalResults;
if (filters?.category) {
  filteredResults = filteredResults.filter(
    (r) => r.category === filters.category
  );
}
if (filters?.is_paid !== undefined) {
  filteredResults = filteredResults.filter(
    (r) => r.is_paid === filters.is_paid
  );
}
return filteredResults;

// REPLACE with:
return finalResults;
```

### Step 5: Update fallback in `api.search.ts`

The FTS5 fallback in the API route also calls `fts5Search` — update call to pass filters:

```ts
const fts5Results = await fts5Search(env.DB, body.query, limit, {
  category: body.category,
  is_paid: body.is_paid,
});
```

### Step 6: Run `pnpm typecheck`

## Todo

- [ ] Add `filters` param to `fts5Search` and build dynamic SQL with conditional WHERE
- [ ] Add `filters` param to `vectorSearch` and pass Vectorize metadata filter
- [ ] Update `hybridSearch` to pass filters to both retrieval functions
- [ ] Remove post-filter block in `hybridSearch`
- [ ] Update FTS5 fallback calls in `api.search.ts`
- [ ] Verify typecheck passes

## Success Criteria

- Filtered searches return correct results (same as before, just faster)
- No results leak through that don't match filters
- Fewer candidates scored in boost stage when filters are active
- Unfiltered searches behave identically to before (no regression)

## Risk

**Low**. Logically equivalent to post-filtering — just moved earlier. Both FTS5 parameterized queries and Vectorize metadata filters are standard features.

One edge case: if filters are very restrictive and retrieval returns < limit results, the final set is smaller. This is correct behavior — no mitigation needed.
