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

**Options:** None

**Flow:**
1. Displays numbered results: `[1]`, `[2]`, `[3]`...
2. Shows name, category, rating, description per result
3. Prompts: `Select a skill [1-N] or press Enter to cancel:`
4. Fetches and displays full skill details with content preview (30 lines max)

**Examples:**
```bash
skillx find "testing"
skillx find "api integration"
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

**Requires:** API key configured.

**Examples:**
```bash
skillx report my-skill success
skillx report my-skill failure --model claude-sonnet-4 --duration 5000
skillx report awesome-skill partial -m gpt-4 -d 2500
```

---

### `skillx config <subcommand>`

Manage CLI configuration.

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

**Auth method:** `Authorization: Bearer <API_KEY>` header.

---

## Error Handling

| Scenario | Message |
|----------|---------|
| 401 Unauthorized | "Authentication failed. Check your API key." |
| 403 Forbidden | "Permission denied. Must be collaborator/owner of repo." |
| 404 Not Found | "Skill not found: `<slug>`" / "No SKILL.md found in repository." |
| 429 Rate Limited | "Rate limited. Please try again later." |
| Invalid outcome | "Invalid outcome. Must be: success, failure, or partial" |
| Missing API key | "API key required. Run `skillx config set-key`" |
| Invalid URL | "Invalid URL format. Example: https://api.skillx.sh" |

All errors exit with code 1.

---

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
