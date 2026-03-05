---
phase: 5
priority: medium
status: pending
effort: 30 min
depends_on: [4]
---

# Phase 5: Prefix Matching

## Overview

Add FTS5 prefix matching (`term*`) for short queries and multi-word queries. Improves autocomplete UX in the Cmd+K palette and partial-word searches.

## Key Insight

FTS5 natively supports prefix queries via `*` suffix. Query "depl" currently returns zero results. With prefix: `depl*` matches "deploy", "deployment", "deployer".

## Related Code Files

- **Modify**: `apps/web/app/lib/search/fts5-search.ts` — add prefix logic to query construction

## Implementation Steps

### Step 1: Add prefix query builder in `fts5-search.ts`

After sanitization, transform query terms to add prefix wildcards:

```ts
/** Convert query to FTS5 prefix-match format.
 *  Each term gets a * suffix for prefix matching.
 *  Example: "deploy tool" → "deploy* tool*" */
function toPrefixQuery(sanitized: string): string {
  return sanitized
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(' ');
}
```

### Step 2: Use prefix query in FTS5 search

In `fts5Search`, after sanitization:

```ts
const sanitized = query.replace(/[^\w\s]/g, '').trim();
if (!sanitized) return [];

// Use prefix matching for partial-word search
const matchQuery = toPrefixQuery(sanitized);
```

Then use `matchQuery` in the MATCH clause instead of `sanitized`:

```ts
params[0] = matchQuery;  // replaces sanitized in bind params
```

### Step 3: Run `pnpm typecheck`

## Todo

- [ ] Add `toPrefixQuery` helper function
- [ ] Use prefix query as FTS5 MATCH input
- [ ] Verify typecheck passes

## Success Criteria

- Short queries like "depl" return results matching "deploy", "deployment"
- Full queries like "deployment tools" still work correctly ("deployment* tools*")
- No FTS5 syntax errors from the `*` suffix

## Risk

**Low**. FTS5 prefix queries are a documented standard feature. The `*` suffix only applies to sanitized alphanumeric terms, so no injection risk. Prefix queries may return slightly more results than exact matches — this is desired behavior for search discovery.

One consideration: very short prefixes (1-2 chars) like "a*" could match many results. This is acceptable since FTS5 BM25 ranking still orders by relevance, and we apply a LIMIT.
