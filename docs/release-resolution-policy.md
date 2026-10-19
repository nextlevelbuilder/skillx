# Release resolution policy

How a release's **state** (`published`, `yanked`, `quarantined`, `draft`) and
**channel** (`stable`, `beta`, `alpha`) decide what a reader gets. The read
API enforces the state rules; clients that choose a version (CLI, MCP tools,
kit lockfiles) follow the channel rules. Source of truth for the HTTP answers:
[Reading releases](api-reference.md#reading-releases-pinned-whole-tree-read-api).

## States

| State | Pinned by digest | By version | In the listing | New installs |
|-------|------------------|------------|----------------|--------------|
| `published` | served | served | yes | yes |
| `yanked` | served, `X-SkillX-Release-State: yanked` | `410 release_yanked` | yes, `state: yanked` | no |
| `quarantined` | `403 release_quarantined` | `403 release_quarantined` | hidden | no |
| `draft` | `404` | `404` | hidden | no |

- **Quarantine is per tree.** If any release with a given `releaseDigest` is
  quarantined, every package serving that digest answers `403`, and the
  listing hides those releases. Nothing installs or keeps resolving a
  quarantined tree, pinned or not.
- **Yank is per release.** A lockfile pinned to the digest keeps working
  (existing installs are not broken); resolving by version or choosing "the
  latest" must skip it.
- **A suspended or revoked publisher** answers `403 publisher_revoked` for all
  its releases, after the quarantine check.
- Unknown and unentitled (private) callers always get `404` first, so a state
  never leaks the existence of a private package.

## Channels

The channel is a label on a **published** release, moved with
`POST .../releases/{version}/promote` (audited). The signed manifest records
the channel at publish time; the listing, the version route and its
`X-SkillX-Release-Channel` header carry the current one.

The current channel is an **unsigned listing field**: no signature covers a
promote, so a client treats it as advisory, never as a trust input. It is
mutable, so the immutable digest-addressed routes (`/releases/{digest}/manifest`,
`/files/*`, `/artifact`, cached for a year) never send it; only the
short-lived version route carries the header. A signed channel statement is
tracked in #100.

A client resolving "latest on channel C" must:

1. consider only releases whose state is `published` (never `yanked`,
   `quarantined` or `draft`);
2. accept channels at least as stable as C: `stable` accepts `stable`; `beta`
   accepts `beta` and `stable`; `alpha` accepts all three;
3. pick the highest SemVer among them, with SemVer prerelease ordering;
4. pin the result by `releaseDigest`, and re-check the signed status
   (`skillx.release-status/v1`) before use.

The default channel is `stable`. A publisher credential (scoped key or OIDC
publish token) may only promote (`alpha` → `beta` → `stable`); demoting needs
the package owner or an admin.

## Operator review of quarantine

A quarantined release waits in `GET /api/v1/admin/quarantine`. An operator
records a decision with `POST .../releases/{version}/review`:

- **approve** (false positive): restores the state the release had before
  it was quarantined, read from the last two `release_state_audit` edges in
  write order (quarantining a yanked release writes `yanked` → `published` →
  `quarantined` in one batch), in one atomic, audited batch. A release
  quarantined while `published` goes `quarantined` → `yanked` → `published`
  and serves again everywhere. A release quarantined while `yanked` returns
  to `yanked` only: an approval never undoes a yank.
  To publish it anyway the admin sends
  `{"decision":"approve","restoreTo":"published"}` (`restoreTo` is
  `published` or `yanked`, valid only with `approve`). The approval answers
  `409 state_conflict` when the release was quarantined again after the
  operator read it.
- **reject** (confirmed): the release stays `quarantined`; the decision is
  recorded in `release_reviews`. Yanking it afterwards (`quarantined` →
  `yanked`) lifts the per-tree block for other packages but keeps this release
  out of every by-version and "latest" resolution.

Every decision and edge is in `release_state_audit` and `release_reviews`,
both append-only.
