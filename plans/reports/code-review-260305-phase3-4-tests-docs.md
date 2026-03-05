# Code Review: Phase 3 (Testing) + Phase 4 (Docs)

**Date:** 2026-03-05
**Reviewer:** code-reviewer
**Scope:** 7 files (3 new, 4 modified), 33 unit tests
**All 33 tests pass (vitest 4.0.18, 335ms)**

## Overall Assessment

Good quality test suite for a first pass. Tests cover the happy paths and several edge cases for both `content-scanner` and `parseIdentifier`. Doc updates are accurate and match implementation. A few coverage gaps and one structural concern noted below.

## Critical Issues

None.

## High Priority

### H1. `parseIdentifier` — empty string not tested

`parseIdentifier("")` returns `{ type: "slug", parts: [""] }`. Downstream, this becomes a DB lookup for slug `""`, which will 404 then fallback to search with empty query. The function itself doesn't crash, but the behavior is potentially confusing. The test for `"a/b/c/d"` (four-part) documents the fallthrough correctly, but empty string is a more realistic user error.

**Recommendation:** Add test for empty string. Consider whether `parseIdentifier` should throw or return a dedicated error type for empty input. The Commander.js `<identifier>` argument is required so this may never reach the function, but defensive testing is still good practice.

### H2. Content scanner: no test for `"unknown"` label

The `RiskLabel` type includes `"unknown"` but `scanContent()` never returns it — it always returns `safe`, `caution`, or `danger`. The `"unknown"` label is used elsewhere (e.g., when `risk_label` column is NULL in DB). This isn't a bug, but the type/test mismatch is worth documenting.

**Recommendation:** Add a comment in content-scanner.ts clarifying that `"unknown"` is for DB-level use (pre-existing skills without scans), not returned by `scanContent()`. Or narrow the return type.

### H3. Content scanner: regex stateful flag `.test()` on global regex

`INVISIBLE_UNICODE` has the `/g` flag. It is used with `.match()` (line 50), which is fine. But if someone later calls `.test()` on it, the `lastIndex` statefulness of `/g` regexes would cause intermittent failures. Currently safe, but fragile.

**Recommendation:** No immediate action needed since `.match()` resets `lastIndex`. Just a note for future maintainers.

## Medium Priority

### M1. Missing test: caution threshold boundary

The test "labels content with one caution pattern as safe (threshold is 2)" is good. But there's no test verifying that exactly 2 caution findings (without any danger) yields `label: "caution"`. The existing test at line 81 uses `<script>` + `<iframe>` which also triggers caution, but the assertion `toBeGreaterThanOrEqual(2)` is loose — it should be `toBe(2)` to verify exact threshold behavior.

**Recommendation:** Tighten assertion to `toBe(2)` for the two-caution test case, ensuring the threshold boundary is precisely validated.

### M2. Missing test: sanitizeContent on prompt injection text

