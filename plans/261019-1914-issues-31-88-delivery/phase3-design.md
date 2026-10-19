# Phase 3 (#35) design: collections API, resolver, lockfile, installer, sync, local MCP

Status: accepted for implementation (2026-10-19). Scope: issue #35 checklist; #55 data
model is already on `main` and is reused, not re-implemented.

## What already exists and is reused

| Need | Existing piece | Decision |
|------|----------------|----------|
| Kit identity, immutable revisions, CAS, visibility, activation, lock | Personal kit API (`/api/v1/kits/*`, `kit-lock.ts`, `skillx.personal-kit-lock/v1`) | Reused as the **kit** source for the resolver. No new kit endpoints. |
| Pinned bytes | Release read API (`/api/v1/releases/:digest/{manifest,files/*}?version=&package=`) | The only byte source of the installer. |
| Manifest signatures | `verifyReleaseManifest` (contracts) | Client verifies with embedded/configured trusted keys, fail closed. |
| Overlay composition | `applyOverlay`, `memoryTree` (contracts) | Kit entries with an overlay are composed client side and must hash to `compositionDigest`. |
| Collections tables | `collections`, `collection_revisions` (migration 0009), `validateCollectionMember` | Reused; one additive migration. |
| Compatibility engine | `normalizeCompatibility` (contracts) | Used for package declarations found in the tree (`skillx.json`); kit `runtimes` gate the target. |

## 1. Collections web API (`SKILLX_COLLECTIONS_API`, 404 when off)

A collection is a recipe of package references (no overlays). Kits stay the
personal, overlay-capable unit; collections are the shareable list.

- `GET /api/v1/collections` (own list), `POST /api/v1/collections` (create; revision 1).
- `GET|PATCH|DELETE /api/v1/collections/:id` (metadata: `name`, `visibility`).
- `GET|POST /api/v1/collections/:id/revisions`, `GET .../revisions/:n` (full-replace revision).
- `POST /api/v1/collections/:id/members` (`add[]`, `remove[]` → new revision).
- `POST /api/v1/collections/:id/clone` (new private collection of the caller, lineage kept).
- Writes: owner via session or unscoped API key, `RELEASE_WRITE_LIMITER`; CAS by
  `expectedRevision` (409 `collection.revision_conflict`). Reads: private → owner only
  (others 404), `unlisted`/`public` → anyone.
- Revisions immutable: DB trigger aborts any UPDATE; `revision_digest` = sha256 of
  canonical `{members, config}`.
- `config` and members pass the shared **sync-leak scanner** (secrets, absolute paths) → 422.

Migration `0018_collection_revision_lineage.sql` (additive, rollback SQL in header):
`collections.cloned_from_revision_id`, `collection_revisions.revision_digest`, trigger
`collection_revisions_immutable`.

## 2. Lockfile `skillx.lock/v1` (contracts `install-lock.ts`)

Canonical JSON, no timestamps, no machine paths. `source` = kit revision, collection
revision or explicit packages; `runtimes` (kit runtime constraints); `packages[]` sorted by alias with
`package, version, releaseDigest, compositionDigest, overlayDigests, alias`. Validator +
`lockDigest`. `findSyncLeaks(value)` (also in contracts) is run before a lock is written,
read for sync, or a collection is stored.

## 3. Installer (CLI `src/lib/install/`)

- **Adapters**: `claude-code` → `$CLAUDE_CONFIG_DIR/skills` or `~/.claude/skills`;
  `codex` → `$CODEX_HOME/skills` or `~/.codex/skills`. Home from `os.homedir()`
  (HOME / USERPROFILE). State root `~/.skillx` (`SKILLX_HOME` override).
- **Resolve** → lock. **Plan** per package: `install | update | unchanged | remove | conflict`.
- **Fetch/verify**: signed manifest (trusted key, identity, version, digest), every file
  sha256 + size, tree digest; overlay applied and checked against `compositionDigest`.
  Content-addressed blob cache `~/.skillx/cache/blobs`.
- **Atomic apply**: stage in `<runtime dir>/.skillx-staging/` (sibling of `skills/`), journal, rename old → backup,
  stage → target, write receipt, drop backup, clear journal. Recovery at start of every
  run rolls forward (target present, receipt from journal) or back (restore backup).
- **Receipts** `~/.skillx/receipts/<adapter>/<alias>.json` (`skillx.install-receipt/v1`):
  package, digests, owned files with sha256, `requiredBy` owner keys (ref-count).
- **Ownership proof**: delete only receipt-listed files whose current sha256 matches.
  Modified/unknown files are kept and reported; a dir with unknown content is never replaced
  silently (conflict unless `--force` which still preserves unknown files).
- **Uninstall** removes one owner key; files go only when `requiredBy` becomes empty.

## 4. Commands

`skillx install <ref>` (`kit:@h/k[#revId]`, `collection:<id>[#n]`, `@p/s[@ver]`),
`skillx update [ref]`, `skillx uninstall <ref>`, `skillx list`, `skillx sync --locked
[--lock file] [--from kit:@h/k#rev]`, `skillx mcp`. All accept `--runtime`, `--json`;
install/update/sync accept `--dry-run`. `sync --locked` refuses drift: lock digest
mismatch vs remote revision, local modifications, any digest mismatch while fetching.

## 5. Local stdio MCP (`skillx mcp`)

Newline-delimited JSON-RPC 2.0 (MCP stdio): `initialize`, `tools/list`, `tools/call`,
`ping`. Tools: `inspect` (adapters, receipts), `plan` (ref, runtime → plan + `planDigest`),
`apply` (requires `confirm: true`; optional `planDigest` must match the fresh plan).

## Tests

Contracts (lock, leak scanner), web collections API over FakeD1, adapters/paths, verify
(tampered file, bad signature, wrong identity), apply/update/uninstall/ref-count/preserve,
interruption at every journal step then rerun converges, E2E machine A → kit revision on the
in-memory server → machine B identical digests, MCP confirm gate. Every test uses temp
HOME/USERPROFILE/CODEX_HOME/SKILLX_HOME.

## Out of scope / follow-ups

- Production registry public key is not in the repo: the CLI ships an empty trust store
  and reads `~/.skillx/trusted-keys.json` / `SKILLX_TRUSTED_KEYS`; embedding the
  production key needs the operator to publish it.
- Dependency graphs between packages: releases declare none today; resolver reports
  duplicates/alias collisions only.
