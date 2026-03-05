---
status: in-progress
created: 2026-02-13
updated: 2026-03-05
branch: feat/skillx-use-redesign
estimated_phases: 5
effort: 18h
tags: [cli, backend, security, ui]
notes: "Phase 1-2 and 5 complete. Phase 3 (integration testing) and Phase 4 (docs/deploy) remain pending."
---

# Plan: `skillx use` Identifier Redesign + Security

## Problem

1. **Identifier ambiguity:** One GitHub repo can contain multiple skills. Current `skillx use <org>/<repo>` collides with `author/skill-name` and can't handle multi-skill repos.
2. **Prompt injection risk:** SKILL.md content stored/displayed as-is with zero sanitization. 36.8% of AI agent skills have security flaws (Snyk ToxicSkills). Attack vectors: invisible Unicode, ANSI escapes, injection patterns, malicious URLs.

## Solution

**Identifier:** Two-part = author/skill-name (DB lookup). Three-part = org/repo/skill (GitHub source). Scan repos for `SKILL.md` files to discover skills.

**Security:** Scan-at-register + warn-at-use. Content scanner labels skills `safe`/`caution`/`danger` at registration time. CLI/web shows warnings. Policy: warn + display (never block).

## Phases

| # | Phase | Priority | Effort | Status | Depends On |
|---|-------|----------|--------|--------|------------|
| 1 | [Backend: GitHub repo scanner + register API](phase-01-backend-github-scanner.md) | HIGH | 4h | Complete | — |
| 2 | [CLI: Identifier parsing + resolution chain](phase-02-cli-identifier-resolution.md) | HIGH | 4h | Complete | Phase 1 |
| 3 | [Integration testing + edge cases](phase-03-integration-testing.md) | MEDIUM | 2h | Pending | Phase 1, 2 |
| 4 | [Docs + deploy](phase-04-docs-deploy.md) | LOW | 1h | Pending | Phase 3 |
| 5 | [Security: Content scanning + CLI/UI warnings](phase-05-security-content-scanning-warnings.md) | HIGH | 7h | Complete | Phase 1 |

## Execution Order

```
Phase 1 (backend) ──► Phase 2 (CLI) ──► Phase 3 (tests) ──► Phase 4 (docs)
      │
      └──► Phase 5 (security) — can run parallel with Phase 2
```

Phase 5 depends only on Phase 1 (register API must exist to hook scanner). Can run in parallel with Phase 2 (CLI changes) since they touch different files.

## Key Dependencies

- Phase 2 depends on Phase 1 (CLI calls the new register API)
- Phase 3 depends on Phase 1 and 2
- Phase 4 after all tests pass
- Phase 5 depends on Phase 1 (scanner hooks into register API)
- Phase 5 also modifies `use.ts` display — coordinate with Phase 2 (non-overlapping functions)

## Files Affected

**Backend (apps/web/app/):**
- `lib/github/fetch-github-skill.ts` — add `skill_path` param + subfolder fetch
- `lib/github/scan-github-repo.ts` — NEW: Tree API scanner for SKILL.md files
- `routes/api.skill-register.ts` — add `skill_path`, `scan` params + call content scanner
- `lib/security/content-scanner.ts` — NEW: prompt injection / risk detection
- `lib/db/schema.ts` — add `risk_label` column to skills table
- `routes/skill-detail.tsx` — add warning banner for caution/danger skills
- `components/skill-content-renderer.tsx` — add risk badge wrapper

**CLI (packages/cli/src/):**
- `commands/use.ts` — rewrite identifier parsing + add warning banners + content boundaries

**Database:**
- Migration `0006` — add `risk_label` TEXT column to skills table

**No changes:**
- Search (FTS5 + Vectorize) — risk_label not a search signal
- Boost scoring, leaderboard scoring — unchanged
- Website URLs

## Security Architecture

```
REGISTER FLOW (scan at publish):
  GitHub SKILL.md ──► fetchGitHubSkill() ──► contentScanner() ──► risk_label ──► DB

USE FLOW (warn at use):
  CLI: skillx use ──► API ──► check risk_label ──► warning banner + content
  Web: skill detail ──► check risk_label ──► risk badge + warning banner + content
```

## References

- [Brainstorm: Prompt Injection Safety](../reports/brainstorm-260305-skillx-use-prompt-injection-safety.md)
- [Research: Prompt Injection Defense](../reports/researcher-260305-INDEX.md)
- [Original brainstorm: Identifier Redesign](../reports/brainstorm-260213-1233-skillx-use-identifier-redesign.md)
