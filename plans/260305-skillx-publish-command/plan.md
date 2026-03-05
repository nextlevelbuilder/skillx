---
status: complete
created: 2026-03-05
completed: 2026-03-05
priority: high
tags: [cli, backend, auth, security]
blocks: [260213-1233-skillx-use-identifier-redesign, 260213-1218-skill-references-scripts]
---

# Plan: `skillx publish` Command

## Summary

Add `skillx publish` CLI command that calls `/api/skills/register` with authentication and GitHub ownership validation.

Currently the Register API is **unauthenticated** — anyone can register any repo. This plan adds:
1. CLI `publish` command (auto-detect git remote, call register API)
2. Auth requirement on Register API (API key or session)
3. GitHub ownership validation (user must be owner/collaborator of the repo)

## Phases

| # | Phase | Status | File |
|---|-------|--------|------|
| 1 | Add auth + ownership validation to Register API | complete | [phase-01-register-api-auth.md](phase-01-register-api-auth.md) |
| 2 | Create CLI `publish` command | complete | [phase-02-cli-publish-command.md](phase-02-cli-publish-command.md) |
| 3 | Typecheck + manual test | complete | [phase-03-verify.md](phase-03-verify.md) |

## Key Decisions

- **Ownership validation via GitHub API**: Use user's GitHub OAuth access token (stored in Better Auth `account` table) to check collaborator status on the target repo. This is more reliable than username matching since orgs can have multiple collaborators.
- **Dual auth**: Support both session (web) and API key (CLI). CLI will use API key → look up user → get GitHub token from `account` table.
- **Keep backward compat**: Register API still accepts same body shape. Auth is the only new requirement.

## Dependencies

- Better Auth `account` table stores `accessToken` for GitHub OAuth — needed for GitHub API calls to validate ownership.
- CLI already has `apiRequest` with `Authorization: Bearer` header support.

## Completion Notes

### Phase 1: Register API Auth + Ownership Validation

- Created `apps/web/app/lib/auth/authenticate-request.ts` (shared auth helper supporting API key & session)
- Created `apps/web/app/lib/github/validate-repo-ownership.ts` (GitHub permission check requiring write access)
- Updated `apps/web/app/routes/api.skill-register.ts` with auth + ownership validation + path traversal protection

### Phase 2: CLI Publish Command

- Created `packages/cli/src/commands/publish.ts` with git remote auto-detect
- Supports `--path`, `--scan`, `--dry-run` options
- Registered in `packages/cli/src/index.ts`

### Phase 3: Verification

- Typecheck passes (no new errors introduced)
- Code review findings addressed: path traversal fix, token expiry check, permission level check (write required), await on DB update
- All pre-existing type errors in codebase are unrelated to this change
