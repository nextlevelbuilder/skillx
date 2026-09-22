## What

Skill identity is `(source_repo, source_path)`. Public slugs derive from that identity only, the import path stops treating two same-named folders in one repository as a single skill, and every slug a skill used to have keeps resolving through a new `skill_aliases` table.

## Why (refs #25)

- The SkillsMP fetchers built slugs with `slice(-6)`, which produced the slugs ending in `-ill-md` (49 duplicate slugs in `scripts/seed-data.json`).
- Registration identified a skill by `owner` plus the leaf folder, so `foo/a/ui-ux-pro-max` and `foo/b/ui-ux-pro-max` collided and the second was reported as "existing" and skipped.
- Nothing kept old slugs alive, so a rename or a collapsed duplicate 404'd existing links, favourites and external references.

## Scope

- **Shared rules**: new zero-dependency package `@skillx/skill-identity` (`slugify`, `parseSourceUrl`, `sourceIdentity`, `identityKey`, `canonicalSlug`, `assignCanonicalSlugs`, `hashFragment` using FNV-1a + djb2 so the same code runs in Node, workerd and the browser, and `compareCodepoints` for locale-independent ordering).
- **Seed pipeline**: both `scripts/fetch-skillsmp-*.mjs` rewritten onto those rules, plus `scripts/backfill-skill-identities.mjs` (report, `--write`, `--sql`, local `--apply`) and `scripts/assert-seed-identity.mjs`. `scripts/seed-data.json` is now 5060 rows with 0 duplicate slugs and 0 `-ill-md` slugs, byte-identical across two runs.
- **Migration**: `0010_sour_runaways.sql` (renumbered because #39 landed `0009`) adds `source_repo`, `source_path`, the partial unique index `idx_skills_source_identity` and the `skill_aliases` table.
- **Runtime**: `skill-aliases.ts` provides `findSkillBySource`, `resolveSkillBySlug`, `findSkillsByLeaf` and `recordSkillAlias`; `skill-import.ts` now resolves the stored row by identity and derives the slug from it, so two same-leaf skills both register; the detail route accepts `repo`/`path` for pinned lookups plus a unique-leaf fallback for the documented `owner/repo/leaf` form; the slug-based routes (rate, review, favourite, install, vote, usage report) resolve through the alias layer; `api.admin.seed.ts` upserts by identity, then `source_url`, then a legacy slug, records an alias on rename, and refuses to overwrite a row that already owns an identity.
- **CLI**: `owner/repo/skill` keeps the full source path instead of collapsing it to `${org}-${skillName}`.
- **Carried over**: `lib/http/request-params.ts` (the only file that survived from the superseded #42) and the payload-boundary allowlist entry for the resolver, with a reason.

## Verification

- `pnpm typecheck` exit 0 with 0 errors; `pnpm test` 188 passed; `pnpm build` exit 0.
- `node scripts/assert-seed-identity.mjs`: PASS, and the seed file is deterministic (sha256 `37e2d02369f57b89…` on two `--write` runs).
- Fresh local D1: `0000`–`0010` applied cleanly, including #39's `0009_brave_sally_floyd`.
- Regression tests apply the real migration chain to a real SQLite database and prove that a rename whose destination slug another row still holds does not violate `skills.slug`, that duplicates release the slug before the survivor is renamed, that a second remediation run rewrites nothing, and that wrangler's stringified SQL NULL is normalised.
- Local D1 operator run over a chained rename plus a duplicate collapse: 0 constraint failures, the second run produced 0 statements, and the old slug resolved to the new owner through `skill_aliases`.

## Operator step, not performed here

Production D1 is unreachable from this environment (`wrangler whoami` reports no session), so live data is untouched:

```bash
pnpm --filter web db:migrate:remote
node scripts/backfill-skill-identities.mjs --from-d1 --remote --sql=backfill.sql
cd apps/web && npx wrangler d1 execute skillx-db --remote --file ../backfill.sql
```

Run the migration **before** deploying the app: a slug miss queries `skill_aliases`, and a missing table turns 404s into 500s. The backfill prints the aliases a live slug now shadows; those old URLs change meaning by design because two skills legitimately want the same name.

## Known limitations

- `api.user-interactions.ts` resolves canonical slugs only, so a stale alias slug sent by a client does not match.
- `apps/web/app/routes/search.tsx` is still unregistered in `routes.ts` (pre-existing dead route), and `api.search.ts`/`search.tsx` still parse URLs without a try/catch (pre-existing, flagged by the linter).

Refs #25
