---
phase: 6
priority: low
status: pending
effort: 30 min
depends_on: [5]
---

# Phase 6: Query Aliases

## Overview

Add hand-curated alias map for common abbreviations. Expands FTS5 queries with OR-joined synonyms so "k8s" also matches "kubernetes". Optional — evaluate ROI after phases 1-5.

## Key Insight

Vector search handles semantic similarity, but FTS5 is purely lexical. Common abbreviations like "k8s", "ts", "js", "ci/cd" return no FTS5 results because those tokens don't appear in skill text. A small alias map bridges this gap cheaply.

## Related Code Files

- **Create**: `apps/web/app/lib/search/query-aliases.ts` — alias map and expander
- **Modify**: `apps/web/app/lib/search/fts5-search.ts` — apply alias expansion before MATCH

## Implementation Steps

### Step 1: Create `query-aliases.ts`

```ts
/**
 * Query alias map for common abbreviations in skill search.
 * Expands FTS5 queries so abbreviations match full terms.
 */

const ALIASES: Record<string, string> = {
  k8s: 'kubernetes',
  ts: 'typescript',
  js: 'javascript',
  py: 'python',
  rb: 'ruby',
  tf: 'terraform',
  gh: 'github',
  cf: 'cloudflare',
  aws: 'amazon',
  gcp: 'google cloud',
  db: 'database',
  api: 'api interface endpoint',
  cli: 'command line terminal',
  ci: 'continuous integration',
  cd: 'continuous deployment',
  ml: 'machine learning',
  ai: 'artificial intelligence',
  llm: 'language model',
  rag: 'retrieval augmented generation',
  mcp: 'model context protocol',
  ux: 'user experience',
  ui: 'user interface',
  auth: 'authentication authorization',
  deps: 'dependencies',
  env: 'environment',
  config: 'configuration',
  infra: 'infrastructure',
  devops: 'devops deployment operations',
  docker: 'docker container',
  react: 'react reactjs',
  vue: 'vue vuejs',
  next: 'nextjs next',
  node: 'nodejs node',
};

/** Expand query terms using alias map.
 *  Returns original query with alias expansions OR-joined.
 *  Example: "k8s deploy" → "(kubernetes OR k8s) deploy" */
export function expandAliases(query: string): string {
  const terms = query.split(/\s+/).filter(Boolean);

  const expanded = terms.map((term) => {
    const lower = term.toLowerCase();
    const alias = ALIASES[lower];
    if (alias) {
      // OR-join original term with alias expansion
      const aliasTerms = alias.split(/\s+/);
      const allTerms = [lower, ...aliasTerms];
      return `(${allTerms.join(' OR ')})`;
    }
    return term;
  });

  return expanded.join(' ');
}
```

### Step 2: Apply in `fts5-search.ts`

Import and apply before prefix transformation:

```ts
import { expandAliases } from './query-aliases';

// In fts5Search, after sanitization:
const sanitized = query.replace(/[^\w\s]/g, '').trim();
if (!sanitized) return [];

const aliasExpanded = expandAliases(sanitized);
const matchQuery = toPrefixQuery(aliasExpanded);
```

**Important**: Alias expansion must happen BEFORE prefix wildcards, so `k8s` → `(kubernetes OR k8s)` → `(kubernetes* OR k8s*)`.

### Step 3: Handle FTS5 OR syntax with prefix

The `toPrefixQuery` function from phase 5 needs adjustment to handle parentheses and OR keywords:

```ts
function toPrefixQuery(query: string): string {
  return query
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => {
      // Don't add * to FTS5 operators or parens
      if (token === 'OR' || token === 'AND' || token === 'NOT') return token;
      if (token.startsWith('(')) return `(${token.slice(1)}*`;
      if (token.endsWith(')')) return `${token.slice(0, -1)}*)`;
      return `${token}*`;
    })
    .join(' ');
}
```

### Step 4: Run `pnpm typecheck`

## Todo

- [ ] Create `query-aliases.ts` with alias map and `expandAliases` function
- [ ] Import and apply alias expansion in `fts5-search.ts`
- [ ] Adjust `toPrefixQuery` to handle OR/parentheses from alias expansion
- [ ] Verify typecheck passes

## Success Criteria

- "k8s" query returns kubernetes-related skills via FTS5
- "ts deploy" returns TypeScript deployment skills
- Non-aliased terms pass through unchanged
- No FTS5 syntax errors from OR/parentheses

## Risk

**Low**. Hand-curated map is ~30 entries, easy to maintain. OR expansion may slightly increase FTS5 query time but negligible at this scale. If aliases cause unexpected results, can be disabled by removing the `expandAliases` call.

**Note**: This phase is optional. Vector search already handles semantic similarity for most abbreviations. Implement only if phases 1-5 leave noticeable FTS5 gaps in search results.
