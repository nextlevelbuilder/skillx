---
title: "Phase 3.4: Skill References & Scripts"
description: "Add references (full-content indexed) and scripts (metadata) to skills for richer discovery and agent-mediated execution"
status: completed
priority: P1
effort: 16h
branch: feat/skill-references-scripts
tags: [feature, backend, frontend, cli, search, database]
created: 2026-02-13
notes: "Publish plan (260305) completed — blocker resolved. This plan's Phase 4 also touches register flow (now auth-gated)."
---

# Phase 3.4: Skill References & Scripts

## Overview

Enrich SkillX skills with **references** (markdown docs indexed in Vectorize for semantic search) and **scripts** (executable metadata for agent-mediated execution). Skills in the Claude Code ecosystem ship with `references/` and `scripts/` directories alongside SKILL.md — SkillX currently only stores SKILL.md content.

**Brainstorm report:** [brainstorm-260213-1218-phase-3-4-references-scripts.md](../reports/brainstorm-260213-1218-phase-3-4-references-scripts.md)

## Key Decisions

1. **References**: Full content indexing — fetch .md files from GitHub, store in DB, chunk + embed in Vectorize
2. **Scripts**: Metadata only — name, description, command, URL. Agent fetches and reviews before executing (no sandbox/Docker)
3. **Storage**: JSON columns on `skills` table for metadata + separate `skill_references` table for full content
4. **Progressive indexing**: Start with top-rated skills, expand. GitHub Trees API to discover refs/scripts dirs.

## Phases

| # | Phase | Status | Effort | Link |
|---|-------|--------|--------|------|
| 1 | Database schema & migration | Complete | 2h | [phase-01](./phase-01-database-schema-migration.md) |
| 2 | GitHub fetcher script | Complete | 4h | [phase-02](./phase-02-github-fetcher-script.md) |
| 3 | Seed pipeline & Vectorize | Complete | 3h | [phase-03](./phase-03-seed-pipeline-vectorize.md) |
| 4 | API & search updates | Complete | 2h | [phase-04](./phase-04-api-search-updates.md) |
| 5 | UI: skill detail page | Complete | 3h | [phase-05](./phase-05-ui-skill-detail.md) |
| 6 | CLI updates | Complete | 2h | [phase-06](./phase-06-cli-updates.md) |

## Dependencies

- Phase 1 → unlocks Phase 2, 3
- Phase 2 → unlocks Phase 3 (needs data to seed)
- Phase 3 → unlocks Phase 4 (API needs data in DB)
- Phase 4 → unlocks Phase 5, 6 (UI/CLI consume API)
- Phase 5 and 6 can run in parallel

## Cross-Plan Dependencies

**[Leaderboard Enhancements plan](../260213-1558-leaderboard-enhancements/plan.md)** also adds a D1 migration and columns to `skills` table. No code conflicts — different columns (`upvote_count`/`downvote_count`/`net_votes` vs `scripts`/`fts_content`). Migration numbering: this plan = `0006`, leaderboard plan = `0007`. The leaderboard plan also modifies scoring files (`boost-scoring.ts`, `leaderboard-scoring.ts`) which this plan does NOT touch.

## Risks

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| GitHub API rate limits (5K/hr) | High | Medium | Use token auth, progressive fetching, resume support |
| Workers AI embedding limits | Medium | Medium | Batch with `--batch=10`, skip-vectors fallback |
| D1 storage limits | Low | High | JSON columns keep data compact, monitor row sizes |
| Stale reference content | Medium | Low | TTL-based reindex, source_url always available |
| Vectorize capacity (2M+ new vectors) | High | High | Progressive indexing, check quota, top 1K first |
| SSRF via unvalidated ref URLs | Medium | High | Validate GitHub URL pattern only |
| Terminal escape injection in CLI | Low | Medium | Strip control chars from script commands |

## Red Team Review

### Session — 2026-02-13
**Findings:** 13 total (11 accepted, 2 rejected)
**Severity breakdown:** 2 Critical, 5 High, 4 Medium (accepted); 2 Medium (rejected)

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | GitHub Trees API truncation not handled | Critical | Accept | Phase 2 |
| 2 | Reference content size unbounded | Critical | Accept | Phase 2, 3 |
| 3 | FTS5 ref titles — contradictory, no implementation | High | Accept | Phase 3, 4 |
| 4 | Duplicate references — missing unique constraint | High | Accept | Phase 1 |
| 5 | GitHub rate limit — no concrete budget | High | Accept | Phase 2 |
| 6 | Vectorize capacity — no planning | High | Accept | Phase 3 |
| 7 | SSRF via unvalidated reference URL | High | Accept | Phase 3 |
| 8 | Terminal escape injection in CLI | Medium | Accept | Phase 6 |
| 9 | Script description inference fragile | Medium | Accept | Phase 2 |
| 10 | CLI raw mode token waste | Medium | Accept | Phase 6 |
| 11 | Seed scripts JSON stringification gap | Medium | Accept | Phase 3 |
| 12 | Reference content in D1 never served | Medium | Reject | — |
| 13 | Scripts JSON column vs separate table | Medium | Reject | — |

