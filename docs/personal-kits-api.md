# Personal Kits API

Personal kits are cloud-hosted, owner-private compositions of immutable
foundation releases (for example AgentKit skills) plus the user's own
overlays. SkillX stores immutable revisions, verifies every composition
against the pinned release bytes, computes foundation rebases
deterministically, and records conflicts for the user to resolve. SkillX
never merges content on its own judgement, and no revision becomes effective
without an explicit user approval.

- Mount: `/api/v1/kits/@{handle}/{name}[/...]`. Source:
  `apps/web/app/routes/api.v1.kits.ts` and `apps/web/app/lib/personal-kits/`.
- Feature flag: `SKILLX_PERSONAL_KITS_API` (`"1"` enables it). While it is off,
  every path returns the JSON 404. Reading base releases also needs the release
  stack (`SKILLX_RELEASES_API`, D1, R2).
- Wire formats: `packages/contracts/src/personal-kit/`. The golden vector
  `packages/contracts/src/fixtures/personal-kit-golden.json` must re-derive byte for byte on both the
  SkillX (TypeScript) and AgentKit (Go) sides.

## Authentication, ownership and limits

- Callers authenticate with a session or an **unscoped** API key. Scoped keys,
  such as `releases:publish:@h`, get 401. The admin secret is not accepted
  (404).
- A kit is visible only to its owner. Every other caller gets the JSON 404,
  never 403, so a kit's existence is not revealed.
- Creating `@handle/name` requires that the caller owns the publisher `@handle`.
  Otherwise the call returns 403 `kit.publisher_not_owned`.
- Reads use the release read limiter. Writes use the write limiter, which
  fails closed.
- Request bodies are capped at 1 MiB + 64 KiB. Documents are capped at 1 MiB
  and 128 skills.
- Every response is JSON with `Cache-Control: no-store`. Errors use
  `{ "error": { "code", "message" } }`.

## Documents

### Overlay: `agentkit.skill-overlay/v1` (AgentKit-owned)

```json
{ "schema": "agentkit.skill-overlay/v1", "baseTreeDigest": "sha256:…", "ops": [
  { "op": "patch",   "path": "SKILL.md", "expectSha256": "<hex>", "patch": "@@ -5,5 +5,5 @@\n …" },
  { "op": "add",     "path": "notes.md", "contentBase64": "…", "mode": "100644" },
  { "op": "replace", "path": "x.md", "expectSha256": "<hex>", "contentBase64": "…" },
  { "op": "delete",  "path": "old.md", "expectSha256": "<hex>" } ] }
```

- `ops` are sorted by the raw UTF-8 bytes of their path, with one op per path.
  Unknown fields are refused.
- `baseTreeDigest` must equal the pinned base `releaseDigest`, which is the
  `agentkit.skill-tree/v1` tree digest.
- `patch` applies to text files only and must be an exact unified diff.
- A `replace` without `mode` keeps the mode of the base file.

### Revision document: `skillx.personal-kit/v1`

```json
{ "schema": "skillx.personal-kit/v1", "kit": "@alpha/my-kit", "localId": "local/my-kit",
  "visibility": "private", "parent": { "kit": "@alpha/base-kit", "revisionDigest": "sha256:…" },
  "skills": [ { "identity": "@alpha/demo", "mode": "override",
    "base": { "package": "@alpha/demo", "version": "1.0.0", "releaseDigest": "sha256:…" },
    "overlay": { … }, "compositionDigest": "sha256:…", "alias": "demo", "exposure": "…" } ],
  "exclude": [], "profile": "…", "runtimes": { "claude": ">=1.0.0" } }
```

- `localId` is the offline id `local/<name>`. On publish it maps to
  `@<handle>/<name>`.
- `parent` names a single kit revision. An array is refused with
  `kit.multi_parent`.
- Lineage is resolved child first, up to depth 4. Cycles are refused with
  `kit.cycle`.
- `skills` are sorted by identity, and each identity appears once.
- `mode` takes one of three values:
  - `extend` allows add ops only.
  - `override` keeps the base identity and can change anything.
  - `fork` requires a new identity under the kit handle and its own `alias`.
- Skills whose identity starts with `@agentkit/` are shared official aliases.
  They can be forked under a new alias (which must not start with `ak-`/`ak:`)
  but never overlaid; an overlay is refused with `kit.shared_alias_overlay`.
