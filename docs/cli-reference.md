# SkillX CLI Reference

**Package:** `skillx-sh` | **Binary:** `skillx` | **Version:** 0.3.0 | **Node:** >=20

---

## Configuration

**Config file:** `~/.config/skillx/config.json` (managed by `conf`)

**Priority:** env var > config file > default

| Key | Env Var | Default | Description |
|-----|---------|---------|-------------|
| `apiKey` | `SKILLX_API_KEY` | — | API key for authenticated requests |
| `baseUrl` | — | `https://skillx.sh` | API server URL |
| `deviceId` | — | auto-generated UUID | Anonymous tracking ID |

---

## Commands

### `skillx search <query>`

Search for skills in the SkillX marketplace.

**Arguments:**
- `<query>` (required) — Search query string

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-u, --use` | Auto-pick top result and show full details | `false` |
| `-c, --compatible <runtime>` | Only skills that declare support for this runtime; prints the filter report (`unknown` is not support) | — |
| `--json` | Machine-readable envelope | `false` |

**Examples:**
```bash
skillx search "code review"
skillx search "database migration"
skillx search "ui ux" --use
skillx search "lint" --compatible agentkit --json
```

**Output:** Table with SKILL, CATEGORY, RATING, DESCRIPTION columns.

---

### `skillx use <identifier>`

Smart skill lookup and display with multiple identifier formats.

**Arguments:**
- `<identifier>` (required) — Skill identifier in any format:
  - `slug` — Direct slug lookup (e.g., `awesome-skill`)
  - `author/skill` — Two-part identifier (e.g., `duy/skill-creator`)
  - `org/repo/skill` — Three-part GitHub reference (e.g., `duy/skillx-repo/skill-creator`)
  - `"keywords"` — Multi-word search query (e.g., `"data validation"`)

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-r, --raw` | Output raw content only (for piping to AI agents) | `false` |
| `-s, --search` | Force search mode regardless of identifier format | `false` |
| `--include-refs` | Include references in output | `false` |
| `--include-scripts` | Include scripts in output | `false` |
| `--json` | Envelope with the resolution (`kind`: `skill` or `repo` scan) and its `notes`; nothing found is `not_found` (exit `3`) | `false` |

**Resolution Logic:**
1. Spaces in query → search mode
2. `x/y` format → lookup slug `x-y`; fallback scan GitHub repo
3. `x/y/z` format → lookup slug `x-z`; fallback register from GitHub subfolder
4. Single word → slug lookup; fallback to search on 404
5. Multi-word or `--search` → search, auto-pick top result

**Risk Warnings:**
- **Safe** — no warning (default)
- **Caution** — yellow banner with advisory message
- **Danger** — red banner with suspicious pattern warning

**Raw Output Format:**
```
--- BEGIN EXTERNAL SKILL CONTENT (untrusted, risk: <label>) ---
<skill content>
--- REFERENCES --- (if --include-refs)
[type] title - url/filename
--- SCRIPTS --- (if --include-scripts)
name: command (url)
--- END EXTERNAL SKILL CONTENT ---
```

**Examples:**
```bash
skillx use awesome-skill
skillx use duy/skill-creator
skillx use duy/skillx-repo/skill-creator
skillx use "data validation"
skillx use awesome-skill --raw
skillx use awesome-skill --raw --include-refs --include-scripts
skillx use "testing" --search
```

---

### `skillx inspect <identifier>`

Show a skill's metadata, requirements, declared compatibility, and evidence.
`<identifier>` is a slug, `author/skill`, or `org/repo/skill`.

| Flag | Description |
|------|-------------|
| `--target <runtime[@version]>` | Also answer for one runtime |
| `--json` | Machine-readable envelope |

### `skillx check <identifier> --target <runtime[@version]>`

Gate on compatibility. Exit code is the answer: `0` when the target may be acted on
(`declared` or `verified`), `4` when it may not (`unknown`, `unsupported`, `blocked`),
`3` when the skill does not exist, `2` for invalid input. `--json` emits an envelope.