**Rejected rationale:**
- #12: Content needed for re-indexing/backfill without re-fetching GitHub + future content preview
- #13: Max 10 scripts, metadata-only, never queried independently. JSON simpler than extra table.

## Validation Log

### Session 1 — 2026-02-13
**Trigger:** Initial plan creation, post red-team review
**Questions asked:** 6

#### Questions & Answers

1. **[Scope]** Progressive indexing: Plan says 'start with top-rated skills, expand.' What's your initial rollout scope for the GitHub fetcher (Phase 2)?
   - Options: Top 50 skills first | Top 1K skills | All 133K at once
   - **Answer:** Top 50 skills first
   - **Rationale:** Validates end-to-end pipeline with minimal risk. Catches rate limits, data quality issues, and truncation edge cases before scaling.

2. **[Scope]** The 133K skills are already seeded in production. After adding references, should we re-seed all skills or only update skills that have references?
   - Options: Update only skills with refs | Re-seed everything | New skills only
   - **Answer:** Update only skills with refs
   - **Rationale:** Avoids touching 130K+ skills unnecessarily. Only skills with discovered references get updated. Faster and lower risk.

3. **[Architecture]** For Vectorize capacity: indexing reference content adds ~2M new vectors. Should we index ALL reference content in Vectorize, or just titles/metadata?
   - Options: Full content | Titles + first paragraph only | Skip Vectorize for refs
   - **Answer:** Titles + first paragraph only
   - **Rationale:** 80% search value at 20% vector cost (~200K vectors vs 2M). Stays within Vectorize quota. Full content indexing deferred if needed.

4. **[Architecture]** The plan appends ref titles to skill `content` field at seed time for FTS5. This modifies the stored SKILL.md content. Acceptable?
   - Options: Append to content | Separate fts_content column | Skip FTS5 enhancement
   - **Answer:** Separate fts_content column
   - **Rationale:** Keeps SKILL.md content pure for display. fts_content is a computed column used only by FTS5 virtual table. No user-visible mutation.

5. **[Architecture]** Phase 1 migration: should fts_content column be added alongside scripts, or separate migration?
   - Options: Same migration | Separate migration
   - **Answer:** Same migration
   - **Rationale:** Single ALTER TABLE run minimizes production disruption. All schema changes in one migration.

6. **[Tradeoffs]** CLI `skillx use` output: should refs/scripts show in human-readable mode by default?
   - Options: Always show in human mode | Opt-in everywhere | Always show everywhere
   - **Answer:** Always show in human mode
   - **Rationale:** Human mode = rich display (default). Raw mode = minimal for agents (opt-in with --include-refs/--include-scripts).

#### Confirmed Decisions
- **Rollout:** Top 50 skills first → verify → expand to 500 → full
- **Re-seed:** Only update skills that have references (not all 133K)
- **Vectorize:** Index titles + first paragraph only (~200K vectors, not 2M)
- **FTS5:** New `fts_content` computed column (don't mutate stored content)
- **Migration:** Single migration with scripts + fts_content + skill_references table
- **CLI:** Human mode shows refs/scripts always; raw mode opt-in only

#### Action Items
- [ ] Add `fts_content TEXT` column to Phase 1 migration
- [ ] Update Phase 3 Vectorize indexing: titles + first paragraph only
- [ ] Update Phase 3 FTS5 step: populate fts_content instead of mutating content
- [ ] Update Phase 2 with `--top-n=50` default and staged rollout docs
- [ ] Update Phase 3 seed: only update skills that have references

#### Impact on Phases
- Phase 1: Add `fts_content TEXT` column to migration SQL and Drizzle schema
- Phase 2: Default `--top-n=50`, document staged rollout procedure
- Phase 3: Change Vectorize to index titles+first-paragraph. Populate fts_content column instead of mutating content. Only update skills with refs.
- Phase 6: Human mode always shows refs/scripts; raw mode requires flags
