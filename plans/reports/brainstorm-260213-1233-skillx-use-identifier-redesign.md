# Brainstorm: `skillx use` Identifier Redesign

## Problem Statement

One GitHub repo can contain multiple skills (e.g., `binhmuc/autobot-review` has `ui-ux-pro-max`, `nextjs-shadcn-builder`, etc.). The current `skillx use <org>/<repo>` pattern is ambiguous — it collides with `author/skill-name` format and can't handle multi-skill repos.

## Requirements

- Support `author/skill-name` as primary identifier (maps to DB slug `author-skillname`)
- Support three-part `org/repo/skill-name` for explicit GitHub source
- Keep auto-register from GitHub (no separate command)
- Both CLI and web flows must work
- Backward compatible with existing slugs

## Evaluated Approaches

### Option A: Two-part = skill, Three-part = GitHub (CHOSEN)
- `author/skill` → DB lookup, GitHub fallback for 2-part
- `org/repo/skill` → DB lookup, GitHub register for 3-part
- **Pros:** Matches existing `install_command` patterns, intuitive, no new syntax
- **Cons:** 2-part still needs fallback chain (minor ambiguity)

### Option B: Separate `skillx register` command
- `use` = known skills only, `register` = GitHub import
- **Pros:** Clean separation, zero ambiguity
- **Cons:** Two-step workflow, less magical UX

### Option C: URI prefix `gh:org/repo/skill`
- **Pros:** Zero ambiguity
- **Cons:** Non-standard syntax, poor discoverability

## Recommended Solution: Option A

### Identifier Resolution Chain

```
skillx use <identifier>
│
├─ Contains spaces → Search mode → auto-pick top result
│
├─ Three-part (x/y/z) → DB lookup slug "x-z"
│   ├─ Found → use it
│   └─ 404 → GitHub register(org=x, repo=y, skill_path=z)
│
├─ Two-part (x/y) → DB lookup slug "x-y"
│   ├─ Found → use it
│   └─ 404 → GitHub scan repo x/y for SKILL.md files
│       ├─ 1 skill  → auto-register → use it
│       ├─ N skills → register all → list them
│       └─ 0 skills → error "No skills found in x/y"
│
└─ Single word (x) → DB lookup slug "x"
    ├─ Found → use it
    └─ 404 → search fallback
```

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Repo name in slug? | No | Slug = `author-skillname`; repo is source metadata |
| Three-part identity | `org/repo/skill` | Matches `install_command` in DB |
| Skill discovery | `SKILL.md` presence | Standard marker file, unambiguous |
| Multi-skill repos | Register all, list results | Reduces friction, no interactive prompts |
| Website URLs | `/skills/author-skillname` | Flat, SEO-friendly, unchanged |
| Display format | `author/skill-name` | GitHub-familiar, maps to 2-part identifier |

### GitHub Skill Discovery

Scan repos for `SKILL.md` files using GitHub Tree API (recursive):
- Each `SKILL.md`'s parent folder = one skill
- Common locations: `.claude/skills/*/`, `skills/*/`, `.agent/skills/*/`, `.opencode/skills/*/`, root

### Register API Changes

```
POST /api/skills/register

Current:  { owner, repo }                    → 1 skill from repo root
Updated:  { owner, repo, skill_path? }       → specific skill folder
Added:    { owner, repo, scan: true }        → discover all skills via SKILL.md
```

### Implementation Scope

**CLI changes:**
- `parseGitHubSlug()` → detect 2-part and 3-part formats
- `useSkillBySlug()` → updated resolution chain
- Remove current `toApiSlug()` approach (org-repo join)

**Backend changes:**
- `fetchGitHubSkill()` → support `skill_path` param for subfolder fetch
- New `scanGitHubRepo()` → find SKILL.md files via GitHub Tree API
- Update `/api/skills/register` → `skill_path`, `scan` params
- Skill metadata extraction from SKILL.md content

**No changes needed:**
- DB schema (slug format stays `author-skillname`)
- Search (FTS5 + Vectorize)
- Website URLs
- Boost scoring

## Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| GitHub Tree API rate limits | Registration fails | Cache tree results, use conditional requests |
| SKILL.md not standardized | Some skills missed | Document expected format, fallback to README |
| Breaking existing CLI users | UX disruption | Bare slug fallback preserved, backward compatible |

## Success Criteria

- `skillx use author/skill-name` resolves correctly for all 133K+ skills
- `skillx use org/repo/skill-name` auto-registers from GitHub
- `skillx use org/repo` discovers and registers all skills in multi-skill repos
- No regression in search, ratings, or existing functionality

## Next Steps

1. Update CLI identifier parsing (2-part vs 3-part detection)
2. Update CLI resolution chain
3. Add `scanGitHubRepo()` using GitHub Tree API
4. Update `/api/skills/register` endpoint
5. Update `fetchGitHubSkill()` for subfolder support
6. Test with known multi-skill repos
7. Deploy and update docs
