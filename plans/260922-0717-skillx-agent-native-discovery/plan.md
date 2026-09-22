# Phase 1 — Agent-native discovery and compatibility

Issue: [#33](https://github.com/nextlevelbuilder/skillx/issues/33) · Epic #31 · Depends on Phase 0 (#32, merged as `b02b520`)

## Objective

Make SkillX equally useful to humans and agents for discovery, inspection, and compatibility
reasoning: an agent must be able to discover a package, read its requirements, see the evidence
behind a support claim, and understand an incompatibility — **without scraping HTML**.

## The blocking gap this plan has to solve first

Phase 0 put compatibility inputs on `package_releases` (`compatibility_json`, `artifact_digest`) plus
`release_verification_evidence`. But:

- `skills` has **no compatibility column** (verified: 30 columns, none compatibility-related), and
- nothing links a `skills` row to a `package_releases` row.

Every catalog row that exists today is a **legacy listing** (`legacy-listing.ts`: `releaseId: null`,
`releaseDigest: null`, `immutable: false`). So a compatibility read surface built directly on
`package_releases` would answer `unknown` for the entire catalog, and `--compatible` /
`skillx check` / the badges would be permanently inert.

Phase 1 therefore adds a **listing-level declaration** and one documented precedence rule. This does
not create a second decision point: the engine (`normalizeCompatibility`) stays the only thing that
decides, and one resolver owns the input precedence.

### Precedence (single rule, one owner)

1. If the row has an immutable release, the **release declaration wins** (and only a digest-bound
   release can reach `verified`).
2. Otherwise the **listing declaration** is used. A listing has no digest, so it can reach at most
   `declared` — never `verified`.
3. Neither present → `unknown` with `COMPAT_DECLARATION_MISSING`.

When Phase 2 lands the immutable registry, step 2 is deleted; the rule is documented so that removal
is a one-line change rather than an archaeology exercise.

### Honest consequence

Today's catalog declares nothing, so it resolves to `unknown`. The surfaces must say so plainly
(`COMPAT_DECLARATION_MISSING`) rather than imply support, and `--compatible` must not silently drop
undecidable rows without the caller being able to see why.

## Slices

| # | Slice | Tasks covered | Status |
|---|---|---|---|
| 1 | Listing-level declaration + shared catalog resolver | foundation for 1–5 | done — `c1a6479`, `95a169e` (16 tests) |
| 2 | Compatibility-aware API (`?compatible=`, compat on search + detail) | 1, 5 (API half) | done — `d02a897` (40 tests) |
| 3 | CLI: `--compatible`, `inspect`, `check --target`, JSON/exit-code envelope | 1, 2, 3, 4 | done — `033f2d2` (32 tests, tsup build ok) |
| 4 | Web compatibility badge with evidence details | 5 | done — `aec3d1b` (5 tests) |
| 5 | Markdown routes, `llms.txt`, `llms-full.txt`, `rel=alternate`, Copy | 9–13 | done — `c6aa7b9`, `f31c9ed` (71 tests) |
| 6 | Remote MCP server + tools, WebMCP read tools | 6, 7, 8 | done — `89b5e6f`, `b09f539` (52 tests) |
| 7 | Parity tests across API/CLI/MCP/Markdown | 15 | done — `f0ee904` (15 tests) |

**Task 14 of #33 (publisher/harness landing docs) is not done** and was not assigned to a slice.
It is the one implementation task in the issue with no code behind it.

### Slice 6 notes

`POST /api/mcp` implements `initialize`, `notifications/initialized`, `tools/list`, and
`tools/call` over the MCP streamable-HTTP transport. Anything else answers `method not found`
rather than being stubbed, so a client can see exactly what the server does. Every handler is a
thin adapter over the same executors the API and the CLI use.

Three behaviours worth knowing before reading the code. A tool that cannot answer returns
`found: false` with a reason code rather than an error, because `no_package` is the expected
answer for most of the catalog until the registry is populated; "not in the registry" and "the
call failed" are different answers. A tool failure is a JSON-RPC *success* carrying `isError`,
per MCP. And `get_kit` reports a private collection as `not_found`, identical to an unknown slug,
so the tool cannot enumerate private slugs.

The endpoint sets no CORS headers on purpose: MCP clients are not browsers and the WebMCP layer
runs same-origin, so nothing in scope needs cross-origin access.

WebMCP (`lib/webmcp/`) is progressive enhancement. Detection checks the shape of
`navigator.modelContext` rather than trusting presence, and a registration that throws is reported
as `failed`, never as `registered`.

### Slice 7 notes — what parity does and does not cover

The parity test compares contracts ↔ web adapter, web adapter ↔ MCP, and engine ↔ Markdown against
one fixture. It **cannot** import the CLI: `apps/web/tsconfig.cloudflare.json` lists its own files
only, so a cross-package import fails the project boundary. The CLI is therefore the one surface
holding a hand-written mirror of `isCompatibilityActionable` instead of calling it, pinned by value
in its own test. Replacing that mirror with the contract call is the cleanest follow-up.

### Remote D1 state (changed since slice 5)

Migrations **0009 and 0010 are now applied to remote `skillx-db`**, verified independently through the
D1 REST API: remote had been missing 0009 as well, so the Phase 0 registry tables did not exist in
production until now. Post-state: 21 → 28 tables, `skills` 130,309 rows unchanged, `skills_fts`
intact, 11 migrations recorded, none pending.

Recovery points taken beforehand: time-travel bookmark
`000049e3-00000000-000050ee-38c209ac471ef825f224801bdbf967b3`, plus a schema capture at
`.wrangler/backups/skillx-remote-schema-PRE-0010-20260922-074943.json`. `wrangler d1 export --remote`
fails on this database (wrangler 4.63), so the schema capture goes through the D1 REST API instead.

The catalog is **130,309 skills**, not the ~5k assumed earlier — which means `llms.txt` covered under
1% of the catalog and `llms-full.txt` about 0.15%. Both now accept `?limit=` (see below).

### Post-review hardening

Work done after the slice-7 review, all in the same PR.

**The CLI reported the wrong version (#24).** `src/index.ts` hardcoded `0.1.2` while npm published
`0.4.0`, and merge to `main` triggers `release-please`, so the next publish would have shipped a
binary announcing the wrong version. It now reads the manifest at runtime. Depth is load-bearing:
the helper sits at `src/version.ts` beside the entry point, not in `src/lib/`, because bundling
inlines it into `dist/index.js` and both locations must be exactly one level below the package root.
Verified by running the built CLI, not only in source.

**Pull requests had no verification at all.** The only workflow was `release-cli.yml` on push to
`main`. `.github/workflows/ci.yml` now runs frozen install, typecheck, tests, and both builds on
pull requests. Writing it found two real defects: `pnpm-lock.yaml` had drifted from the manifests
(missing the `@skillx/contracts` entry for `apps/web`), so `--frozen-lockfile` would have failed; and
the root `typecheck` script filtered to `apps/web`, so `packages/cli` and `packages/contracts` were
never typechecked anywhere. Both are fixed. The workflow's first GitHub run is not yet observed.

**`llms.txt` and `llms-full.txt` now take `?limit=`** with caps of 5000 and 1000, and the truncation
note names the knob. Two fixes came with it: `Number` replaces `parseInt`, because `parseInt("1e9")`
is 1 and would have handed a caller asking for more less than the default; and the KV cache key now
carries the origin, since the rendered document holds absolute URLs that were previously shared
across hosts.

**`api.search.ts` gained route-level tests** (19), covering the validation, the limit clamp, and the
envelope that the CLI, the search page, and the MCP tools all consume.

**Task 14 is done** as `/docs/publishers` and `/docs/harness`, added to the docs sub-nav.

**One item was deliberately not done.** Replacing the CLI's hand-written `isActionable` with the
contract's `isCompatibilityActionable` needs `rootDir` and tsup bundling changes on the npm publish
path — a poor trade for a one-line predicate. Instead, `COMPATIBILITY_STATUSES` is now pinned in
`packages/contracts/src/compatibility.test.ts` with a comment naming the mirror, so adding a status
fails a test rather than silently leaving the CLI wrong. Tracked as #48.

**GitHub state:** #32 (Phase 0) is closed with an evidence comment, and the Phase 0 box in epic #31
is ticked.

### Slice 5 notes

The three Markdown surfaces read their rows through one gated module,
`apps/web/app/lib/catalog/public-catalog-index.ts`, which the Phase 0 boundary
guard now covers. `renderSkillMarkdown` takes `payloadGranted` as a required
input rather than inferring it from whether `content` is a string: an inference
would make a deliberate denial indistinguishable from a forgotten field. A
withheld body renders as an explicit note instead of a blank section.

Both `llms*.txt` routes report the catalog total from a `count(*)` query, not
the size of their own slice, so a truncated document cannot tell an agent the
catalog ends where the slice does. `llms.txt` renders 1000 listings and
`llms-full.txt` 200 bodies; both are KV-cached for 300s.

`skill-detail.tsx` was exactly at the 200-line ceiling after the Copy button, so
the risk banners moved to `components/risk-warning-banner.tsx`.

**Not done in this slice**, and tracked here so it is not mistaken for coverage:
the Markdown route is tested at the loader level only. There is no browser-level
test of `rel=alternate` hoisting or of the clipboard write.

## Acceptance criteria (from #33)

An agent can discover a package, inspect requirements, see evidence, and understand incompatibility
without scraping HTML. Browser WebMCP support is optional; normal web remains fully functional.

## Constraints carried from the project

- Max 200 LOC per file; split when exceeded.
- Markdown only under `plans/` or `docs/`.
- Back up D1 before any schema/migration change; **never** migrate remote D1 without asking.
- Compatibility has exactly one engine and one closed vocabulary of statuses and reason codes.
- `verified` only from evidence bound to the exact artifact digest.
- No secret in the repo; never log a credential or a signed artifact URL.
- Public/free listings keep returning `content`; the protected boundary from Phase 0 is not weakened.

## Risks

| Risk | Impact | Mitigation |
|---|---|---|
| Listing declaration becomes a second source of truth | Surfaces disagree later | One resolver owns precedence; documented removal in Phase 2; parity test asserts every surface uses it |
| `--compatible` silently hides undecidable rows | Agent believes the catalog is smaller than it is | Report `unknown` counts alongside matches; never filter without saying so |
| Migration drift (as in Phase 0) | New column absent from generated SQL | Back up D1, generate, read the SQL, assert the column exists before applying |
| Markdown route bypasses the payload boundary | Paid SKILL.md leaks as text | Route through the same resolver; assert with the existing guard test |
| MCP server becomes a second API implementation | Answers drift from HTTP | MCP tools are thin adapters over the same executor functions |

## Out of scope

- Phase 2 immutable registry, publishing CLI/CI (issue #34).
- Any commerce, entitlement, or payment runtime.
- Porting AgentKit's Go installer.
- Editing `plans/260225-0748-premium-skills-credits-marketplace`.
