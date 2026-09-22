# Drafts — PR split, PR bodies, issue comments (issue #25 / #24 / #21 / #23)

- Ngày: 2026-09-22
- Dùng cùng evidence: `plans/reports/verification-260922-0713-issue-25-24.md`
- Placeholder cần điền khi chạy: `<SHA>`, `<PR-A>`, `<PR-B>`, `<PR-C>`, `<RUN-URL>`

## 1. Kế hoạch tách branch (3 PR, merge theo thứ tự C → A → B)

Lý do: `pnpm typecheck` đỏ sẵn trên `main` (26 lỗi). Nếu merge #25/#24 trước thì mỗi PR vẫn đỏ
typecheck; merge PR typecheck trước để `main` xanh, sau đó #25 và #24 rebase lên `main` mới.

```bash
# C: typecheck unblock (merge trước)
git checkout -b fix/typecheck-search-subsystem main
#   chỉ stage: apps/web/app/lib/auth/auth-server.ts, app/lib/vectorize/embed-text.ts,
#   app/lib/search/hybrid-search.ts, app/components/search-command-palette.tsx,
#   app/routes/api.search.ts, app/routes/api.user-api-keys.ts, app/routes/search.tsx,
#   app/lib/http/request-params.ts
git commit -m "fix(types): clear pre-existing typecheck errors in the search subsystem"
# → PR C, merge

# A: #25 (sau khi rebase lên main có PR C)
git checkout -b fix/25-canonical-skill-identity main
#   stage toàn bộ phần identity (xem §2)
git commit -m "fix(skills): derive skill identity from repo + full path and keep legacy slugs alive"
# → PR A, merge

# B: #24
git checkout -b fix/24-cli-version-drift main
#   stage: packages/cli/{tsup.config.ts,src/index.ts,src/version.test.ts}
git commit -m "fix(cli): source --version from package.json at build time"
# → PR B, merge
```

Lưu ý khi tách: `packages/cli/src/commands/use.ts` + `use.test.ts` thuộc PR A (round-trip identity),
không thuộc PR B.

## 2. PR A — fix(skills): canonical skill identity (#25)

**Body**

```markdown
Closes #25.

## Why

Skill identity was derived from the display name, in two independent places:

* the seed pipeline disambiguated duplicate slugs with `skill.id.slice(-6)`, so shared
  `.../SKILL.md` ids became the mangled `-ill-md` suffix (`fetch-skillsmp-all.mjs:194`,
  `fetch-skillsmp-skills.mjs:163`);
* registration built `${owner}-${skillName}` from the leaf folder name only
  (`fetch-github-skill.ts:159`) and deduplicated by slug, so a second skill with the same
  folder name in one repository was reported as `existing` and skipped.

Measured on `scripts/seed-data.json`: 5081 rows, 49 exact duplicate slugs, 311 rows carrying
`-ill-md`; after stripping the suffix, 237 groups covering 548 rows, all with a parseable
`source_url`.

## What changed

* **Identity is the source**: `skills.source_repo` + `skills.source_path` with a partial unique
  index, so two skills that share a folder name in one repository are two rows.
* **One shared slug rule** (`packages/skill-identity`, zero deps) used by both the seed pipeline
  and runtime registration: readable base slug, plus a deterministic identity fragment on collision.
* **Alias layer**: `skill_aliases` maps every previous slug to its skill, resolved by
  `resolveSkillBySlug` on all slug-based read paths (detail, rate, review, favorite, install,
  vote, usage report). Old URLs keep working after a slug change.
* **Backfill tool**: `scripts/backfill-skill-identities.mjs` rewrites the seed data offline and
  emits/applies D1 remediation with a JSON backup; duplicate rows of one identity are parked on a
  tombstone slug so their data survives while the public slug is redirected.
* **CLI**: `org/repo/<path...>` keeps the whole path and resolves by identity instead of
  `${org}-${skillName}`.

## Evidence

* `pnpm typecheck` 0 errors, `pnpm test` 68 passed, `node scripts/assert-seed-identity.mjs` PASS
  (5060 rows, 0 duplicate slugs, 0 `SKILL.md`-derived slugs, deterministic across runs).
* `pnpm db:migrate` applies 0000–0009 to an empty local D1.
* Remediation verified end-to-end against a local D1 seeded with legacy-shaped rows: the
  `-ill-md` slug and a duplicate-source slug both resolve to the correct surviving row.
* Full record: `plans/reports/verification-260922-0713-issue-25-24.md`.

## Operator step after merge (production data)

The database is not remediated by the merge; deploy is manual and no workflow applies migrations.

```bash
pnpm --filter web db:migrate:remote
node scripts/backfill-skill-identities.mjs --from-d1 --remote --sql=backfill.sql
# review backfill.sql and the backup JSON, then:
cd apps/web && npx wrangler d1 execute skillx-db --remote --file ../backfill.sql
```
```

