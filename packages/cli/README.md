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
skillx use slug                           # exact slug lookup (fallback to search on 404)
skillx use "keyword query"                # search and auto-pick top result
skillx use author/skill-name --raw        # output raw content (for piping)
skillx use something --search             # force search mode
```

**How it works:**
- `author/skill` (two-part) → DB lookup by slug `author-skill`, fallback scan repo
- `org/repo/skill` (three-part) → DB lookup `org-skill`, fallback register from GitHub subfolder
- Single word → direct slug lookup, falls back to search if not found
- Multi-word or `--search` flag → searches and uses the top result

**Security warnings:** Skills are scanned for suspicious content at registration. The CLI shows colored warnings:

- **Safe** — no issues detected (no banner)
- **Caution** — yellow banner, some patterns flagged
- **Danger** — red banner, suspicious content patterns detected

Use `--raw` to output content with boundary markers (for piping to other tools).

### `skillx publish [owner/repo]`

Publish skills from a GitHub repo to the SkillX marketplace (requires API key + repo ownership).

```bash
skillx publish                          # auto-detect from git remote
skillx publish owner/repo               # explicit repo
skillx publish owner/repo --path .claude/skills/my-skill  # specific skill
skillx publish owner/repo --scan        # scan all SKILL.md files
skillx publish --dry-run                # preview without publishing
```

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
