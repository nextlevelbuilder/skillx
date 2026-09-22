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
| 6 | Remote MCP server + tools, WebMCP read tools | 6, 7, 8 | not started |
| 7 | Parity tests across API/CLI/MCP/Markdown | 15 | not started |

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
