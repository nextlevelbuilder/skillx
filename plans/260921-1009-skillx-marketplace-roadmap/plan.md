---
title: "SkillX Marketplace & Agent-Native Roadmap"
description: "Phase 0 implementation plan plus gap analysis against the current codebase"
status: in_progress
priority: P0
branch: refactor-marketplace-and-agent-native
tags: [marketplace, agent-native, registry, compatibility, phase-0]
created: 2026-09-21
---

# SkillX Marketplace & Agent-Native Roadmap

## Summary

Evolve SkillX from a discovery directory into an agent-native skills/hooks marketplace with immutable
packages, compatibility-aware discovery and install, personal kits, multi-device sync, credits-based
commerce, and creator publishing.

The roadmap has seven phases. **This goal implements Phase 0 only.** Phases 1-6 are tracked as GitHub
issues and will be executed as separate goals.

Sequencing principle: first make packages trustworthy and reproducible, then installable, then hooks
safe enough to distribute, and only then attach money and creator payouts.

## Scope of this goal

| Deliverable | Status |
|---|---|
| Gap analysis (roadmap vs current codebase) | this document |
| [Phase 0 breakdown](./phase-00.md) | this directory |
| GitHub epic + 7 phase issues with `Depends on #<n>` chain | tracked by goal task `issue-stack` |
| Phase 0 code: contracts, migrations, DTO boundary, compatibility engine, legacy plan | tracked by goal tasks `phase0-*` |

Out of scope: implementing Phases 1-6, porting AgentKit's Go installer to TypeScript, making AgentKit
depend on SkillX, any commerce/payment runtime change, and any edit to
`plans/260225-0748-premium-skills-credits-marketplace`.

## Gap analysis: roadmap vs current codebase

### G1 - No contracts package

`pnpm-workspace.yaml` globs `apps/*` and `packages/*`, but `packages/` contains only `cli`. There is no
`packages/contracts`, `packages/mcp`, or `packages/package-format`, so every domain type currently
lives inside the web app and cannot be shared with CLI, MCP, or a future packer.

Today's implicit shared surface is hand-duplicated: `packages/cli/src/commands/find.ts` re-declares its
own `Skill` interface rather than importing a contract.

### G2 - `skills` is a flat catalog entity, not a package registry

`apps/web/app/lib/db/schema.ts` defines 12 tables. There is no `publisher`, `package`, `release`,
`artifact`, `offer`, `entitlement`, `collection`, or `collection_revision` table; the roadmap's whole
domain model is absent.

Two relevant columns already exist:

- `skills.is_paid` (schema.ts:18)
- `skills.price_cents` (schema.ts:19)

The pending plan `plans/260225-0748-premium-skills-credits-marketplace` proposes repurposing both. That
plan is intentionally left untouched by this goal, but Phase 0 must not build on the repurposing.

### G3 - `skills.content` leaks through four surfaces with no authorization boundary

`content` is the SKILL.md payload. It is read with a full-row `select()` and forwarded verbatim:

| Surface | Location | Evidence |
|---|---|---|
| Detail API | `apps/web/app/routes/api.skill-detail.ts:54-59` | `db.select().from(skills)`, whole row returned in the JSON body |
| Hybrid search | `apps/web/app/lib/search/hybrid-search.ts` `fetchSkills()` | `db.select().from(skills)`, projected into `SearchResult.content` |
| SSR page | `apps/web/app/routes/skill-detail.tsx:179-180` | renders `data.skill.content` |
| CLI | `packages/cli/src/commands/find.ts:102`, `use-display.ts:59,105` | prints `skill.content` |

There is exactly one read path — the row itself. Any premium or private listing added later would
leak automatically, because no resolver stands between the row and the response.

**Constraint discovered during reconnaissance:** every skill in the catalog is currently free and
public, and `skillx use` plus the skill page depend on `content`. Phase 0 therefore must introduce
an *authorization boundary*, not remove `content` from public responses. Free/public listings keep
returning `content` on all existing surfaces; the boundary denies protected payloads only.

### G4 - No compatibility concept exists at all