- `compositionDigest` is the tree digest of the base with the overlay applied.
  The server recomputes it from the pinned release bytes and refuses a
  mismatch with 409 `kit.composition_digest_mismatch`.
- The revision digest is the SHA-256 of the canonical JSON bytes of the
  validated document.

### Lock: `skillx.personal-kit-lock/v1`

The lock is derived on read from immutable documents, so equal revisions
always yield equal lock bytes. It contains:

- `resolver`, `kit`, `localId`, `revisionId`, `revisionNumber` and
  `revisionDigest`;
- `profile` and `runtimes`;
- one entry per exposed skill: `identity`, `alias`, `mode`, `exposure`,
  `package`, `version`, `releaseDigest`, `overlayDigests` (one per lineage
  layer), `compositionDigest`, and `owner: "personal:@h/k"`.

The lock never contains machine paths or secrets.

## Concurrency and idempotency

Every kit has a `generation`. `GET` returns it, with an `ETag` of `"g<n>"`.

- Every write carries `expectedGeneration`. A stale value fails with 409
  `kit.generation_conflict` and writes nothing. The kit row, the revision or
  conflict, and the audit row commit in one D1 batch under the generation
  guard.
- Creating writes (`revisions`, `rebase`, `conflicts/:id/resolve`) also carry an
  `idempotencyKey` (`[A-Za-z0-9._:-]{8,128}`).
  - Replaying the same key with the same document returns the stored revision
    with 200 and `replayed: true`.
  - Reusing the key with a different document fails with 409
    `kit.idempotency_conflict`.
- Storing a document equal to an existing revision fails with 409
  `kit.revision_exists`.

## Endpoints

| Method and path (`/api/v1/kits/@h/n` + …) | Purpose |
|---|---|
| `GET` | Kit summary: `kit`, `localId`, `visibility`, `generation`, `latestRevisionNumber`, `effectiveRevision`, `openConflicts`. |
| `GET /revisions`, `GET /revisions/:id` | Revision list, or one revision with its `document`. |
| `POST /revisions` `{expectedGeneration, idempotencyKey, document}` | Store a `draft` revision with origin `manual`. 201 `{revision, generation, replayed, warnings}`. The first write creates the kit. |
| `POST /revisions/:id/reject` `{expectedGeneration}` | Reject a draft or proposal. Rejecting the effective revision fails with 409 `kit.revision_effective`. |
| `GET /diff?from=&to=` | Read-only structural diff: changed document fields, and added, removed and changed entries with their overlay paths. |
| `POST /preview-update` `{updates:[{package,version}], fromRevisionId?, includeForks?}` | Rebase report only. Writes nothing. |
| `POST /rebase` `{expectedGeneration, idempotencyKey, updates, fromRevisionId?, includeForks?}` | Clean: 201, a `draft` revision with origin `rebase` (never activated). Otherwise: 200 `{status:"needs-review", conflictId, report}`. A newer conflict supersedes older open ones. |
| `GET /conflicts`, `GET /conflicts/:id` | Conflict records: the report, the resolution and `reevalRequired`. |
| `POST /conflicts/:id/resolve` `{expectedGeneration, idempotencyKey, approvedBy:"user", decisions, agentSuggestion?}` | The user's decision becomes a `draft` revision with origin `resolution`. |
| `POST /activate`, `POST /rollback` `{expectedGeneration, revisionId, approval:{revisionDigest}}` | Make a revision effective. `rollback` re-activates an earlier effective revision. |
| `GET /lock[?revision=<id>]` | The lock and lineage documents of the effective (or named) revision. |

The default sources are the effective revision for `fromRevisionId` and for
the lock.

### Rebase

Rebase is a deterministic three-way merge. For each entry whose base package
appears in `updates`, it takes:

- B0, the pinned base;
- U0, the user's overlay;
- B1, the new release resolved by version (a yanked version is never a target).

Forks are skipped unless `includeForks: true` is set.

The report (`skillx.kit-rebase-report/v1`) lists, per entry, `from`, `to`,
`status` (`clean | needs-review | unchanged | skipped`) and its findings.
Each finding is a `{category, path, detail}` record using the AgentKit
category strings:

- `clean.untouched`, `clean.disjoint`
- `conflict.same_hunk`, `conflict.renamed_or_deleted`, `conflict.added_both`
- `conflict.dependency_removed`, `conflict.dependency_missing`
- `conflict.script_changed`, `conflict.mode_changed`
- `conflict.capability_escalation`, `conflict.capability_downgrade`
- `conflict.exposure_changed`, `conflict.license_changed`
- `conflict.entitlement`, `conflict.ambiguous_provider`, `conflict.revoked_base`

