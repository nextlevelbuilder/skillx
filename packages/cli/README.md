# skillx-sh

The Only Skill That Your AI Agent Needs.

CLI for the [SkillX.sh](https://skillx.sh) marketplace — search, discover, and use AI agent skills from your terminal.

## Install

```bash
npm install -g skillx-sh
```

Or run directly with npx:

```bash
npx skillx-sh search "code review"
```

## Commands

### `skillx search <query>`

Search the SkillX marketplace for skills.

```bash
skillx search "code review"
skillx search "database migration"
skillx search "ui ux" --use     # auto-pick top result and show details
```

### `skillx find <query>`

Interactive search — browse results and select a skill to view details.

```bash
skillx find "testing"
```

### `skillx use <identifier>`

Smart skill lookup — supports multiple identifier formats:

```bash
skillx use author/skill-name              # direct lookup by author and skill name
skillx use org/repo/skill-name            # lookup or auto-register from GitHub repo subfolder
skillx use org/repo                       # scan GitHub repo for all skills (discovers SKILL.md files)
skillx use slug                           # slug lookup (falls back to search on 404)
skillx use slug --exact                   # this slug only: no search, no register, aliases refused (exit 3)
skillx use "keyword query"                # search and auto-pick top result
skillx use author/skill-name --raw        # output raw content (for piping)
skillx use something --search             # force search mode
```

**How it works:**
- `author/skill` (two-part) → DB lookup by slug `author-skill`, fallback scan repo
- `org/repo/skill` (three-part) → DB lookup `org-skill`, fallback register from GitHub subfolder
- Single word → direct slug lookup, falls back to search if not found
- Multi-word or `--search` flag → searches and uses the top result
- `--exact` → the identifier verbatim as a catalog slug (`[a-z0-9][a-z0-9._-]*`, else exit 2). A miss, or a
  server answer for a different slug (an alias of a renamed skill), is `not_found` (exit 3); it never
  searches or registers. Use it when a specific slug was approved. Cannot be combined with `--search`.

**Security warnings:** Skills are scanned for suspicious content at registration. The CLI shows colored warnings:

- **Safe** — no issues detected (no banner)
- **Caution** — yellow banner, some patterns flagged
- **Danger** — red banner, suspicious content patterns detected

Use `--raw` to output content with boundary markers (for piping to other tools).

### `skillx import [owner/repo]`

Import skills from a GitHub repo into the SkillX marketplace (requires API key + repo ownership).
`skillx publish owner/repo` still runs it with a deprecation notice.

```bash
skillx import                          # auto-detect from git remote
skillx import owner/repo               # explicit repo
skillx import owner/repo --path .claude/skills/my-skill  # specific skill
skillx import owner/repo --scan        # scan all SKILL.md files
skillx import --dry-run                # preview without importing
```

### Release commands: `validate`, `pack`, `publish <dir>`, `promote`

Build and upload immutable, digest-pinned releases. With `--json` each prints one
envelope, `{"ok": true, "data": {...}}` or `{"ok": false, "error": {...}}`, and the
exit code follows it. See the [CLI reference](https://github.com/nextlevelbuilder/skillx/blob/main/docs/cli-reference.md).

> **Breaking:** `skillx release publish --json` (now an alias of `skillx publish <dir>`)
> used to print the bare release object, and failures only as text on stderr with exit
> code `1`. It now prints the envelope: read the result from `.data` and a failure from
> `.error`; the exit code tells the failure kind (`2` usage, `3` not found, `5` auth, `6` network).

### `skillx report <slug> <outcome>`

Report skill usage outcome (requires API key).

```bash
skillx report my-skill success
skillx report my-skill failure --model claude-sonnet-4 --duration 5000
```

### `skillx config`

Manage CLI configuration.

```bash
skillx config set-key          # set your API key
skillx config set-url <url>    # set custom API URL
skillx config show             # show current config
```

## Configuration

**API Key** — get yours at [skillx.sh/settings](https://skillx.sh/settings), then:

```bash
skillx config set-key
```

Or set via environment variable:

```bash
export SKILLX_API_KEY=your-key-here
```

## Links

- Website: [skillx.sh](https://skillx.sh)
- GitHub: [github.com/nextlevelbuilder/skillx](https://github.com/nextlevelbuilder/skillx)

## License

MIT
