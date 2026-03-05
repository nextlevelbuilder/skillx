# Phase 1: Backend — GitHub Repo Scanner + Register API

## Context

- [Brainstorm report](../reports/brainstorm-260213-1233-skillx-use-identifier-redesign.md)
- [plan.md](plan.md)

## Overview

- **Priority:** HIGH
- **Status:** Pending
- **Description:** Add GitHub Tree API scanner to discover `SKILL.md` files in repos, update register API to support `skill_path` and `scan` params, update `fetchGitHubSkill` for subfolder fetch.

## Key Insights

- Current `fetchGitHubSkill()` assumes 1 skill per repo (reads root SKILL.md/README.md)
- Current register API builds slug as `owner-repo` — wrong for multi-skill repos
- Need slug format: `author-skillname` (author = repo owner, skillname = folder name)
- GitHub Tree API: `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1` returns all files
- Unauthenticated GitHub API: 60 req/hr/IP. Tree API is 1 call vs N calls for scanning.

## Related Code Files

**Modify:**
- `apps/web/app/lib/github/fetch-github-skill.ts` — add `skillPath` param
- `apps/web/app/routes/api.skill-register.ts` — add `skill_path`, `scan` body params

**Create:**
- `apps/web/app/lib/github/scan-github-repo.ts` — Tree API scanner

## Implementation Steps

### Step 1: Create `scan-github-repo.ts`

New file: `apps/web/app/lib/github/scan-github-repo.ts`

```typescript
// Uses GitHub Tree API to find all SKILL.md files in a repo
// Returns array of { skillName, skillPath } for each discovered skill
// E.g. repo with .claude/skills/ui-ux-pro-max/SKILL.md →
//   { skillName: "ui-ux-pro-max", skillPath: ".claude/skills/ui-ux-pro-max" }
```

Logic:
1. `GET /repos/{owner}/{repo}/git/trees/{default_branch}?recursive=1`
2. Filter tree entries where `path` ends with `/SKILL.md` or equals `SKILL.md`
3. For root `SKILL.md`: skillName = repo name, skillPath = ""
4. For nested `x/y/SKILL.md`: skillName = parent folder name, skillPath = parent path
5. Return `DiscoveredSkill[]`

Interface:
```typescript
export interface DiscoveredSkill {
  skillName: string;   // folder name (e.g. "ui-ux-pro-max")
  skillPath: string;   // full path to skill folder (e.g. ".claude/skills/ui-ux-pro-max")
}

export async function scanGitHubRepo(owner: string, repo: string): Promise<DiscoveredSkill[]>
```

### Step 2: Update `fetch-github-skill.ts`

Add optional `skillPath` parameter to `fetchGitHubSkill()`:

```typescript
export async function fetchGitHubSkill(
  owner: string,
  repo: string,
  skillPath?: string,  // NEW: subfolder path (e.g. ".claude/skills/ui-ux-pro-max")
): Promise<GitHubSkillData>
```

Changes:
- When `skillPath` provided, fetch `{skillPath}/SKILL.md` instead of root files
- Slug becomes `{owner}-{skillName}` (NOT `owner-repo`)
- `skillName` = last segment of `skillPath` (or `repo` if root)
- `source_url` includes tree path: `{html_url}/tree/{branch}/{skillPath}`
- `install_command` = `npx skillx-sh use {owner}/{repo}/{skillName}`

### Step 3: Update `api.skill-register.ts`

Extend request body:

```typescript
interface RegisterBody {
  owner: string;
  repo: string;
  skill_path?: string;  // specific skill folder
  scan?: boolean;        // discover all skills via SKILL.md
}
```

Logic:
- `{ owner, repo, skill_path }` → register single skill from subfolder
- `{ owner, repo, scan: true }` → scan repo, register ALL discovered skills
- `{ owner, repo }` (no skill_path, no scan) → backward compat: try root first, if no root SKILL.md then scan
- Slug for each skill: `{owner}-{skillName}`.toLowerCase()
- Check existing by slug before inserting (skip duplicates)
- Return `{ skills: [...], created: number, skipped: number }`

Note: Response shape changes from `{ skill, created }` to `{ skills[], created, skipped }` for scan mode. Single-skill mode keeps `{ skill, created }` for backward compat.

## Todo List

- [ ] Create `scan-github-repo.ts` with Tree API scanner
- [ ] Update `fetch-github-skill.ts` with `skillPath` param
- [ ] Update `api.skill-register.ts` with `skill_path` + `scan` params
- [ ] Handle backward compat (no params = try root, then scan)

## Success Criteria

- `POST /api/skills/register { owner, repo, scan: true }` discovers and registers all SKILL.md skills
- `POST /api/skills/register { owner, repo, skill_path: ".claude/skills/x" }` registers specific skill
- Slugs generated as `author-skillname` (not `author-reponame`)
- Existing single-skill-per-repo flow still works
- Each registered skill indexed in Vectorize

## Risk Assessment

- **GitHub rate limits:** Tree API = 1 call per scan (efficient). Register + fetch content = 1-2 more calls per skill. For repos with 20+ skills, could hit 60/hr limit. Mitigation: batch content fetches, add rate limit retry.
- **Large repos:** Tree API can timeout on very large repos (100K+ files). Mitigation: set truncated flag check, warn user.
- **SKILL.md variants:** Some repos may use `skill.md` (lowercase). Mitigation: case-insensitive match.