```bash
skillx check find-skills --target agentkit@1.4.0 && echo ok
```

---
### `skillx find <query>`

Interactive search — browse results and select a skill.

**Arguments:**
- `<query>` (required) — Search query string

**Options:**
| Flag | Description |
|------|-------------|
| `--json` | Emit the hits as an envelope (`{ query, results, count }`) without prompting |

**Flow:**
1. Displays numbered results: `[1]`, `[2]`, `[3]`...
2. Shows name, category, rating, description per result
3. Prompts: `Select a skill [1-N] or press Enter to cancel:`
4. Shows the selected skill exactly as `skillx use <slug>` would

**Examples:**
```bash
skillx find "testing"
skillx find "api integration" --json
```

---

### `skillx import [repo]`

Import (register) skills from a GitHub repo into the SkillX marketplace
(`POST /api/skills/register`). This was `skillx publish [repo]`;
`skillx publish <owner/repo|github-url>` still runs it, prints a deprecation
warning on stderr, and will be removed.

**Arguments:**
- `[repo]` (optional) — `owner/repo` or a GitHub URL. Auto-detects from git remote if omitted.

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <path>` | Specific skill subfolder path | — |
| `-s, --scan` | Scan entire repo for all SKILL.md files | `false` |
| `--dry-run` | Preview what would be imported without calling API | `false` |

**Resolution Logic:**
- No flags → auto-detect (root SKILL.md or scan all)
- `--path` → register specific skill folder
- `--scan` → find all SKILL.md files in repo
- `--dry-run` → show plan without executing

**Requires:** API key configured.

**Examples:**
```bash
skillx import                                     # auto-detect from git remote
skillx import owner/repo                          # explicit repo
skillx import owner/repo --path .claude/skills/my-skill
skillx import owner/repo --scan
skillx import --dry-run
```

---

### Release commands: `validate`, `pack`, `publish`, `promote`

These commands work on immutable, digest-pinned releases. With `--json` they
print exactly one envelope on stdout, `{"ok": true, "data": {...}}` or
`{"ok": false, "error": {"code", "message", "details"?, "hint"?}}`, and the
exit code follows it: `0` ok, `1` registry or unexpected error, `2` usage
(invalid input or a package the registry would reject), `3` not found, `5`
credentials missing or rejected, `6` network. `skillx release pack` and
`skillx release publish` remain as aliases of `skillx pack` and
`skillx publish <dir>`.

### `skillx validate [source]`

Checks a package without uploading: packs it exactly like `pack` (so a tree
the registry would reject fails here), requires a root `SKILL.md` with YAML
frontmatter carrying `name` and `description` (for `--kind skill`), and checks
the optional `--name`, `--release-version`, `--kind` and `--channel`. Lists
every problem in `details.problems` and exits `2`.

```bash
skillx validate skills/my-skill --name @acme/my-skill --release-version 1.2.0
```

### `skillx pack <source>`

Packs a package from git at an exact commit into a deterministic tar and
prints its `releaseDigest` (`agentkit.skill-tree/v1`). Only committed content
is packed: the tree comes from git objects, never the working tree, so mtimes,
umask, `core.autocrlf`, `core.fileMode` and uncommitted edits do not change
the digest (uncommitted edits are reported as a warning). Modes are normalized
to `100644`/`100755`; symlinks and submodules are rejected; OS noise files
(e.g. `.DS_Store`) are excluded and listed. Packing the same commit twice gives
the same `releaseDigest`, `artifactDigest` and bytes.

- `<source>`: a package directory (packs `HEAD`, path from the repo root) or a
  git ref used with `--path`.

| Flag | Description |
|------|-------------|
| `-o, --out <file>` | Output tar file (required) |
| `-p, --path <dir>` | Package directory inside the repository, for a git ref |
| `--json` | Print the result envelope |

```bash
skillx pack skills/my-skill -o my-skill.tar
skillx pack v1.2.0 --path skills/my-skill -o my-skill.tar
```

### `skillx publish <source>`

Packs like `pack`, then uploads to
`POST /api/v1/packages/@publisher/slug/releases`. Needs an API key scoped to
`releases:publish:@publisher` (`SKILLX_API_KEY` or the config), or `--oidc` in
GitHub Actions (trusted publishing). Releases are immutable: re-publishing
identical content is a no-op, different content for an existing version is
rejected. The command fails if the registry reports a `releaseDigest` (or, for
a new release, an `artifactDigest`) other than the one packed locally.

A source that is an existing path, or any use of `--name` /
`--release-version`, is a release. Only a GitHub URL or an `owner/repo` that is
not a local path runs the deprecated import (see `skillx import`).

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --name <@publisher/slug>` | Package name (required) | — |
| `--release-version <semver>` | Release version (required) | — |
| `-p, --path <dir>` | Package directory, for a git ref | — |
| `--channel <channel>` | `stable`, `beta` or `alpha` | `stable` |
| `--kind <kind>` | `skill`, `hook-pack` or `bundle` | `skill` |
| `--repo <https-url>` | Provenance repository URL | `origin` remote (https form) |
| `--script <path>` | Declare a packaged script (repeatable) | — |
| `--registry <url>` | Registry base URL; `https` only (`http` only for localhost) | configured base URL |
| `--idempotency-key <key>` | Sends `Idempotency-Key`: a retry with the same key and bytes replays the first answer; other bytes are refused | — |
| `--oidc` | Exchange the GitHub Actions OIDC token for a 15 minute publish token (needs `permissions: id-token: write` and a trusted publisher) | — |
| `--oidc-audience <aud>` | Audience requested for the OIDC token | `skillx` |
| `--json` | Print the result envelope | — |

