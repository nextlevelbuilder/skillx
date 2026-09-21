# Code Review: Skill References & Scripts Feature

**Branch:** `feat/skill-references-scripts`
**Date:** 2026-03-05
**Reviewer:** code-reviewer agent

## Scope

- **Files changed:** 9 modified, 7 new (16 total)
- **LOC delta:** +160 / -96 (net +64)
- **Focus areas:** DB schema, Vectorize indexing, UI components, CLI refactor, seed pipeline, GitHub fetcher script

## Overall Assessment

Solid implementation. Clean separation of concerns: new table for references, JSON column for scripts, metadata-only on page load. The CLI refactor extracts display logic cleanly. A few security and spec-compliance issues need attention before merge.

## Critical Issues

### C1. Reference content not scanned by content-scanner

**File:** `/apps/web/app/routes/api.admin.seed.ts` (lines 108-123)

Reference content is inserted into `skill_references` without running `scanContent()` / `sanitizeContent()`. SKILL.md content goes through the scanner (existing code), but reference markdown does not. An attacker could embed prompt injection or invisible chars in a `references/` file.

**Fix:** Import and apply `sanitizeContent()` + `scanContent()` to `ref.content` before DB insert. Store a per-reference `risk_label` or at minimum sanitize.

### C2. Reference URL validation allows any GitHub URL (potential SSRF vector on future use)

**File:** `/apps/web/app/routes/api.admin.seed.ts` (line 109)

```ts
const validUrl = ref.url && GITHUB_URL_PATTERN.test(ref.url) ? ref.url : null;
```

The pattern `/^https:\/\/(raw\.githubusercontent\.com|github\.com)\//` is correct for the current display-only use (rendered as `<a href>` in UI). However, if reference URLs are ever fetched server-side (e.g., lazy content refresh like skill content does), this becomes an SSRF risk. Current risk is **low** since URLs are only rendered client-side, but worth noting for defense-in-depth.

**Recommendation:** Add a code comment documenting this is display-only and must not be used in `fetch()` without further validation.

## High Priority

### H1. CLI display contradicts plan: refs/scripts hidden in human mode by default

**File:** `/packages/cli/src/commands/use-display.ts` (lines 108, 118)

Plan validation log (Question 6) states: "Human mode shows refs/scripts always; raw mode requires flags." But the implementation requires `--include-refs` / `--include-scripts` flags in BOTH modes.

**Fix:** In human (non-raw) mode, display refs/scripts unconditionally when present. Only gate behind flags in `--raw` mode.

### H2. Duplicate query: references fetched in both page route and API route

**Files:**
- `/apps/web/app/routes/skill-detail.tsx` (line 48, uses `fetchSkillReferences()`)
- `/apps/web/app/routes/api.skill-detail.ts` (lines 78-87, inline query)

Two different code paths fetch references -- the page loader uses the extracted `fetchSkillReferences()` query, the API route has an inline duplicate. This violates DRY and risks divergence.

**Fix:** Have the API route import and use `fetchSkillReferences()` from `skill-detail-queries.ts`.

### H3. Scripts JSON parsing silently swallows malformed data

**Files:**
- `/apps/web/app/routes/skill-detail.tsx` (line 56)
- `/apps/web/app/routes/api.skill-detail.ts` (line 92)

```ts
try { parsedScripts = JSON.parse(skill.scripts); } catch { /* ignore */ }
```

If `scripts` column contains malformed JSON, the UI silently shows nothing. No logging, no way to detect data quality issues. This parsing is also duplicated between the two routes.

**Fix:** Add `console.warn` in catch block. Extract to a shared utility: `parseScriptsJson(raw: string | null): Script[]`.

### H4. `searchAndUse` in CLI doesn't pass new options

**File:** `/packages/cli/src/commands/use.ts` (line ~174)

```ts
async function searchAndUse(query: string, raw: boolean): Promise<void> {
```

The function signature still only accepts `raw: boolean`, not the full `DisplayOptions`. When search fallback is used, `includeRefs`/`includeScripts` are lost.

**Fix:** Change signature to accept `DisplayOptions` and pass through.

## Medium Priority

### M1. File size: `fetch-skill-refs-scripts.mjs` at 347 lines

Script exceeds 200 LOC guideline. Not blocking since it's a one-off operations script, but could be split into `github-api.mjs` (rate limiting, tree fetch) + `main pipeline`.

### M2. `fts_content` column populated but never consumed

