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
- Every write (create, store, rebase, resolve, activate, reject) requires
  that the caller still owns the kit's publisher `@handle` and that it is
  active. Otherwise the call returns 403 `kit.publisher_not_owned`.
- Transferring a kit to another owner is not supported.
- One request may spend at most 800 base reads (release lookups, manifest and
  blob reads), cached and shared across all phases of the request. Past that
  it fails with 422 `kit.request_too_large`; split the kit or the update.
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
  `@<handle>/<name>`. A kit has a `localId` only when its name is an AgentKit
  kit ID (`^[a-z0-9]+(-[a-z0-9]+)*$`, at most 64 bytes); otherwise 422
  `kit.invalid`.
- `exclude` is stored sorted and without duplicates, so equivalent documents
  have one revision digest.
- `parent` names a single kit revision. An array is refused with
  `kit.multi_parent`.
- Lineage is resolved child first, up to depth 4. Cycles are refused with
  `kit.cycle`.
- `skills` are sorted by identity, and each identity appears once.
- `mode` takes one of three values:
  - `extend` allows add ops only.
  - `override` keeps the base identity and can change anything.
  - `fork` requires a new identity under the kit handle and its own `alias`.
- Shared skills, those owned by AgentKit `kits/core` or shipped by more than
  one official kit, can be forked but never overlaid; an in-place overlay is
  refused with 422 `overlay.shared_alias` (AgentKit code). The guard fails
  closed: every skill whose name or directory alias starts with `ak-` or
  `ak:` (any case) is always shared, whether or not
  `SKILLX_SHARED_SKILL_ALIASES` is set. That variable (comma or whitespace
  separated identities) adds further shared skills to this default. Other
  `@agentkit/*` skills may be overlaid.
- A fork alias that starts with `ak-` or `ak:` is refused with 422
  `identity.reserved_alias` (AgentKit code).
- Kit names, identities and fork identities pass the full identity rules
  (pattern, 64-byte segments, portable segment rules).
- A parent kit owned by someone else is usable only through a revision that
  was authored `public` and activated by its owner. Drafts, proposals,
  rejected or quarantined revisions, and revisions authored while that kit
  was private are refused with `kit.base_unavailable`.
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

The lock owner key stays `personal:@<handle>/<name>` on SkillX. AgentKit keys
its local kits `personal:<name>` (`local/<name>`) and maps that to the SkillX
key when it publishes. The lock never contains machine paths or secrets.
`GET /lock` returns full documents only for kits the caller owns; a foreign
ancestor appears as `{kit, revisionDigest, foreign: true}`.

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
  - The key is looked up before the generation, so a retry after a lost answer
    replays (200, `replayed: true`) instead of failing as stale. A rebase key
    replays its stored revision or its recorded conflict only for the same
    request (`fromRevisionId`, `updates` and `includeForks`); other updates
    under the same key fail with 409 `kit.idempotency_conflict`.
- Storing a document equal to a live revision fails with 409
  `kit.revision_exists`. A rejected document may be stored again as a new
  revision.

## Endpoints

| Method and path (`/api/v1/kits/@h/n` + …) | Purpose |
|---|---|
| `GET` | Kit summary: `kit`, `localId`, `visibility`, `generation`, `latestRevisionNumber`, `effectiveRevision`, `openConflicts`. |
| `GET /revisions`, `GET /revisions/:id` | Revision list, or one revision with its `document`. |
| `POST /revisions` `{expectedGeneration, idempotencyKey, document}` | Store a `draft` revision with origin `manual`. 201 `{revision, generation, replayed, warnings}`. The first write creates the kit. |
| `POST /revisions/:id/reject` `{expectedGeneration}` | Reject a draft. Rejecting the effective revision fails with 409 `kit.revision_effective`. A session-derived proposal is refused with 403 `kit.interactive_approval_required`; it is rejected only through `POST /revisions/:id/review` in a web session. |
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

- `clean.untouched`, `clean.disjoint`, `clean.identical` (both sides made the
  same change)
- `conflict.same_hunk`, `conflict.renamed_or_deleted`, `conflict.added_both`
- `conflict.dependency_removed`, `conflict.dependency_missing`
- `conflict.script_changed`, `conflict.mode_changed`
- `conflict.capability_escalation`, `conflict.capability_downgrade`
- `conflict.exposure_changed`, `conflict.license_changed`
- `conflict.entitlement`, `conflict.ambiguous_provider`, `conflict.revoked_base`

The server adds the last three itself. Deleting a path that upstream changed
is `conflict.renamed_or_deleted`. The line diff is bounded at 1,000 edits
(AgentKit `MaxEditDistance`); a larger diff is recorded as
`conflict.same_hunk` with detail `diff_limit`. An entry with no overlay still
runs the semantic checks against upstream, so an added script, a dropped
`allowed-tools` restriction or another capability change blocks for review.
Any `conflict.*` finding fails closed:
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
revision cannot be activated (`kit.revision_unusable`). A quarantined
revision, effective or anywhere in the parent chain, makes `GET /lock` fail
with `kit.locked_incompatible` (reason `the revision is quarantined`, or the
quarantined parent) until the owner activates or rolls back to another
revision. A parent revision that is no longer available (missing, rejected,
or a foreign kit that is no longer public) fails the lock and activation the
same way, with the parent named in `error.reasons`; storing a new revision on
such a parent stays 422 `kit.base_unavailable`.