```bash
SKILLX_API_KEY=sx_... skillx publish skills/my-skill --name @acme/my-skill --release-version 1.2.0
skillx publish HEAD --path skills/my-skill --name @acme/my-skill --release-version 1.2.0 --oidc --idempotency-key "$GITHUB_RUN_ID"
```

CI: `.github/workflows/publish-release.yml` (manual dispatch or
`workflow_call`, never on pull requests) runs the same command with a pinned
CLI version, in the `skillx-publish` environment, with its
`SKILLX_PUBLISH_KEY` secret. `.github/workflows/publish-agentkit-foundation.yml`
publishes an AgentKit foundation skill from `bestagentkits/agentkit` at a
pinned commit with OIDC (fallback `SKILLX_AGENTKIT_PUBLISH_KEY`): the kit
directory `kits/<kit>/skills/ak-<x>` becomes `@bestagentkits/<x>` at the
kit's `kit.yaml` version (see the deployment guide for why `@agentkit/*` stays
reserved).

### `skillx promote <@publisher/slug@version>`

Moves a published release to another channel (like an npm dist-tag): only the
current channel changes; bytes, digests and the signed manifest stay as
published. A publish credential (scoped key or `--oidc`) may only promote
(`alpha` → `beta` → `stable`); the package owner's account key may also
demote. Every attempt is audited.

| Flag | Description | Default |
|------|-------------|---------|
| `--to <channel>` | Target channel (required) | — |
| `--from <channel>` | Expected current channel; the move fails with `state_conflict` if it changed | current |
| `--reason <text>` | Reason stored in the audit log | — |
| `--registry <url>` | Registry base URL | configured base URL |
| `--oidc`, `--oidc-audience` | As for `publish` | — |
| `--json` | Print the result envelope | — |

```bash
skillx promote @acme/my-skill@1.2.0 --from beta --to stable --reason "soak passed"
```
---

### `skillx report <slug> <outcome>`

Report skill usage outcome (requires API key).

