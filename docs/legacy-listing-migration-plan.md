---
title: "Legacy listing migration plan"
description: "How existing SkillX catalog rows become listings without inventing immutable history"
status: active
priority: P0
tags: [phase-0, migration, registry, listing]
created: 2026-09-21
---

# Legacy listing migration plan

## Policy

Existing `skills` rows are **listings**, not releases.

A listing is content harvested from a remote source (`source_url`) whose bytes can change at that
source. A release is an immutable artifact produced by the packer with a SHA-256 digest, valid only
under the contract that the same version can never receive different bytes.

Every row currently in the catalog was harvested from GitHub. None of them has an artifact, a digest,
or a byte sequence that was ever frozen. The migration therefore:

- maps each legacy row to a listing,
- preserves its existing `slug` and public path verbatim,
- records `releaseId: null`, `releaseDigest: null`, and `immutable: false`.

It never fabricates a release. Doing so would claim reproducibility the platform cannot honour.

## Mapping

The mapping is mechanical and implemented in
`apps/web/app/lib/catalog/legacy-listing.ts` (`toListingMigration`).

| Legacy column | Listing field | Rule |
|---|---|---|
| `skills.id` | `listingId` | copied unchanged |
| `skills.slug` | `slug` | copied unchanged, then alias-resolved |
| `skills.slug` | `canonicalPath` | `/skills/{slug}` — same URL as today |
| `skills.source_url` | `sourceUrl` | copied unchanged, `null` allowed |
| `skills.version` | `declaredVersion` | kept as a publisher label only |
| — | `releaseId` | always `null` |
| — | `releaseDigest` | always `null` |
| — | `immutable` | always `false` |

Concrete rows from `scripts/seed-data.json` (5,080 entries) migrate as follows:

| Current slug | Listing path after migration | Release created |
|---|---|---|
| `find-skills` | `/skills/find-skills` | none |
| `vercel-react-best-practices` | `/skills/vercel-react-best-practices` | none |
| `web-design-guidelines` | `/skills/web-design-guidelines` | none |
| `remotion-best-practices` | `/skills/remotion-best-practices` | none |
| `frontend-design` | `/skills/frontend-design` | none |

Because no slug changes, every existing public URL continues to resolve. This is asserted by the
Phase 0 acceptance criterion "existing public URLs continue to resolve" and covered by
`legacy-listing-migration.test.ts`.

## Alias policy

`LEGACY_SLUG_ALIASES` is the single place a slug may be remapped. It is **empty today** and its test
asserts that it stays empty until a documented rename exists. Rules:

1. A rename is never silent. It requires an alias entry so the old URL keeps resolving.
2. Aliases are additive. Removing one is a breaking change and needs the same review as deleting a route.
3. `resolveLegacySlug` is the only resolver; no route may special-case a slug.

## Known defect carried in the legacy data

Issue #25 reports that folder-derived slugs produce mangled values such as `-ill-md`, and that 29 of
159 sampled rows collide into indistinguishable duplicates. Those rows are legacy data defects, not
migration defects: the migration preserves whatever slug exists so links keep working. The test suite
explicitly covers a mangled slug (`some-repo-ill-md`) and asserts it stays resolvable.

Cleaning those slugs is Phase 2 work, because a cleanup that changes a public URL must ship with an
alias entry under the policy above.

## What happens next (out of Phase 0 scope)

- Phase 2 adds the `import` command that performs this mapping explicitly, replacing the current
  GitHub-registration behaviour that is confusingly named `publish`.
- Phase 2 decides whether `is_paid` / `price_cents` on listing rows stay as display-only fields or move
  onto the `product_offers` contract. Phase 0 leaves both columns untouched.
- Paid or private listings need an `entitlements` row before the protected content resolver will serve
  their payload.

## Generator baseline note

`apps/web/drizzle.config.ts` lists schema files explicitly rather than by glob. This is deliberate:
`skill_references` was created by the hand-written migration `0008_add-skill-references.sql` and is
absent from the `0006` generator snapshot, so a glob would make the generator re-emit it.
`0009_brave_sally_floyd.sql` stripped the equivalent stale statements (`votes`, its indexes, and the
`upvote_count` / `downvote_count` / `net_votes` / `scripts` / `fts_content` columns that migrations
0007 and 0008 had already created) while keeping them in the `0009` snapshot. That realigned the
baseline: a second `drizzle-kit generate` now reports "No schema changes, nothing to migrate".