## 3. PR B — fix(cli): version from package.json (#24)

**Body**

```markdown
Closes #24.

`skillx --version` printed a hardcoded `0.1.2` while `packages/cli/package.json` was `0.4.0`
(`index.ts:15`). Reproduced by building `main`: `node packages/cli/dist/index.js --version`
→ `0.1.2`.

`tsup.config.ts` now reads the manifest at build time and injects `__SKILLX_VERSION__`, so the
binary cannot drift from `package.json`. `process.env.npm_package_version` is deliberately not
used: it is absent when a user runs an installed binary.

`packages/cli/src/version.test.ts` builds the binary and asserts
`--version === package.json.version`. Verified that the test fails on drift: hardcoding `0.1.2`
produces `expected '0.1.2' to be '0.4.0'`.

Separate observation for the release pipeline: npm `dist-tags.latest` was `0.3.0` while `main`
already carried the `0.4.0` release commit.
```

## 4. PR C — fix(types): typecheck unblock

**Body**

```markdown
`pnpm typecheck` fails on `main` (exit 2, 26 errors) in files unrelated to any open fix. This PR
clears them so the check can gate future work, without behaviour changes.

* `embed-text.ts`: the Workers AI binding's generated type also covers the async response, which
  carries no `data`; the sync shape is now probed before use.
* `hybrid-search.ts`: fallback result assembly uses an explicitly typed loop instead of a
  `filter` type predicate the compiler rejects.
* `api.search.ts` / `search.tsx` / `api.skill-detail.ts`: request query params come from one
  helper (`app/lib/http/request-params.ts`) that cannot throw on a malformed synthetic URL.
* `api.user-api-keys.ts`, `search-command-palette.tsx`, `auth-server.ts`, `search.tsx`: explicit
  body/response types and null-safe narrowing.
* `search.tsx` no longer depends on generated `./+types/search`.

Note: `app/routes/search.tsx` is not registered in `routes.ts`, so it is currently unreachable. It
is kept compiling rather than deleted; whether to route it at `/search` or remove it is a product
decision left to a follow-up.

Before: 26 errors. After: 0. `pnpm test` 68 passed.
```

## 5. Issue comment — #25

```markdown
Confirming both root causes, and the scope is larger than the 29/159 sample.

**1. `-ill-md` comes from `slice(-6)`**

`scripts/fetch-skillsmp-all.mjs:194` and `scripts/fetch-skillsmp-skills.mjs:163` disambiguated
duplicate slugs with `skill.id.slice(-6)`. For a skillsmp id ending in `SKILL.md`, `slice(-6)`
is `ILL.md` → `ill-md`.

Measured on `scripts/seed-data.json`: 5081 rows, 49 exact duplicate slugs, 311 rows carrying
`-ill-md` (237 distinct). After stripping that suffix: **237 collision groups covering 548 rows**,
and 548/548 have a parseable `repo + path` in `source_url`.

**2. Registration still collides — independently of the historical import**

`apps/web/app/lib/github/fetch-github-skill.ts:159` builds `${owner}-${skillName}` where
`skillName` is only the leaf folder (`scan-github-repo.ts` takes the parent folder name), while
`api.skill-register.ts` deduplicates by slug. So for `foo/a/ui-ux-pro-max` and
`foo/b/ui-ux-pro-max`, the second skill is reported as `existing` and skipped entirely.

**3. Live is still broken**

`GET /api/search?q=ui%20ux%20design` returns 20 results including **13 rows sharing the display
name `ui-ux-pro-max`**, and two `-ill-md` slugs are still live: `ypyt1-ui-ux-pro-max-ill-md` and
`hookvibe-ui-ux-pro-max-ill-md`.

**What is being shipped**

Canonical identity is `(repo, full path)` with a partial unique index; slugs are derived from that
identity by one shared rule; every previous slug is kept in a new `skill_aliases` table and
resolved on all slug-based read paths, so existing URLs, favorites, ratings and install history
survive a rename. The CLI `org/repo/<path...>` form now round-trips the full path.

Acceptance criteria: no duplicate slugs or `SKILL.md`-derived slugs in the seed data; two skills
with the same leaf folder in one repo both register; legacy slugs resolve to the canonical row;
migration applies cleanly; `pnpm typecheck` + `pnpm test` green.

Production data still needs the operator step (`db:migrate:remote` + the backfill tool), which is
documented in the PR. Until it runs, live search keeps showing the duplicates.

**Note for #21**: an immutable-artifact step must not start before this identity work lands,
otherwise artifacts get attached to the wrong skill.
```

