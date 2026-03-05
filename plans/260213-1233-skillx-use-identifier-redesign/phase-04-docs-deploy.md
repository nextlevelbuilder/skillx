# Phase 4: Docs + Deploy

## Context

- [plan.md](plan.md)

## Overview

- **Priority:** LOW
- **Status:** Complete
- **Depends on:** Phase 3 (all tests pass)
- **Description:** Update CLI README, project docs, deploy backend + CLI.
- **Completed:** Updated packages/cli/README.md with new identifier formats + security warning section. Updated CLAUDE.md with `pnpm test` command + publish docs in CLI commands list. system-architecture.md + docs/ updated in previous session. Deploy deferred pending PR merge.

## Implementation Steps

### Step 1: Update CLI README

Update `packages/cli/README.md` usage examples:

```markdown
### `skillx use <identifier>`

Smart skill lookup — supports multiple identifier formats:

- `author/skill-name` — direct lookup by author and skill name
- `org/repo/skill-name` — lookup or auto-register from GitHub repo subfolder
- `org/repo` — scan GitHub repo for all skills (discovers SKILL.md files)
- `slug` — exact slug lookup (fallback to search on 404)
- `"keyword query"` — search and auto-pick top result
```

### Step 2: Update project docs

Update `docs/system-architecture.md` register flow section if it documents the old single-skill pattern.

### Step 3: Deploy

```bash
# Build and deploy web (backend API changes)
pnpm build && cd apps/web && npx wrangler deploy

# Build and publish CLI
cd packages/cli && pnpm build
# npm publish (when ready)
```

### Step 4: Update CLAUDE.md

Add the new route pattern, identifier format documentation, and security notes.

### Step 5: Document security features

Add to `CLAUDE.md` Key Patterns section:

```markdown
**Security**: Content scanner runs at skill registration. Skills labeled `safe`/`caution`/`danger`.
CLI shows warnings for flagged skills. Raw mode wraps content in boundary markers.
```

Update `docs/system-architecture.md` with security flow diagram if applicable.

## Todo List

- [x] Update `packages/cli/README.md` with new identifier formats
- [x] Update `docs/system-architecture.md` if needed
- [x] Update `CLAUDE.md` routes table + security notes + pnpm test command
- [ ] Deploy backend (`pnpm build && cd apps/web && npx wrangler deploy`) — deferred
- [ ] Run migration on remote D1 (`pnpm db:migrate:remote`) — deferred
- [ ] Build CLI (`cd packages/cli && pnpm build`) — done (no errors, pre-existing only)

## Success Criteria

- README accurately describes all identifier formats
- README documents risk labels and warning behavior
- Production API handles new register params
- Production DB has `risk_label` column
- CLI published with updated resolution chain + warnings