## Session-derived proposals

AgentKit can turn improvements learned in local sessions into a proposal. The
server accepts only the reviewed overlay, never raw session data, and the
proposal is always private. The owner reviews it, then activates it as usual.
Nothing activates implicitly.

- **Private kits only**: a proposal for a public kit fails with 409
  `proposal.private_kit_required` (fork it to a private kit first), and so
  does activating a session-derived revision once the kit has become public.
  The kit's visibility is never flipped by a proposal.
- **A human approves**: review (approve or reject) and activation of a
  session-derived revision need an interactive web session. An API key, such
  as the one AgentKit submits with, gets 403
  `kit.interactive_approval_required`. The proofs record `credential`.
- **No chaining on unreviewed proposals**: a from-revision that is `proposed`
  (or any session-derived revision that is not `reviewed`) fails with 409
  `kit.review_required`, and an unreviewed proposal is never usable as a
  parent kit revision. The same rule applies to the source of
  `preview-update` and `rebase` (and to the from revision when a conflict is
  resolved): an unreviewed proposal fails with 409 `kit.review_required`, a
  rejected or quarantined revision with 409 `kit.revision_unusable`.
- **Rejection only through review**: the generic `POST /revisions/:id/reject`
  refuses a proposal with 403 `kit.interactive_approval_required`; use
  `POST /revisions/:id/review` with `decision: "reject"` in a web session.

| Endpoint | Purpose |
|---|---|
| `POST /proposals/validate` `{expectedGeneration?, proposal}` | Every check below, including the server-side composition. Writes nothing. Returns `state`, `revisionDigest`, `compositionDigest`, `requiredPermissions`, `declaredPermissions`, `findings`, `changedPaths`, `generation` and `generationConflict`. |
| `POST /proposals` `{expectedGeneration, idempotencyKey, proposal}` | Stores a `session-derived` revision (201; an idempotent replay is 200), parented to `fromRevisionId`, in state `proposed`, or `quarantined` when the scan finds danger. Its review metadata is written in the same batch. |
| `GET /revisions/:id/proposal` | What the owner reviews: declared and required permissions, the evidence, finding codes and changed paths. |
| `POST /revisions/:id/review` `{expectedGeneration, decision, approval?}` | `reject` is final. `approve` needs `approval: {revisionDigest, permissions, visibility: "private", consent: true}`, where `permissions` are exactly the declared ones; otherwise 409 `kit.approval_required`. The revision becomes `reviewed`, with the proof in `approval_json` (kept on activation under `review`). Only a `proposed` revision can be reviewed. |
| `POST /revisions/:id/quarantine` `{reason?}` | Operators only (`X-Admin-Secret`); owners get 403 `kit.admin_only`. Quarantines any revision. |

### Envelope `skillx.kit-proposal/v1`

```json
{
  "schema": "skillx.kit-proposal/v1",
  "fromRevisionId": "pkr_…",
  "skill": { "identity": "@alpha/demo", "base": { "package": "@alpha/demo", "version": "1.0.0", "releaseDigest": "sha256:…" },
             "overlay": { "schema": "agentkit.skill-overlay/v1", "baseTreeDigest": "sha256:…", "ops": [] }, "compositionDigest": "sha256:…" },
  "declaredPermissions": ["allowed-tools:Bash"],
  "evidence": { "summary": "redacted, at most 2 KiB", "signals": { "sessions": 3 } },
  "visibility": "private"
}
```

The server copies the from revision's document. It replaces that one skill's
overlay and `compositionDigest`, sets the visibility to `private`, and
verifies the result like any revision.

- **Base and skill**: the skill must be in the from revision, and `base` must
  equal its pin exactly. Otherwise the proposal fails with
  `proposal.unknown_skill` or `proposal.base_mismatch`. A rebase moves a base;
  a proposal does not.
- **Raw session data**: a key that names a transcript, session, prompt,
  messages, conversation, environment, secret or token, working directory,
  history, tool output or logs, at any depth, fails with 422
  `proposal.forbidden_field`. The message names the key path, never its value.
  A key with a numeric value (an evidence signal) is allowed. Unknown fields
  are refused. An unknown top-level body field is 400 `invalid_request`.
- **Visibility**: anything but `"private"` fails with 422
  `proposal.private_only`.
- **Evidence**: optional. `summary` is at most 2048 UTF-8 bytes
  (`proposal.evidence_too_large`). `signals` holds at most 16 short lowercase
  names mapped to finite numbers.
