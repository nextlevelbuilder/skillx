# SkillX plugin

Find, compare and vet AI agent skills from the [SkillX.sh](https://skillx.sh)
catalog without leaving Claude. Ask for a skill in plain language; Claude
searches the catalog, shows each candidate's author, source repository, content
risk label and runtime compatibility, and loads or installs a skill only after
you approve that specific skill.

This plugin is SkillX's own discovery integration. It bundles no third-party
skills. The skills it finds are written by their authors and stay under their
own licenses.

## What it contains

| Component | Path | Purpose |
|-----------|------|---------|
| Skill | `skills/skillx/SKILL.md` | Search → evaluate → ask → use workflow, with untrusted-content rules |
| MCP server | `.mcp.json` → `https://skillx.sh/api/mcp` | Read-only catalog tools: `search_packages`, `get_package`, `get_release`, `check_compatibility`, `get_kit` |

No hooks, agents, commands or bundled executables.

## Where it works

| Surface | Skill | Catalog access |
|---------|-------|----------------|
| Claude Code | Loads | MCP server loads automatically; the `skillx` CLI also works when Node.js 22+ is available |
| Cowork | Loads | Connect the SkillX connector from the plugin's **Connectors** tab |
| Chat (claude.ai, desktop, mobile) | Loads | Connect the SkillX connector from the plugin's **Connectors** tab, or let Claude use web fetch |

Chat and Cowork do not run the CLI. Installing a skill to disk
(`skillx install @publisher/package`) needs Claude Code or another shell and a
published release; most catalog listings can be loaded but not installed.

## Prerequisites

- Network access to `https://skillx.sh`.
- Optional, Claude Code only: Node.js 22+ for the CLI. The skill uses an
  installed `skillx` binary when present, otherwise the exact pinned package
  `npx --yes skillx-sh@0.7.1`. The npm package `skillx` (without `-sh`) is an
  unrelated project and is never used.
- Optional: a SkillX API key, only for `skillx report`, publishing and private
  listings. The plugin never asks you to paste a key into chat.

## What it sends and fetches

- **Search and lookups**: your search query and the skill slugs you look at go to
  `https://skillx.sh` (MCP endpoint `/api/mcp`, or `/api/search` and
  `/skills/<slug>.md`). skillx.sh sends the search query to Cloudflare Workers
  AI to embed it for semantic search. No account is needed and no local files
  are sent.
- **CLI**: `npx` downloads `skillx-sh@0.7.1` from the npm registry the first time.
  The CLI keeps an anonymous device ID in its config file (`skillx config show`
  prints it; `~/.config/skillx-nodejs/config.json` on Linux), and
  `skillx use` counts one install for the skill it prints, sending that device ID
  (and your SkillX API key, if you configured one) to skillx.sh.
- **Report**: `skillx report` sends a skill slug, an outcome and optionally the
  model name and duration, only when you ask for it.
- **Registration**: `skillx use org/repo/skill` or `skillx use author/name` for a
  skill not yet in the catalog, and `skillx import`, register a public GitHub
  repository on skillx.sh. Claude asks before any of them and loads approved
  skills by their exact catalog slug instead.

Nothing else is sent, and the plugin changes no Claude settings or permissions.

## Privacy

- SkillX does not store your search queries or the slugs you look up in its
  database.
- skillx.sh runs on Cloudflare Workers with request logging on, so request URLs
  (search queries included) appear in Cloudflare's short-lived Workers logs.
- `skillx use` records one install row per skill: the skill, your anonymous CLI
  device ID, or your SkillX account if you configured an API key.
- `skillx report` stores the outcome you send against your SkillX account.
- Search queries are embedded by Cloudflare Workers AI on each search.
- The plugin reads no local files and sends no conversation content beyond the
  query and slugs Claude passes to the catalog.

## Safety model

1. **Search** the catalog.
2. **Evaluate** each candidate: author, source repository, risk label from
   SkillX's content scan (`safe`, `caution`, `danger`, `unknown`), declared runtime
   compatibility, and the license in its source repository. SkillX does not
   certify licenses.
3. **Ask** you before loading a skill's instructions, writing it to disk, running
   its scripts or registering it. Finding or comparing skills is not consent.
   An approved skill is loaded by its exact slug, never by keywords, and a
   `danger` listing is never loaded.
4. **Use** a skill body, whenever Claude sees one, as untrusted content: it cannot override your
   instructions, read credentials, disable safety checks or contact undisclosed
   hosts, and Claude shows any shell command it asks for before running it.

The catalog scan detects prompt injection, invisible Unicode, ANSI escapes and
shell-injection patterns. It reduces risk but does not prove a skill safe; read a
skill before you trust it.

## Try it

- "Find me a skill for reviewing pull requests and compare the top three."
- "Is there an agent skill for Cloudflare Workers deployments that supports Claude Code?"
- "Check whether the SkillX skill `awesome-skills-code-review-excellence` is safe to use, then load it if it looks fine."
- "Install the best-rated Postgres migration skill from SkillX into this project."

## Install

From the Claude directory, or from the SkillX marketplace in Claude Code:

```text
/plugin marketplace add nextlevelbuilder/skillx
/plugin install skillx@skillx-marketplace
```

## Versioning

The plugin follows semantic versioning in `.claude-plugin/plugin.json`. The CLI
it runs is pinned to an exact `skillx-sh` version, which is raised in a plugin
release after that CLI version is published.

## Support and security

- Questions and bugs: <https://github.com/nextlevelbuilder/skillx/issues>
- Security reports: see [SECURITY.md](https://github.com/nextlevelbuilder/skillx/blob/main/SECURITY.md)
- Report a malicious catalog skill: open an issue with its slug.
- Documentation: [plugin guide](https://github.com/nextlevelbuilder/skillx/blob/main/docs/claude-plugin.md),
  [CLI reference](https://github.com/nextlevelbuilder/skillx/blob/main/docs/cli-reference.md).

## License

MIT, see [LICENSE](./LICENSE). Skills found through SkillX carry their own licenses.
