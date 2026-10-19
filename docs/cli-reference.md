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

### `skillx publish [repo]`

Publish skills from a GitHub repo to the SkillX marketplace.

**Arguments:**
- `[repo]` (optional) — GitHub repo in `owner/repo` format. Auto-detects from git remote if omitted.

**Options:**
| Flag | Description | Default |
|------|-------------|---------|
| `-p, --path <path>` | Specific skill subfolder path | — |
| `-s, --scan` | Scan entire repo for all SKILL.md files | `false` |
| `--dry-run` | Preview what would be published without calling API | `false` |

**Resolution Logic:**
- No flags → auto-detect (root SKILL.md or scan all)
- `--path` → register specific skill folder
- `--scan` → find all SKILL.md files in repo
- `--dry-run` → show plan without executing

**Requires:** API key configured.

**Examples:**
```bash
skillx publish                                     # auto-detect from git remote
skillx publish owner/repo                          # explicit repo
skillx publish owner/repo --path .claude/skills/my-skill
skillx publish owner/repo --scan
skillx publish --dry-run
```

---

### `skillx release pack <source>`

Packs a package from git at an exact commit into a deterministic tar and
prints its `releaseDigest` (`agentkit.skill-tree/v1`). Only committed content
is packed: the tree comes from git objects, never the working tree, so mtimes,
umask, `core.autocrlf`, `core.fileMode` and uncommitted edits do not change
the digest (uncommitted edits are reported as a warning). Modes are normalized
to `100644`/`100755`; symlinks and submodules are rejected; OS noise files
(e.g. `.DS_Store`) are excluded and listed.

- `<source>`: a package directory (packs `HEAD`, path from the repo root) or a
  git ref used with `--path`.

| Flag | Description |
|------|-------------|
| `-o, --out <file>` | Output tar file (required) |
| `-p, --path <dir>` | Package directory inside the repository, for a git ref |
| `--json` | Print the result as JSON |

```bash
skillx release pack skills/my-skill -o my-skill.tar
skillx release pack v1.2.0 --path skills/my-skill -o my-skill.tar
```

### `skillx release publish <source>`

Packs like `release pack`, then uploads to
`POST /api/v1/packages/@publisher/slug/releases`. Needs an API key scoped to
`releases:publish:@publisher` (`SKILLX_API_KEY` or the config). Releases are
immutable: re-publishing identical content is a no-op, different content for
an existing version is rejected. The command fails if the registry reports a
`releaseDigest` (or, for a new release, an `artifactDigest`) other than the
one packed locally.

| Flag | Description | Default |
|------|-------------|---------|
| `-n, --name <@publisher/slug>` | Package name (required) | — |
| `--release-version <semver>` | Release version (required) | — |
| `-p, --path <dir>` | Package directory, for a git ref | — |
| `--channel <channel>` | `stable`, `beta` or `alpha` | `stable` |
| `--kind <kind>` | `skill`, `hook-pack` or `bundle` | `skill` |
| `--repo <https-url>` | Provenance repository URL | `origin` remote (https form) |
| `--script <path>` | Declare a packaged script (repeatable) | — |
| `--kit-origin <origin>` | Publish an `@agentkit/*` kit release (`remote-signed` or `local-dev`), signed as `skillx.release/v2`; needs a `releases:publish:@agentkit` key | — |
| `--registry <url>` | Registry base URL; `https` only (`http` only for localhost) | configured base URL |
| `--json` | Print the result as JSON | — |

```bash
SKILLX_API_KEY=sx_... skillx release publish skills/my-skill --name @acme/my-skill --release-version 1.2.0
```

CI: `.github/workflows/publish-release.yml` (manual dispatch or
`workflow_call`, never on pull requests) runs the same command with a pinned
CLI version, in the `skillx-publish` environment, with its
`SKILLX_PUBLISH_KEY` secret.

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
| `publish` | `/api/skills/register` | POST | Yes |
| `report` | `/api/report` | POST | Yes |
| `release publish` | `/api/v1/packages/@{publisher}/{slug}/releases` | POST | Yes (scoped key) |

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