`sanitizeContent` only strips invisible chars and ANSI escapes — it does NOT strip prompt injection text, which is by design (scan labels it, doesn't remove it). This design decision is important but not documented by a test.

**Recommendation:** Add a test showing `sanitizeContent("ignore all previous instructions")` returns the string unchanged. This documents the intentional split between scan (label) and sanitize (strip encoding tricks only).

### M3. Missing test: backtick-enclosed `$()` (false positive)

The shell injection regex `\$\([^)]+\)` would match `$(command)` even inside backtick code fences. For example:

```
Install via `$(npm bin)/tool`
```

This would trigger `danger:shell-injection`. The false-positive test at line 117 only tests backtick code *spans* with `npm install`, not `$()` inside backticks. Legitimate SKILL.md files frequently contain shell examples.

**Recommendation:** Add a test with `$()` inside a code block to document current behavior (it WILL flag it). If this causes false positives in production, consider stripping fenced code blocks before scanning or reducing `$()` to caution level.

### M4. `use.ts` exceeds 200 LOC

The file is 281 lines, exceeding the project's 200 LOC limit. The `parseIdentifier` export makes it a public API surface now. Consider extracting display/formatting functions (`displaySkill`, `handleRegisterResult`) into a separate module.

**File:** `/Users/duynguyen/www/nlb/skillx/packages/cli/src/commands/use.ts` (281 lines)

### M5. Phase 3 TODO list not updated

`plans/260213-1233-skillx-use-identifier-redesign/phase-03-integration-testing.md` still shows all TODOs unchecked. The unit tests for `parseIdentifier` and `scanContent` partially address items 1 and 5, but the plan file doesn't reflect completion status.

## Low Priority

### L1. Test import uses `.js` extension

`use.test.ts` imports from `"./use.js"` — this works because vitest resolves `.ts` files, but it's inconsistent with the other test file which imports from `"./content-scanner"` (no extension). Minor style inconsistency.

### L2. README documents `skillx publish` but no tests for it

`publish.ts` (183 lines) has `parseGitRemoteUrl` and `parseRepoArg` — both pure functions suitable for unit testing. These were introduced in the publish command plan, not this phase, but worth noting as a gap.

### L3. `vitest.config.ts` could use workspace config

Current config manually lists include paths. Since this is a pnpm monorepo, vitest workspaces (`vitest.workspace.ts`) would be more idiomatic. Not blocking.

## Edge Cases Found by Scout

1. **Four-plus slashes in identifier** — correctly falls through to `slug` type, tested. Good.
2. **Tab characters in identifier** — not tested. `"ui\tux"` contains no space but has whitespace. `parseIdentifier` only checks `.includes(' ')`, so tab-separated words would be treated as a slug, not search. Edge case unlikely from CLI but worth awareness.
3. **Unicode in identifier** — `parseIdentifier("autor/habilidad")` works fine, but `parseIdentifier("autor/habilidad ")` (trailing space) would trigger search mode. Trimming input before parsing might be safer.
4. **Content scanner: RTL override chars** — `U+202A`-`U+202E` (bidirectional overrides) are NOT in the `INVISIBLE_UNICODE` regex range (`U+2066-U+206F` covers some but misses `U+202A-U+202E`). These are classic "trojan source" attack vectors. The current regex catches `U+2066-U+206F` but not `U+202A-U+202E`.

**File:** `/Users/duynguyen/www/nlb/skillx/apps/web/app/lib/security/content-scanner.ts` line 15
**Current:** `/[\u200B-\u200D\uFEFF\u2060-\u2064\u2066-\u206F]/g`
**Missing:** `\u202A-\u202E` (LRE, RLE, PDF, LRO, RLO — bidirectional override chars used in trojan source attacks)

## Positive Observations

- Test structure clean: `describe`/`it` blocks well-organized with clear names
- False positive resistance tests (lines 116-135) are excellent — tests what should NOT flag
- `parseIdentifier` export is a good refactor: pure function, no side effects, easily testable
- Content scanner is well-designed: pure function, no dependencies, fast
- Doc updates in README accurately reflect actual CLI behavior
- CLAUDE.md correctly lists `pnpm test` and updated CLI commands list

## Recommended Actions (Prioritized)

1. Add `\u202A-\u202E` to `INVISIBLE_UNICODE` regex in content-scanner.ts (security gap)
2. Add empty string test for `parseIdentifier`
3. Add test documenting `sanitizeContent` does NOT strip injection text (design documentation)
4. Tighten caution threshold test assertion from `>=2` to `===2`
5. Add false-positive test for `$()` inside code fences
6. Update phase-03 TODO checkboxes
7. Extract display functions from `use.ts` to stay under 200 LOC

## Metrics

- **Test count:** 33 (26 scanner + 7 parser)
- **Test duration:** 7ms total
- **Type coverage:** Not measured (no TS errors in test files)
- **Linting issues:** 0 (tests compile and run clean)
- **Files over 200 LOC:** 1 (`use.ts` at 281 lines)

## Doc Accuracy Check

| Document | Accurate? | Notes |
|----------|-----------|-------|
| `packages/cli/README.md` | Yes | All identifier formats, publish command, security warnings documented correctly |
| `CLAUDE.md` commands section | Yes | `pnpm test` added, `publish` in directory listing |
| `CLAUDE.md` key patterns | Yes | Content scanning caveat present |

## Unresolved Questions

- Should `parseIdentifier` handle leading/trailing whitespace trimming before classification?
- Should `$()` inside markdown code fences be excluded from shell injection detection (requires pre-processing step)?
- Is `vitest` at root `devDependencies` sufficient or should each workspace have its own? (Works currently, just architectural question)
