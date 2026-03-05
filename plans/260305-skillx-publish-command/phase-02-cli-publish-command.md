# Phase 2: Create CLI `publish` Command

**Priority:** high
**Status:** complete
**Depends on:** Phase 1

## Overview

Add `skillx publish` command that auto-detects git remote info and calls the secured Register API.

## Context

- CLI entry: [index.ts](../../packages/cli/src/index.ts) — Commander.js
- Existing commands: [commands/](../../packages/cli/src/commands/) — search, use, find, report, config
- API client: [api-client.ts](../../packages/cli/src/lib/api-client.ts) — already sends `Authorization: Bearer` if API key set
- Config store: [config-store.ts](../../packages/cli/src/utils/config-store.ts)

## Architecture

```
skillx publish [owner/repo] [options]
  → If no arg: auto-detect from `git remote get-url origin`
  → Parse owner/repo from git URL
  → POST /api/skills/register { owner, repo, skill_path?, scan? }
  → Display result (registered skills, counts)
```

## Implementation Steps

1. **Create** `packages/cli/src/commands/publish.ts`
   - Commander command: `skillx publish [repo]`
   - Options:
     - `--path <path>` — specific skill subfolder path
     - `--scan` — scan entire repo for all SKILL.md files
     - `--dry-run` — show what would be published without calling API
   - Auto-detect logic:
     - If no `repo` arg, run `git remote get-url origin`
     - Parse `owner/repo` from HTTPS or SSH URL patterns
     - `https://github.com/owner/repo.git` → `owner`, `repo`
     - `git@github.com:owner/repo.git` → `owner`, `repo`
   - Require API key (check `getApiKey()`, error if missing)
   - Call `apiRequest('/api/skills/register', { method: 'POST', body })
   - Display result:
     - Single skill: show name, slug, "newly registered" or "already exists"
     - Scan mode: show list of skills found, registered count, skipped count

2. **Register command** in [index.ts](../../packages/cli/src/index.ts)
   - Import and `program.addCommand(publishCommand)`

## Related Code Files

**Create:**
- `packages/cli/src/commands/publish.ts`

**Modify:**
- `packages/cli/src/index.ts` — add publishCommand

## Todo

- [x] Create `publish.ts` command with git remote auto-detect
- [x] Register in `index.ts`
- [x] Test locally with `pnpm dev` + CLI

## Success Criteria

- `skillx publish` from a git repo auto-detects owner/repo and publishes
- `skillx publish owner/repo` works with explicit arg
- `skillx publish --scan` discovers all SKILL.md files in repo
- `skillx publish --path skills/my-skill` registers specific subfolder
- Clear error when no API key configured
- Clear error when user doesn't own the repo (403 from API)

## Security Considerations

- API key required — no anonymous publishing
- Never display full API key in output (only prefix)