The server adds the last three itself. Any `conflict.*` finding fails closed:
nothing becomes effective, and the old effective revision keeps working.

Reports and conflict records hold categories, paths and digests, never file
content. The stored conflict keeps the user's clean candidate overlays so the
resolution can reuse them.

### Conflict resolution

There is one decision per `needs-review` entry. `approvedBy` must be
`"user"`, otherwise the call fails with 409 `kit.approval_required`.

- `keep-old`: the entry stays on its current base, with its overlay unchanged.
- `use-upstream`: the entry moves to the new base with no overlay. It requires
  `discardUserDelta: true`, otherwise 409 `kit.discard_unconfirmed`.
- `edit-overlay`: the entry moves to the new base with the supplied `overlay`
  and `compositionDigest`. The server verifies both against the bytes.
- `fork`: the entry follows upstream unmodified, and the user's composition
  moves to `forkIdentity` with its own `alias`.

An optional `agentSuggestion` (16 KiB at most) is stored in the resolution
record (`agentkit.skill-overlay-resolution/v1`) with
`agentSuggestionApplied: false`. It is never applied. Any choice other than
`keep-old` sets `reevalRequired`. A conflict that is no longer open fails
with 409 `kit.conflict_closed`.

When every decision is `keep-old`, the result equals the source revision.
The conflict then closes onto that revision (200), and no new revision is
written.

### Activation, rollback and lock

Activation requires `approval.revisionDigest` to equal the exact revision
digest, otherwise 409 `kit.approval_required`. Before moving
`effective_revision_id`, it re-checks every pinned base of the lineage:

- A base that is quarantined, revoked, no longer entitled or removed blocks
  activation with 409 `kit.locked_incompatible`, listing each pin in
  `error.reasons`.
- A yanked base still works (pins keep working) and is reported in
  `warnings`.

`GET /lock` runs the same check, so a second machine either restores the
identical lock or gets the explicit reason. A `proposed` revision must be
reviewed before activation (`kit.review_required`). A rejected or quarantined
revision cannot be activated (`kit.revision_unusable`).

## Hard invariants

- **Immutability**: revision content columns cannot be updated, and revisions
  are never deleted (D1 triggers). The audit log (`personal_kit_audit`) is
  append-only.
- **Privacy**: kits are private by default. A `public` kit is refused with 422
  `kit.public_derivative_forbidden` when any base, or the parent kit, is
  private or paid. Overlays are stored only for their owner.
- **Entitlement**: bases load through the pinned-read access rules for the
  owner. The owner must be able to read the release (public, or entitled), its
  publisher must be active, and no release of its tree may be quarantined.
  Every blob is checked against the manifest SHA-256.
- **Pins**: a pin is the exact package, version and tree digest. Another
  package that ships the same tree never answers for it.
- **No AI auto-accept**: only the deterministic engine and the user's explicit
  decisions write revisions. Nothing activates implicitly.

## Database (migration `0015_personal_kits`)

The migration is strictly additive. It creates four tables:

- `personal_kits`
- `personal_kit_revisions`
- `personal_kit_conflicts`
- `personal_kit_audit`

Their indexes enforce uniqueness of the kit name and, per kit, of the revision
number, idempotency key and revision digest. Four triggers guard immutability
and the append-only audit. The rollback SQL is recorded in the migration
header.

## Error codes

| Code | Status |
|---|---|
| `kit.generation_conflict`, `kit.idempotency_conflict`, `kit.revision_exists`, `kit.composition_digest_mismatch`, `overlay.conflict`, `kit.approval_required`, `kit.review_required`, `kit.revision_unusable`, `kit.revision_effective`, `kit.discard_unconfirmed`, `kit.conflict_closed`, `kit.locked_incompatible` | 409 |
| `kit.invalid`, `overlay.invalid`, `schema.unsupported_version`, `kit.duplicate_identity`, `kit.mode_violation`, `kit.alias_collision`, `kit.shared_alias_overlay`, `kit.cycle`, `kit.multi_parent`, `kit.public_derivative_forbidden`, `kit.base_unavailable` (409 when resolving a conflict) | 422 |
| `kit.publisher_not_owned` | 403 |
| `invalid_request` (malformed body, ids or updates) | 400 |
| `not_found` (flag off, not the owner, unknown id) | 404 |
