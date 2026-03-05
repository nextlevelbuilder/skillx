# Phase 1: Add Auth + Ownership Validation to Register API

**Priority:** high
**Status:** complete

## Overview

Secure `/api/skills/register` with authentication and validate that the user has access to the GitHub repo they're registering.

## Context

- Current Register API: [api.skill-register.ts](../../apps/web/app/routes/api.skill-register.ts) — no auth
- Auth patterns: see [api.usage-report.ts](../../apps/web/app/routes/api.usage-report.ts) for API key auth, [api.skill-rate.ts](../../apps/web/app/routes/api.skill-rate.ts) for session auth
- Better Auth `account` table stores GitHub `accessToken` via OAuth
- Schema: [schema.ts](../../apps/web/app/lib/db/schema.ts)

## Architecture

```
Request → Auth (API key or session) → Get userId
→ Lookup GitHub accessToken from `account` table (providerId = "github")
→ Call GitHub API: GET /repos/{owner}/{repo}/collaborators/{username}
  - Uses user's GitHub token (has `repo` scope from OAuth)
  - 204 = collaborator, 404 = not
→ If valid → proceed with existing register logic
→ If not → 403 Forbidden
```

## Implementation Steps

1. **Create auth helper** `apps/web/app/lib/auth/authenticate-request.ts`
   - Shared function: try API key first, fallback to session
   - Returns `{ userId: string }` or null
   - Extract from repeated pattern in usage-report.ts and skill-rate.ts

2. **Create ownership validator** `apps/web/app/lib/github/validate-repo-ownership.ts`
   - Input: `userId`, `owner`, `repo`, `db` (Drizzle)
   - Lookup `account` table where `userId` matches and `providerId = "github"`
   - Get `accessToken` and `accountId` (GitHub username)
   - Call GitHub API: `GET /repos/{owner}/{repo}/collaborators/{accountId}`
     with `Authorization: token {accessToken}`
   - Return `{ valid: boolean; reason?: string }`
   - Edge case: if user has no GitHub account linked → return invalid

3. **Update Register API** [api.skill-register.ts](../../apps/web/app/routes/api.skill-register.ts)
   - Add auth check at top of `action()`
   - Add ownership validation before proceeding
   - Return 401 for no auth, 403 for no ownership

## Related Code Files

**Modify:**
- `apps/web/app/routes/api.skill-register.ts` — add auth + ownership check

**Create:**
- `apps/web/app/lib/auth/authenticate-request.ts` — shared auth helper
- `apps/web/app/lib/github/validate-repo-ownership.ts` — ownership check

## Todo

- [x] Create `authenticate-request.ts` helper
- [x] Create `validate-repo-ownership.ts`
- [x] Update `api.skill-register.ts` with auth + ownership
- [x] Typecheck passes

## Success Criteria

- Unauthenticated requests to `/api/skills/register` return 401
- Authenticated user who doesn't own the repo gets 403
- Authenticated user who owns/collaborates on repo can register successfully

## Risk Assessment

- **GitHub OAuth token expiry**: Better Auth should handle refresh, but if token is stale, ownership check will fail. Mitigation: return clear error message suggesting re-login.
- **GitHub API rate limit**: Using user's token gives 5000 req/hr (vs 60 unauth). Acceptable for publish operations.
- **Org repos**: `GET /repos/{owner}/{repo}/collaborators/{username}` works for both personal and org repos. User must have push access.

## Security Considerations

- Never log or expose GitHub access tokens
- API key validation uses SHA-256 hash comparison (existing pattern)
- Ownership check uses server-side GitHub API call — not trusting client claims
