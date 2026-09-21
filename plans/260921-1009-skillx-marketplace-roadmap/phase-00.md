---
title: "Phase 0 — Foundations and protected data boundaries"
description: "Implementation breakdown for Phase 0 of the SkillX Marketplace roadmap"
status: in_progress
priority: P0
branch: refactor-marketplace-and-agent-native
tags: [phase-0, contracts, compatibility, dto-boundary]
created: 2026-09-21
---

# Phase 0 — Foundations and protected data boundaries

**Depends on:** Epic

## Objective

Create the domain contracts and authorization boundaries required by all later phases, and remove
premium/private payload leakage risk before any paid content exists.

## Scope

- Add publisher/package/release/artifact domain models.
- Add structured `compatible` declarations and a verification-evidence model.
- Add collection/revision, offer, and entitlement models at contract level.
- Split public catalog DTOs from protected payload DTOs.
- Remove direct `skills.content` leakage from paid/private-capable search/detail/SSR paths.
- Add a shared compatibility engine with machine-readable reason codes.
- Create a migration strategy for legacy listings without inventing immutable history.

## Implementation tasks

### Workstream 1 — Contracts (`phase0-contracts`)

- [ ] Define `skillx.package/v1` schema and fixtures.
- [ ] Define package kinds: `skill`, `hook-pack`, `bundle`.
- [ ] Define release states: `draft` / `quarantined` / `published` / `yanked`.
- [ ] Define compatibility normalized representation.
- [ ] Define verification evidence schema.
- [ ] Extend `vitest.config.ts` include globs to collect contract tests (gap G7).
- [ ] Re-export contract tables from `app/lib/db/index.ts` reachable schema (gap G8).

### Workstream 2 — Persistence (`phase0-migrations`)

- [ ] Backup the local D1 database before any schema change.
- [ ] Switch `apps/web/drizzle.config.ts` `schema` from a single file to an explicit
      multi-file list (gap G6). A glob is deliberately NOT used: `skill_references`
      was created by the hand-written `0008` migration and is absent from the `0006`
      snapshot, so a glob would make the generator re-emit it.
- [ ] Add package/release/publisher DB migrations.
- [ ] Add entitlement contract/table skeleton.
- [ ] Add collection/revision contract/table skeleton.
- [ ] Verify existing `skills` rows survive migration unchanged.

### Workstream 3 — Authorization boundary (`phase0-dto-boundary`)

- [ ] Refactor public search/detail view models to explicit DTO projections.
- [ ] Add protected content resolver boundary.
- [ ] Add authorization regression tests for API/SSR/search.

### Workstream 4 — Compatibility engine (`phase0-compat-engine`)

- [ ] Add compatibility reason-code module.

### Workstream 5 — Legacy migration (`phase0-legacy-plan`)

- [ ] Add legacy slug/listing migration plan.

## Acceptance criteria

1. Public API/SSR/search cannot expose protected payload.
2. Missing compatibility is `unknown`.
3. Import/listing is separate from publish/release.
4. Shared validator fixtures exist.
5. Existing public URLs continue to resolve.

## Verification commands

```bash
pnpm test           # 0 failures, includes new contract + compatibility + regression suites
pnpm typecheck      # 0 errors
pnpm --filter web db:generate   # produces a migration for the new tables
pnpm --filter web db:migrate    # applies cleanly to the local D1 database
```

Evidence required before closing Phase 0:

- Authorization regression test proving free/public listings still return `content` on search, detail
  API, and SSR, while a protected listing does not.
- Compatibility engine test covering all five states: `declared`, `verified`, `unknown`,
  `unsupported`, `blocked`.
- Grep proof that no protected/paid path reads `skills.content` outside the resolver.
- Confirmation that at least one existing public slug still resolves after migration.

## Design decisions carried into implementation

### D1 — The boundary denies, it does not strip

All current listings are free and public, and both the skill page and `skillx use` depend on
`content`. The resolver therefore returns payload for public/free listings on every existing surface
and denies only protected (paid or private-capable) listings. Removing `content` broadly would break
the live product and is not what Phase 0 requires.

### D2 — One compatibility source of truth

Search filters, web badges, API responses, and (later) CLI/MCP tools must all call the same engine
module. No surface may re-derive support from a raw declaration.

### D3 — Declared and verified stay separate

A publisher declaration is stored as `declared`. A `verified` state requires a verification-evidence
record bound to the exact release digest plus harness name, harness version, probe identifier,
timestamp, and verifier identity. A publisher cannot self-assign `verified`.

### D4 — Missing evidence degrades downward only

No metadata resolves to `unknown`. A missing required capability resolves to `blocked`. Neither
resolves to `supported`.

### D5 — Legacy listings are listings, not releases

Migrated catalog rows become listings that keep their existing slug and URL. No immutable release,
digest, or artifact is invented for them, because no such bytes were ever published under a
versioned contract.

### D6 — Import and publish are distinct verbs

The existing `POST /api/skills/register` + CLI `publish` path is import semantics: it harvests
SKILL.md from GitHub into the catalog. Phase 0 records this in contracts and defers the CLI rename to
Phase 2 so the current command keeps working.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| `content` removal breaks skill page or `skillx use` | Product outage | D1 boundary; regression test asserts free listings still return content |
| Drizzle config glob misses a schema module | New tables silently absent from migrations | Verify generated SQL lists every new table before applying |
| Local D1 data loss during migration | Lost dev data | Backup before migrate; assert row counts before and after |
| Compatibility engine diverges per surface | Agents get contradictory answers | Single module, single test suite, no surface-local logic |
| Legacy slug mapping incomplete | Broken public URLs | Alias table plus a test that old slugs still resolve |

## Out of scope

- Implementing Phase 1-6 (issues only).
- Porting AgentKit's Go installer to TypeScript.
- Any commerce, payment, or entitlement *runtime* behaviour.
- Editing `plans/260225-0748-premium-skills-credits-marketplace`.