The seed route populates `fts_content` with `content + ref titles` (line ~128 of seed route), and the schema/migration add the column. But no FTS5 virtual table or search query references it. This is dead code until FTS5 integration is done.

**Recommendation:** Add a TODO comment or track as follow-up. Currently harmless but adds write overhead.

### M3. `onConflictDoNothing` for references loses updates

**File:** `/apps/web/app/routes/api.admin.seed.ts` (line 119)

```ts
.onConflictDoNothing();
```

If a reference title, URL, or content changes on re-seed, the old data is preserved. Should use `onConflictDoUpdate` to refresh title/url/type/content.

### M4. Missing `id` field in API route reference response

**File:** `/apps/web/app/routes/api.skill-detail.ts` (lines 79-84)

The API route omits `id` from the reference select, but the `SkillReferencesSection` component expects `id` as the React `key`. The CLI response won't have `id` either. The page route (via `fetchSkillReferences`) does include `id`.

**Fix:** Add `id: skillReferences.id` to the API route's select.

### M5. ANSI sanitization regex incomplete

**Files:** `skill-scripts-section.tsx` (line 13), `use-display.ts` (line 44)

```ts
str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "")
```

This covers CSI sequences but misses OSC sequences (`\x1b]...ST`), which can set terminal titles or trigger hyperlinks. The existing `content-scanner.ts` uses the same pattern, so this is consistent with the codebase, but worth noting for defense-in-depth.

### M6. Plan action items still unchecked

**File:** `plans/260213-1218-skill-references-scripts/plan.md` (lines 136-140)

All 5 action items at bottom of plan are still marked `[ ]` despite being implemented. Should be checked off.

## Low Priority

### L1. `skill-detail.tsx` at 236 lines (slightly over 200 LOC limit)

Not introduced by this PR (pre-existing), but new code adds ~12 lines. Consider extracting the loader into a separate file if it grows further.

### L2. Good bug fix included: favorites query

**File:** `/apps/web/app/routes/api.skill-detail.ts` (line 120)

Changed from chained `.where()` calls to `and()` -- this is a correct fix. Drizzle's chained `.where()` replaces previous conditions rather than AND-ing them. Good catch.

## Positive Observations

1. **Clean extraction:** CLI `use-display.ts` is well-structured with clear interfaces, proper ANSI stripping, and fire-and-forget install tracking preserved
2. **Metadata-only page loads:** References only serve title/filename/url/type on page load -- content stays in DB for Vectorize only. Good performance decision.
3. **Vectorize indexing strategy:** Title + first paragraph at 512 token chunks is efficient (~20% cost for ~80% search value)
4. **GitHub fetcher:** Resumable progress, rate limit handling, concurrency control, `--dry-run`, `--top-n` staged rollout. Production-ready operations script.
5. **SSRF prevention:** URL pattern validation on seed, `rel="noopener noreferrer"` on external links
6. **Unique constraint:** `(skill_id, filename)` prevents duplicate references -- addresses red team finding #4
7. **Favorites bug fix** (L2 above) is a quality improvement bundled appropriately

## Recommended Actions (Priority Order)

1. **[C1]** Scan reference content through `sanitizeContent()` before DB insert
2. **[H1]** Show refs/scripts in human mode by default (plan compliance)
3. **[H2]** Deduplicate reference query -- use `fetchSkillReferences()` in API route
4. **[H4]** Pass `DisplayOptions` through `searchAndUse`
5. **[H3]** Add warning log for malformed scripts JSON, extract shared parser
6. **[M3]** Change `onConflictDoNothing` to `onConflictDoUpdate` for references
7. **[M4]** Add `id` to API route reference select
8. **[M6]** Check off plan action items

## Metrics

- **Type coverage:** No new TS errors introduced (27 pre-existing errors, all in unrelated files)
- **Test coverage:** Not assessed (no test files in diff)
- **Linting issues:** 0 new (2 eslint-disable comments for ANSI regex, acceptable)
- **File size compliance:** 15/16 files under 200 LOC; `fetch-skill-refs-scripts.mjs` at 347 (ops script, acceptable)

## Unresolved Questions

1. Should reference content eventually be exposed via a dedicated API endpoint (e.g., `/api/skills/:slug/references/:filename`) for content preview? The plan mentions this as future work but the content is stored and never served.
2. Is there a plan to wire `fts_content` into the FTS5 virtual table rebuild? Currently the column is populated but unused by search.
3. Should the CLI `searchAndUse` path also fetch and display references/scripts from search results?