- **Content scan**: covers what the new overlay introduces against the from
  composition (the lines a changed file gains, a new file whole), plus the
  evidence summary as `evidence/summary.md`. Lines kept from the base are not
  scanned, so a finding already in the base never refuses a proposal.
  - Fails with 422 `proposal.content_refused`, nothing stored: a secret
    (vendor token formats, `password=`/`passwd:` assignments, a YAML
    `password:` key whose new value sits on the following indented lines or in
    a `|` / `>` block scalar, even when the key line is kept from the base,
    Bearer tokens, URLs with `user:pass@`, JWTs, private key blocks,
    dotenv-style secret keys), binary content, text with a byte order mark
    (UTF-8/16/32), and every absolute local path, matched case-insensitively
    and also JSON-escaped (`\/`, `\\`) or percent-encoded (`%2F`, `%5C`,
    `%3A`): any drive-letter path, UNC shares (`\\host\share` and
    `//host/share`), `file:` and `smb:` URLs, a bare `/home`, `/Users`,
    `/root`, `/mnt`, `/media`, `/Volumes`, `/var/folders`, `/tmp`, `/private`
    or `/run/user`, and any other POSIX path of two or more segments (such as
    `/opt/...`, `/srv/...`, `/var/www/...`, `/workspaces/...`). Only these
    system paths are allowed: `/usr/`, `/bin/`, `/sbin/`, `/etc/`, `/proc/`,
    `/dev/null`, `/dev/stdin`, `/dev/stdout` and `/dev/stderr` (a `..` segment
    that climbs out of them is refused). Web URLs (`https://host/path`) are not
    local paths. `error.findings` lists `danger:<rule>:<path>` codes, never
    the matched text.
  - Any other `danger` finding, such as prompt injection or a
    `javascript:` URL, stores the proposal as `quarantined`. A quarantined
    proposal cannot be reviewed or activated.
- **Permissions**: the server derives the permissions a change needs from the
  two compositions:
  - `allowed-tools:<tool>` for a newly allowed tool, or `allowed-tools:*` when
    the restriction is dropped;
  - `hooks` for a new or changed `hooks` value;
  - `script:<path>` for a changed declared script or executable;
  - `executable:<path>` for a newly executable file.

  The declared permissions must equal the required ones. A missing one fails
  with 422 `proposal.undeclared_permission` (`error.required`,
  `error.missing`), an unneeded one with 422 `proposal.excess_permission`
  (`error.required`, `error.extra`). At most 64 permissions can be declared.
- **Nesting**: a request body nested deeper than 32 levels is 400
  `invalid_request`.

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

## Database (migrations `0015_personal_kits`, `0016_personal_kit_proposals`)

The migration is strictly additive. It creates four tables:

- `personal_kits`
- `personal_kit_revisions`
- `personal_kit_conflicts`
- `personal_kit_audit`

Their indexes enforce uniqueness of the kit name and, per kit, of the revision
number, the revision idempotency key and the rebase-conflict idempotency key.
Foreign keys are `ON DELETE RESTRICT`. Four triggers guard immutability
and the append-only audit. The rollback SQL is recorded in the migration
header.

Migration `0016_personal_kit_proposals` is also strictly additive. It creates
`personal_kit_proposals`, keyed by `revision_id`, which holds:

- the skill identity;
- the declared and required permissions;
- the optional evidence;
- the scan finding codes and changed paths.

It also adds an index on `kit_id`, two triggers that make the rows immutable
and undeletable, and two guard triggers on `personal_kit_revisions`:
`rejected` and `quarantined` are final (a rejected revision may still be
quarantined), `reviewed` moves only to `quarantined`, nothing returns to
`draft` or `proposed`, and a session-derived revision becomes `reviewed` only
with the owner's consent proof in `approval_json`, which is never cleared. It never holds transcripts, prompts, environment
or file content. Its rollback SQL is in its header.

## Error codes

| Code | Status |
|---|---|
| `kit.generation_conflict`, `kit.idempotency_conflict`, `kit.revision_exists`, `kit.composition_digest_mismatch`, `overlay.conflict`, `kit.approval_required`, `kit.review_required`, `kit.revision_unusable`, `kit.revision_effective`, `kit.discard_unconfirmed`, `kit.conflict_closed`, `kit.locked_incompatible`, `kit.not_a_proposal`, `proposal.private_kit_required` | 409 |
| `proposal.invalid`, `proposal.forbidden_field`, `proposal.private_only`, `proposal.evidence_too_large`, `proposal.unknown_skill`, `proposal.base_mismatch`, `proposal.content_refused` (`findings`), `proposal.undeclared_permission` (`required`, `missing`), `proposal.excess_permission` (`required`, `extra`) | 422 |
| `kit.admin_only`, `kit.interactive_approval_required` | 403 |
| `kit.invalid`, `overlay.invalid`, `schema.unsupported_version`, `kit.duplicate_identity`, `kit.mode_violation`, `kit.alias_collision`, `overlay.shared_alias`, `identity.reserved_alias`, `kit.request_too_large`, `kit.cycle`, `kit.multi_parent`, `kit.public_derivative_forbidden`, `kit.base_unavailable` (409 when resolving a conflict) | 422 |
| `kit.publisher_not_owned` | 403 |
| `invalid_request` (malformed body, ids or updates) | 400 |
| `not_found` (flag off, not the owner, unknown id) | 404 |