## 6. Issue comment — #24

```markdown
Confirmed. Building `main` (`d093fa6`): `node packages/cli/dist/index.js --version` prints
`0.1.2` while `packages/cli/package.json` is `0.4.0`.

Fix: the manifest is now the single source of truth and the version is injected at build time
(`tsup.config.ts` → `__SKILLX_VERSION__`). `process.env.npm_package_version` was avoided because
it is absent when a user runs an installed binary.

`packages/cli/src/version.test.ts` builds the binary and asserts
`--version === package.json.version` — not a constant comparison. Mutation-checked: hardcoding
`0.1.2` makes the test fail with `expected '0.1.2' to be '0.4.0'`.

Separate observation while verifying: `npm view skillx-sh dist-tags` reported `latest: 0.3.0`
while `main` already carried the `0.4.0` release commit. If that is not just propagation lag, the
release workflow deserves its own issue.
```

## 7. Issue comment — #21

```markdown
Agree this is a packaging/install epic rather than a small CLI feature, and the reproduction is
now stronger: `skills/fact-check-x-complete` in `ASI2030/Fact-Check-X` has **109 blobs** today
(the issue says 94), across 13 subdirectories, and `SKILL.md` invokes nested runtime assets.

Today's path is metadata-only: registration stores the subfolder `SKILL.md`, and `--include-refs`
/ `--include-scripts` print metadata — so no command can reproduce a runnable tree.
`trackInstall()` also currently fires on *display*, which means the "install" metric really counts
views/uses.

Scope notes:

* **Do not start before the identity work lands.** Artifacts keyed on an unstable identity get
  attached to the wrong skill; `repo + full path` is a prerequisite.
* Publish must resolve to an immutable commit SHA, then emit a canonical manifest
  (`source_repo`, `source_commit`, `source_path`, `file_count`, `total_size`, per-file `size` /
  `sha256` / `mode`, `artifact_sha256`, `artifact_version`). The existing R2 binding can be the
  immutable store.
* Installer must reject symlinks/hardlinks, absolute paths, `..`, device files and unsupported
  exec modes; enforce caps on max file size, total size, file count and path length; stage,
  verify every file, then atomically move.
* Separate semantics and metrics: `skillx use` (inspect/consume) vs `skillx install`
  (materialize), and views/uses vs actual installs.

Acceptance criteria: a skill with nested resources installs to a verified tree whose per-file
hashes match the manifest; a tampered archive fails verification before extraction; and the
109-file reproduction above runs from the installed tree.
```

## 8. Issue comment — #23

```markdown
Verified the submission: `azeemkafridi/bulkpublish-api` has **24 `SKILL.md`** under
`skills/social-media-content-skills/`, and none of them are on the marketplace yet
(`GET /api/search?q=bulkpublish` → 0 results).

**One correction to the issue text.** The BulkPublish MCP annotations are good
(`readOnlyHint: false`, `destructiveHint: true`, `openWorldHint: true` on publish/delete/retry
tools) and contributors without `post:publish` are routed through an approval workflow. But that
does not mean the server always requires explicit user confirmation — an owner/admin with publish
permission can act directly, and whether a confirmation UI appears depends on the host/client
policy. Suggested wording:

> Destructive/open-world MCP tools are annotated accordingly; team approval is enforced for roles
> without direct publishing permission. Host-level confirmation behaviour should be validated
> separately.

**Gap this exposes in SkillX.** `risk_label` only models prompt-injection-style risk, so a skill
can be `safe` and still publish publicly, delete content, retry duplicate posts, read local files
or upload external media. Those are operational capabilities and belong in separate metadata, e.g.

```yaml
capabilities: [filesystem_read, network, external_write, destructive, credential_required]
```

This submission is a good first case for that model.

**How it can ship today**: the repository owner can publish through the existing authenticated
flow (GitHub ownership is verified):

```bash
skillx publish azeemkafridi/bulkpublish-api --scan
```

That is a marketplace submission plus a metadata/wording change — not core implementation work.
```