**Arguments:**
- `<slug>` (required) — Skill slug identifier
- `<outcome>` (required) — One of: `success`, `failure`, `partial`

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-m, --model <model>` | AI model used (e.g., `claude-sonnet-4`) | — |
| `-d, --duration <ms>` | Execution duration in milliseconds | — |
| `--json` | Machine-readable envelope | `false` |

**Requires:** API key configured. An invalid outcome or duration is a usage error (exit `2`)
checked before any request; a missing key is `auth_error` (exit `5`).

**Examples:**
```bash
skillx report my-skill success
skillx report my-skill failure --model claude-sonnet-4 --duration 5000
skillx report awesome-skill partial -m gpt-4 -d 2500
```

---

### `skillx config <subcommand>`

Manage CLI configuration.

All three subcommands accept `--json`. `config show --json` reports the key only as
`apiKey: { configured, source, masked }`; the plaintext key is never printed. Under
`set-key --json` the prompt goes to stderr, so stdout stays one envelope.

#### `skillx config set-key`

Set API key interactively.

```bash
skillx config set-key
# Prompts: Enter your API key:
# Get your key from: https://skillx.sh/settings/api
```

#### `skillx config set-url <url>`

Set custom API base URL.

```bash
skillx config set-url https://staging.skillx.sh
```

#### `skillx config show`

Display current configuration (API key masked).

```bash
skillx config show
# Output:
# Base URL: https://skillx.sh
# API Key: sk_prod_****..._xxxx
#   (loaded from ~/.config/skillx/config.json)
```

---

## Installer

`install`, `update`, `uninstall`, `list`, `sync` and `mcp` install signed,
pinned releases into an agent runtime's skills directory. Bytes come only from
the release read API; nothing is written until every file is verified.

### Sources

| Ref | Meaning |
|-----|---------|
| `kit:@handle/kit` | The active revision of a personal kit (overlays applied client side) |
| `kit:@handle/kit#rev_<uuid>` | That exact kit revision |
| `collection:col_<uuid>[#n]` | Revision `n` of a collection (default `latest`) |
| `@publisher/package[@version] ...` | Explicit packages (newest stable release when no version) |

### Runtimes (`--runtime`)

| Id | Skills directory |
|----|------------------|
| `claude-code` (default) | `$CLAUDE_CONFIG_DIR/skills`, else `~/.claude/skills` |
| `codex` | `$CODEX_HOME/skills`, else `~/.codex/skills` |

`~` is `USERPROFILE` on Windows and `HOME` elsewhere. Installer state lives in
`$SKILLX_HOME` (default `~/.skillx`).

### Commands

```bash
skillx install <refs...> [--runtime id] [--dry-run] [--force] [--lock file | --no-lock] [--json]
skillx update [refs...]  [--runtime id] [--force] [--lock file | --no-lock] [--json]
skillx uninstall <refs...> [--runtime id] [--lock file | --no-lock] [--json]
skillx list [--runtime id] [--json]
skillx sync --locked [--lock file | --from kit:@h/k#rev] [--runtime id] [--dry-run] [--force] [--json]
skillx mcp [--registry url]
```

All accept `--registry <url>` (default: the configured base URL). The API key
is sent only over `https`; plain `http` is refused except for `localhost`,
`127.0.0.1`, `[::1]` and `*.localhost`.

- **install** resolves the source to exact versions and digests, plans, then
  fetches, verifies and applies. It writes `skillx.lock.json` in the current
  directory unless `--no-lock`. A lock has one scope: `packages`, or one kit or
  collection. Package installs merge into a packages lock (by alias); a kit or
  collection install replaces its own lock. Installing into a lock of another
  scope is a `usage_error` (pass `--lock other.json` or `--no-lock`).
- **update** re-resolves installed sources (all, or those named) and applies the
  difference, then refreshes the lock file when its scope was updated.
- **uninstall** drops a kit, a collection, or one or more packages; each
  explicit package is its own source (`packages:@scope/name`), whether it was
  installed alone, with others, or by `sync --locked` from a packages lock.
  Each package is dropped from a packages lock file as soon as it is
  uninstalled, so a run that stops part way leaves the lock in step.
  Uninstalling a kit or a collection does not rewrite its lock file: the lock
  still describes that revision and can restore it with `sync --locked`. A
  skill another source still needs stays. Only regular files whose SHA-256 still matches the
  receipt are deleted; edited and unknown files are kept and reported. Links
  are never followed: a file reached through a symlink or junction is kept,
  and a skill directory that is itself a link is left alone.
