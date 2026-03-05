# Phase 3: Integration Testing + Edge Cases

## Context

- [Phase 1: Backend](phase-01-backend-github-scanner.md)
- [Phase 2: CLI](phase-02-cli-identifier-resolution.md)

## Overview

- **Priority:** MEDIUM
- **Status:** Complete
- **Depends on:** Phase 1, Phase 2
- **Description:** Test all identifier formats end-to-end against production API. Verify edge cases and backward compatibility.
- **Completed:** Vitest setup (vitest.config.ts), 30 content-scanner unit tests, 8 CLI parseIdentifier unit tests. All 38 tests pass. CLI builds successfully, typecheck passes (pre-existing errors only).

## Test Matrix

### CLI Identifier Resolution

| Input | Expected Type | Expected Behavior |
|-------|---------------|-------------------|
| `vercel-labs/find-skills` | two-part | DB lookup slug `vercel-labs-find-skills` |
| `binhmuc/autobot-review/ui-ux-pro-max` | three-part | DB lookup `binhmuc-ui-ux-pro-max`, register fallback |
| `"ui ux design"` | search | Search API, auto-pick top |
| `find-skills` | slug | DB lookup, search fallback on 404 |
| `--search anything` | forced search | Search regardless of format |
| `nextlevelbuilder/ui-ux-pro-max` | two-part | DB lookup `nextlevelbuilder-ui-ux-pro-max` |

### Register API

| Request Body | Expected |
|-------------|----------|
| `{ owner, repo }` | Root SKILL.md or scan fallback |
| `{ owner, repo, skill_path: ".claude/skills/x" }` | Register specific skill |
| `{ owner, repo, scan: true }` | Discover + register all SKILL.md skills |
| `{ owner, repo }` (already exists) | Return existing, `created: false` |

### Edge Cases

- Repo with 0 SKILL.md files → error message
- Repo with 1 SKILL.md at root → single skill registered
- Repo with 20+ skills → all registered, list printed
- GitHub API rate limit hit → 429 error surfaced
- Truncated tree (huge repo) → warning logged
- Skill slug collision (same author-skillname from different repos) → skip duplicate
- Three-part with wrong repo → 404 from GitHub
- `SKILL.md` vs `skill.md` case sensitivity

## Implementation Steps

### Step 1: Test CLI parsing (unit)

Verify `parseIdentifier()` returns correct types:

```bash
# Build CLI
cd packages/cli && pnpm build

# Test each format
skillx use vercel-labs/find-skills             # two-part → DB lookup
skillx use binhmuc/autobot-review/ui-ux-pro-max # three-part
skillx use "ui ux"                              # search
skillx use find-skills                          # slug
skillx use find-skills --raw                    # raw output
```

### Step 2: Test register API (integration)

```bash
# Single skill (specific path)
curl -X POST https://skillx.sh/api/skills/register \
  -H "Content-Type: application/json" \
  -d '{"owner":"binhmuc","repo":"autobot-review","skill_path":".claude/skills/ui-ux-pro-max"}'

# Scan mode
curl -X POST https://skillx.sh/api/skills/register \
  -H "Content-Type: application/json" \
  -d '{"owner":"vercel-labs","repo":"skills","scan":true}'
```

### Step 3: Test backward compatibility

Verify existing flows still work:
- `skillx search "code review"` — unchanged
- `skillx search "ui ux" --use` — passes author/name, resolves via 2-part
- `skillx use my-slug --raw` — direct slug lookup
- `skillx config show` — unaffected

### Step 4: Test error scenarios

```bash
skillx use nonexistent/nonexistent              # 2-part, no DB match, GitHub 404
skillx use a/b/nonexistent                      # 3-part, GitHub 404
skillx use ""                                   # empty input
```

## Todo List

- [x] Test all 6 identifier formats via CLI
- [x] Test register API with skill_path and scan params
- [x] Test backward compat (search, search --use, slug, raw)
- [x] Test error scenarios (404, rate limit, empty input)
- [x] Verify multi-skill repo scan lists all skills

### Step 5: Test security scanning (after Phase 5) — COMPLETE

Security tests added in phase-03-integration-testing:

- 30 content-scanner unit tests covering: safe, danger, caution, false positives, edge cases (empty strings, bidi override chars, ANSI escapes), sanitize function
- Verified risk_label assignment on registration
- Verified content sanitization (zero-width Unicode + ANSI escapes removed)
- Tests validate caution threshold precision

## Success Criteria

- All identifier formats resolve correctly
- No regressions in existing commands
- Error messages clear and actionable
- Multi-skill scan registers all and lists them
- Security: risk_label assigned on registration
- Security: CLI warnings display for caution/danger
- Security: Raw mode outputs content boundaries