A case-insensitive grep for `compatible` across `apps/` and `packages/` matches only the generated
`apps/web/worker-configuration.d.ts` (Workers AI embedding-pool documentation). There is no
compatibility field, no `unknown` state, no evidence model, and no reason codes.

### G5 - `import` and `publish` are conflated by name

`POST /api/skills/register` (`apps/web/app/routes/api.skill-register.ts`) already behaves as the
roadmap's `import`: it fetches SKILL.md files from a GitHub repo, scans them, and stores catalog rows.
No immutable release is produced.

Meanwhile the CLI command is named `publish` (`packages/cli/src/commands/publish.ts`) and calls that
same register endpoint. Phase 0 must separate the concepts at contract level and record the rename
(`publish` → `import`) as the Phase 2 migration, without breaking the existing CLI command yet.

### G6 - Migration tooling cannot see more than one schema file

`apps/web/drizzle.config.ts` sets `schema: "./app/lib/db/schema.ts"` — a single file. But
`app/lib/db/skill-references-schema.ts` defines `skillReferences` outside that file, and migration
`0008_add-skill-references.sql` was therefore written by hand.

Adding several new contract tables under a single file would breach the project's 200 LOC per file
rule (`schema.ts` is already 233 lines). Phase 0 must therefore extend the generator's schema input
before generating migrations, or the new tables will silently not be generated.

The fix uses an **explicit multi-file list**, not a glob: `skill_references` is missing from the `0006`
generator snapshot, so a glob would make the generator re-emit a table that `0008` already created.

### G7 - Test harness would not run contract tests

`vitest.config.ts` includes only:

```
apps/web/app/**/*.test.ts
packages/cli/src/**/*.test.ts
```

A new `packages/contracts` test suite would be collected by nothing. The include list must be extended
as part of Phase 0, otherwise the "shared validator fixtures exist" acceptance criterion has no
executable evidence. Baseline today: 2 test files total
(`apps/web/app/lib/security/content-scanner.test.ts`, `packages/cli/src/commands/use.test.ts`).

### G8 - `getDb` schema registration

`apps/web/app/lib/db/index.ts` passes `* as schema` into `drizzle()`. New contract tables must be
re-exported from `schema.ts` (or an index that `index.ts` imports) or they will not be reachable from
the query builder, even after migration.

### G9 - Reconciled expectations

- Public alpha, beta, and paid launch milestones from the roadmap are **not** part of this goal.
- The roadmap's `skillx.package/v1` example uses `compatible.<runtime>.versions|scopes|requires|status`.
  Phase 0 defines that shape and its validator; it does not implement the CLI surface that consumes it
  (that is Phase 1's `--compatible`, `inspect`, `check`).
- The roadmap's "Remove direct `skills.content` leakage from paid/private-capable search/detail/SSR
  paths" is implemented as a resolver boundary, per the constraint in G3.

## Phase map

| Phase | Title | GitHub issue | Goal status |
|---|---|---|---|
| Epic | SkillX Marketplace & Agent-Native Platform Roadmap | see `issue-stack` task | tracked |
| 0 | Foundations and protected data boundaries | see `issue-stack` task | **implemented in this goal** |
| 1 | Agent-native discovery and compatibility | see `issue-stack` task | issue only |
| 2 | Immutable registry and publishing CLI/CI | see `issue-stack` task | issue only |
| 3 | Personal kits, installer, lockfile, multi-device sync | see `issue-stack` task | issue only |
| 4 | Hook packs and AgentKit reference publishing | see `issue-stack` task | issue only |
| 5 | Credits, orders, entitlements and paid launch | see `issue-stack` task | issue only |
| 6 | Creator economy, moderation and settlement | see `issue-stack` task | issue only |

## Reference

`plans/260225-0748-premium-skills-credits-marketplace` covers a narrower credits/Stripe/SePay design
(85/15 split, `credit_cost` on `skills`, Stripe Connect payouts). It remains untouched. Phase 5 and
Phase 6 will supersede its delivery model once the immutable registry and entitlement model exist.

## Unresolved questions

1. Whether `packages/contracts` should publish to npm in Phase 2 or stay workspace-internal.
2. Whether the legacy listing migration keeps `is_paid`/`price_cents` as display-only fields or drops them.
3. Which harness gets the first installer adapter in Phase 3.