- **sync --locked** restores exactly what a lock pins and refuses drift: a kit
  revision whose re-resolved lock digest differs, a collection revision whose
  content digest differs or whose members are not exactly the locked packages
  (at a member's pinned version or digest), a release whose digest differs, or
  local edits (unless `--force`).
- **--force** replaces locally edited skills (the old files are copied to
  `~/.skillx/backups/<runtime>/<alias>/<stamp>`) and installs into unowned
  directories, keeping unknown files. It never overrides a version conflict
  between two sources sharing a skill, and never installs over a skill path that
  is a link or a file (`unowned_directory`). A symlink or junction inside a
  skill directory is kept while nothing is rewritten (reinstalling the same
  version, `sync --locked`, another source adding itself as owner), but an
  install or update that would rewrite the directory is a `contains_link`
  conflict, also with `--force`: links are never copied or followed, so
  remove or replace them first.
- Aliases match `^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9_-])?$` (no trailing `.`) and
  are never a Windows device name (`con`, `prn`, `aux`, `nul`, `com1`-`com9`,
  `lpt1`-`lpt9`, with or without an extension).

### Verification and atomic apply

1. The manifest signature is checked against [trusted keys](#trusted-signing-keys);
   then package identity, version and `releaseDigest`.
2. Every file's size and SHA-256 must match the manifest (blob cache:
   `~/.skillx/cache/blobs`).
3. Kit overlays must match their `overlayDigests`; the composed tree must hash
   to `compositionDigest`.
4. `skillx.json` is fetched and checked first: a `compatible` block that blocks
   or omits the runtime, or a `skillx.json` that is not a JSON object, refuses
   the install (`incompatible`) before other files are downloaded. Every
   manifest and overlay path must be relative, with no `..`, `.`, empty, `\`
   or `:` segment; anything else is an `integrity_error`.
5. Apply per skill: stage in `<runtime dir>/.skillx-staging/`, then re-check
   the target against the receipt. A file created or edited since planning is
   a `conflict` (`local_modified`) and nothing is swapped. Write a journal
   (`~/.skillx/journal/<runtime>/<alias>.json`), move the old directory aside,
   rename stage into place, write the receipt, then retire the old directory:
   any file in it that neither the receipt, the new tree nor the backup
   accounts for (it appeared after the re-check) is copied to
   `~/.skillx/backups/<runtime>/<alias>/<stamp>` and reported as `displaced`
   before the directory is deleted; a link found there is removed itself (its
   target path is saved as `<path>.link`), never followed. A rename that
   Windows refuses (`EPERM`/`EBUSY`) is retried with backoff, then rolled back
   to the old tree and reported as a `conflict`. If something else has taken
   the skill path in the meantime, the old tree is not deleted: it is moved to
   `~/.skillx/backups/<runtime>/<alias>/<stamp>-previous-tree` and listed in
   the error's `parked` details. The move is a rename; across volumes (or
   when the rename stays refused) regular files are copied instead and links
   are recorded as `<path>.link`, never followed. An old tree left in staging without a journal
   is parked the same way. Each run first recovers interrupted journals (roll
   back while the stage exists, roll forward once it is in place) and drops
   `requiredBy` owners that `~/.skillx/owners/<runtime>.json` no longer
   records, removing (with ownership proof) a skill left with none, so a
   killed run converges on rerun. A missing owners file counts as "no owners":
   every receipted skill is then removed on the next run, keeping edited and
   unknown files. A corrupt owners file stops the run instead. One run at a
   time per `SKILLX_HOME`: `install.lock` holds the pid, is created
   atomically, and is taken over only when that process is gone.

### Trusted signing keys

Verification fails closed: with no trusted key every install is an
`integrity_error`. Keys (raw 32-byte Ed25519, base64) are merged from:

1. keys embedded in the CLI (none yet);
2. `~/.skillx/trusted-keys.json`: `{"keys": {"<keyId>": "<base64>"}}`;
3. `SKILLX_TRUSTED_KEYS=<keyId>=<base64>[,...]`.

`GET /api/v1/keys` lists the registry's public keys; confirm a key through a
second channel before trusting it.

### Lockfile `skillx.lock.json` (`skillx.lock/v1`)

Schema and validator: `packages/contracts/src/install-lock.ts`. It names what
to install, never where: no timestamps, machine paths or secrets.

```json
{
  "schema": "skillx.lock/v1",
  "resolver": "skillx.install-resolver/1",
  "source": { "kind": "kit", "kit": "@alpha/my-kit", "revisionId": "rev_…", "revisionNumber": 3, "revisionDigest": "sha256:…" },
  "runtimes": { "claude-code": ">=1.0.0" },
  "packages": [
    { "alias": "demo", "package": "@alpha/demo", "version": "1.0.0",
      "releaseDigest": "sha256:…", "compositionDigest": "sha256:…", "overlayDigests": ["sha256:…"] }
  ]
}
```

`source.kind` is `kit`, `collection` (`collectionId`, `revisionNumber`,
`revisionDigest`) or `packages`. Packages are sorted by alias; the lock digest
is the SHA-256 of its canonical JSON. The lock is scanned for secrets and
absolute paths (`findSyncLeaks`) before it is written and when it is read.

### Receipts and owners

`~/.skillx/receipts/<runtime>/<alias>.json` (`skillx.install-receipt/v1`):

```json
{
  "schema": "skillx.install-receipt/v1",
  "runtime": "claude-code", "alias": "demo", "package": "@alpha/demo", "version": "1.0.0",
  "releaseDigest": "sha256:…", "compositionDigest": "sha256:…", "overlayDigests": [],
  "files": [{ "path": "SKILL.md", "sha256": "…", "mode": "100644" }],
  "requiredBy": ["kit:@alpha/my-kit", "packages:@alpha/demo"],
  "installedAt": "2026-10-19T12:00:00.000Z"
}
```

`files` is the ownership proof. `requiredBy` is the ref-count: a skill is
removed only when its last owner uninstalls. `~/.skillx/owners/<runtime>.json`
(`skillx.install-owners/v1`) maps each owner key to its ref and current lock.
Receipts stay local; they are never uploaded.

### Local MCP server (`skillx mcp`)

Newline-delimited JSON-RPC 2.0 on stdio (`initialize`, `ping`, `tools/list`,
`tools/call`). Tools:

| Tool | Arguments | Effect |
|------|-----------|--------|
| `inspect` | `runtime?` | Read-only: skills directory, installed skills, sources |
| `plan` | `source` or `lock`, `runtime?` | Read-only: the plan and its `planDigest` |
| `apply` | as `plan`, plus `confirm: true` and `planDigest` (both required) | Applies the plan the caller saw; `usage_error` without either, `conflict` when the fresh plan differs from `planDigest` |

`force` is not accepted over MCP (`usage_error`); replacing local edits needs
the CLI's `--force`.

### Exit codes

Installer commands print a `{ok, data}` / `{ok, error}` envelope with `--json`.

| Code | Error | Meaning |
|------|-------|---------|
| 0 | — | Success |
| 1 | `integrity_error`, `api_error` | Verification failed (nothing written), or the API failed |
| 2 | `usage_error` | Bad ref, flag or lock |
| 3 | `not_found` | Package, release, kit or collection not found |
| 4 | `incompatible` | The release refuses the runtime |
| 5 | `auth_error` | Credentials missing or rejected |
| 6 | `network_error` | Registry unreachable |
| 8 | `conflict` | Local edits, unowned directory, a link inside a skill, shared version, drift, stale plan, or a path in use |

Code 7 is reserved for `rate_limited` in the shared CLI envelope.

---

## API Endpoints

| Command | Endpoint | Method | Auth Required |
|---------|----------|--------|---------------|
| `search` | `/api/search` | POST | No |
| `use` | `/api/skills/{slug}` | GET | No |
| `use` (register) | `/api/skills/register` | POST | Yes |
| `use` (install) | `/api/skills/{slug}/install` | POST | No |
| `find` | `/api/search` | POST | No |
| `find` (detail) | `/api/skills/{slug}` | GET | No |
| `import` (and deprecated `publish <owner/repo>`) | `/api/skills/register` | POST | Yes |
| `report` | `/api/report` | POST | Yes |
| `publish <dir>` (`release publish`) | `/api/v1/packages/@{publisher}/{slug}/releases` | POST | Yes (scoped key or `--oidc`) |
| `publish --oidc`, `promote --oidc` | `/api/v1/oidc/github/token` | POST | GitHub Actions OIDC token |
| `promote` | `/api/v1/packages/@{publisher}/{slug}/releases/{version}/promote` | POST | Yes (scoped key, OIDC, or owner key) |
| installer (fetch) | `/api/v1/packages/@{publisher}/{slug}/releases`, `/api/v1/releases/{digest}/manifest`, `/api/v1/releases/{digest}/files/*` | GET | No |
| installer (kit) | `/api/v1/kits/@{handle}/{kit}/lock[?revision=]` | GET | Yes (owner) |
| installer (collection) | `/api/v1/collections/{id}/revisions/{n\|latest}` | GET | Private: owner |

**Auth method:** `Authorization: Bearer <API_KEY>` header.

---

## JSON Output and Exit Codes

Every command except `publish` and `release *` (which print their own JSON) accepts
`--json` and then writes exactly one envelope to stdout; spinners and prompts never reach
stdout in that mode.

```json
{ "ok": true, "data": { "...": "command-specific payload" } }
{ "ok": false, "error": { "code": "not_found", "message": "...", "hint": "...", "details": {} } }
```

`hint` and `details` appear only when there is something concrete to say. The exit code
carries the same answer, so a script can branch without parsing either form:

| Exit | `error.code` | Meaning |
|------|--------------|---------|
| `0` | — | Success (`check`: the target may be acted on) |
| `1` | `api_error`, `unexpected_error` | The API failed without a better class, or a bug |
| `2` | `usage_error` | Invalid arguments or options, unknown command, missing argument |
| `3` | `not_found` | The skill or resource does not exist |
| `4` | — | `check` only: `ok: true` with `data.actionable: false`; the skill exists but the target may not act on it |
| `5` | `auth_error` | API key missing or rejected (`401`/`403`); the hint names `skillx config set-key` |
| `6` | `network_error` | The API could not be reached |
| `7` | `rate_limited` | The API answered `429`; retry later |

Exit `4` is an answer, not a failure, so its envelope is a success. Only flags before `--`
count: `skillx check -- --json` treats `--json` as an operand.

Parse failures follow the same table: with `--json` on the command line, an unknown option
prints a `usage_error` envelope and exits `2`. `--help`, `help <command>` and `--version` exit
`0`; a bare `skillx` or a group without its subcommand (`skillx config`) prints help and exits
`2`. The
implementation lives in [`output.ts`](../packages/cli/src/lib/output.ts) and
[`run-command.ts`](../packages/cli/src/lib/run-command.ts); a command wraps its work in
`runCommand` and throws `CliError` for failures it classifies itself.

## GoClaw / AI Agent Integration

Use `--raw` flag for machine-readable output:

```bash
# Pipe skill content to AI agent
skillx use my-skill --raw --include-refs --include-scripts

# Search and auto-pick top result
skillx search "code review" --use
```

Raw output uses boundary markers for safe parsing:
```
--- BEGIN EXTERNAL SKILL CONTENT (untrusted, risk: safe) ---
...content...
--- END EXTERNAL SKILL CONTENT ---
```
