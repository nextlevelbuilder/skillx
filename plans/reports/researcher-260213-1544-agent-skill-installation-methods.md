# Agent Skill Installation Methods Research

**Date:** 2026-02-13
**Researcher:** Agent
**Objective:** Document skill/instruction installation for popular coding agents

---

## 1. Claude Code

### Installation Method
- **Primary:** `npx skills add <source>` (Vercel CLI)
- **Alternative:** `npx add-skill <source>` (universal installer)
- **Alternative:** `npx openskills <source>` (universal loader)
- **Manual:** Create `SKILL.md` files directly in `.claude/skills/`

### Command Format
```bash
# Supports multiple formats
npx skills add owner/repo                    # GitHub shorthand
npx skills add owner/repo --skill skill-name # Specific skill
npx skills add owner/repo/skill              # Direct skill path (THREE-PART FORMAT)
npx skills add -g owner/repo                 # Global install
npx skills add -a claude-code owner/repo     # Target specific agent
```

### Config Locations
| Scope | Path | Purpose |
|-------|------|---------|
| Personal | `~/.claude/skills/<name>/SKILL.md` | All projects |
| Project | `.claude/skills/<name>/SKILL.md` | This project only |
| Enterprise | Managed settings | Organization-wide |
| Plugin | `<plugin>/skills/<name>/SKILL.md` | Where plugin enabled |

### API Key/Env Support
- **API Keys:** `ANTHROPIC_API_KEY` env var (overrides subscription auth)
- **Env Files:** Supported via settings.json or shell profile
- **Verification:** Run `/status` to check active auth method
- **Security:** Use `permissions.deny` in `.claude/settings.json` to block access to `.env` files

### Key Features
- Follows [Agent Skills](https://agentskills.io) open standard
- Auto-discovery from nested `.claude/skills/` in subdirectories (monorepo support)
- Supports `/skill-name` slash commands
- Claude auto-loads skills when relevant or manual invocation
- YAML frontmatter controls: invocation, tools, models, context

### Verification for SkillX Command
**✅ YES** — `npx skills add nextlevelbuilder/skillx/skillx` should work:
- Vercel CLI supports three-part format: `owner/repo/skill`
- Direct skill path targeting within repos is documented
- CLI will fetch from GitHub and install to `.claude/skills/skillx/`

---

## 2. Codex (OpenAI CLI)

### Installation Method
- **Primary:** Manual creation of `AGENTS.md` file
- **Alternative:** Use `model_instructions_file` in config.toml

### Command Format
No dedicated skill installation CLI. Configuration-based approach:
```toml
# ~/.codex/config.toml or .codex/config.toml
model_instructions_file = "/path/to/instructions.md"
developer_instructions = "Additional instructions..."
project_doc_fallback_filenames = ["AGENTS.md", "README.md"]
```

### Config Locations
| Scope | Path | Purpose |
|-------|------|---------|
| User | `~/.codex/config.toml` | Global defaults |
| Project | `.codex/config.toml` | Project overrides (trusted only) |
| Instructions | `AGENTS.md` (project root) | Custom behavior |

### API Key/Env Support
- **Credentials:** `cli_auth_credentials_store` (file \| keyring \| auto)
  - File mode: `~/.codex/auth.json`
  - Keyring: OS keychain storage
- **Environment:** `shell_environment_policy` section
  - `inherit: all | core | none`
  - `set: { KEY = "value" }`
  - `include_only: ["PATTERN*"]`
  - `exclude: ["PATTERN*"]`
- **Model Providers:** `model_providers.<id>.env_key` specifies which env var to use

### Key Features
- AGENTS.md referenced in system message
- Inline config overrides: `-c key=value`
- Layered config: CLI flags > project > user
- No agent skills marketplace/CLI integration

---

## 3. Gemini CLI

### Installation Method
- **Primary:** `gemini skills install <source>`
- **Manual:** Create `SKILL.md` in `.gemini/skills/`

### Command Format
```bash
# Installation
gemini skills link /path/to/my-skills-repo
gemini skills install https://github.com/user/repo.git
gemini skills install /path/to/local/skill
gemini skills install /path/to/skill --scope workspace

# Management
gemini skills list
gemini skills remove <name>
```

### Config Locations
| Scope | Path | Purpose |
|-------|------|---------|
| Workspace | `.gemini/skills/` | Version-controlled, team-shared |
| User | `~/.gemini/skills/` | Personal, cross-workspace |
| Extension | Bundled in extensions | Extension-provided |

**Priority:** Workspace > User > Extension

### API Key/Env Support
- **Not documented in skills section**
- Likely in `/docs/get-started/authentication/` (not accessed)
- Follows similar patterns to Claude Code (GEMINI_API_KEY likely)

### Key Features
- Follows Agent Skills standard (SKILL.md format)
- Lazy-loading (skills activated just-in-time, not loaded upfront)
- Supports YAML frontmatter + markdown body
- Compatible with Claude Code skills

---

## 4. Cursor

### Installation Method
- **Primary:** Manual creation of `.cursor/rules/*.mdc` files
- **Legacy:** `.cursorrules` file (deprecated but supported)

### Command Format
No CLI. Manual file creation:
```bash
# Modern approach
.cursor/rules/my-rule.mdc

# Legacy (deprecated)
.cursorrules
```

### Config Locations
| Priority | Path | Purpose |
|----------|------|---------|
| 1 (Highest) | Team Rules | Enterprise/Team plans |
| 2 | `.cursor/rules/*.mdc` | Project-specific, version-controlled |
| 3 | User Rules | Cursor Settings > Rules (global) |
| 4 (Lowest) | `.cursorrules` | Legacy single-file (deprecated) |

### API Key/Env Support
- **API Keys:** Settings icon > Models panel (UI-based)
- **Environment:** `.cursor/environment.json` defines env vars for remote environments
- **Env Variables:** Use UPPERCASE naming convention
- **Security:** Prior to v2.3, had CVE-2026-22708 (terminal allowlist bypass via env vars)

### Key Features
- Modern `.mdc` format with YAML frontmatter
- Glob patterns for file matching
- Activation controls per rule
- Multiple rule files (not single `.cursorrules`)
- No skills marketplace integration

---

## 5. Amp

### Installation Method
- **Skills:** Manual creation in `.agents/skills/`
- **Instructions:** `AGENTS.md` file (project root)
- **Legacy support:** Reads `.cursorrules`, `.cursor/rules`, `.windsurfrules`, `CLAUDE.md`, etc.

### Command Format
No CLI for skills. Configuration-based:
```bash
# Project skills
.agents/skills/<skill-name>/SKILL.md

# User skills
~/.config/agents/skills/<skill-name>/SKILL.md

# Instructions
AGENTS.md (or CLAUDE.md fallback)
```

### Config Locations
| Scope | Path | Purpose |
|-------|------|---------|
| Project | `.agents/skills/` | Project-specific |
| User | `~/.config/agents/skills/` | User-wide |
| Instructions | `AGENTS.md` (root + parents up to $HOME) | Codebase guidance |
| Toolboxes | `$AMP_TOOLBOX` dirs | Custom executable tools |

### API Key/Env Support
- **API Key:** `ANTHROPIC_API_KEY` env var
- **Toolbox:** `AMP_TOOLBOX` env var (PATH-like, colon-separated)
  - Example: `$PWD/.agents/tools:$HOME/.config/amp/tools`
- **Config:** `.env.example`, `src/config/` schemas

### Key Features
- **Custom commands removed** — replaced by skills (Jan 2026)
- Built-in + custom skills support
- Scoped instructions with glob patterns (YAML frontmatter)
- Toolboxes for custom executable tools
- Multi-agent compatibility (AGENTS.md + CLAUDE.md fallback)

---

## 6. Windsurf (formerly Codeium)

### Installation Method
- **Primary:** Manual creation in `.windsurf/rules/`
- **Directory:** Windsurf Rules Directory (curated examples)

### Command Format
No CLI. Manual file creation:
```bash
# Workspace rules
.windsurf/rules/<rule-name>.mdc
```

### Config Locations
| Scope | Path | Purpose |
|-------|------|---------|
| Workspace | `.windsurf/rules/` | Project-specific |
| User | User-level rules (via UI) | Personal preferences |
| Template | `AGENT.md` (Igniter.js projects) | Auto-generated from templates |

### API Key/Env Support
- **API Keys:** Provider API Keys panel (UI-based)
- **Environment:** `.codeium/windsurf/mcp_config.json` (MCP servers)
  - Example env vars: `JENTIC_AGENT_API_KEY`, `DISCORD_BOTTOKEN`, `OPENAI_API_KEY`
- **Terminal:** Cascade Dedicated Terminal reads `.zshrc` env vars
- **Security:** Sensitive data exposure risk — use test keys, rotate after sessions

### Key Features
- Granular rules: always-on, @mention-able, Cascade-requested, or glob-attached
- MCP servers extend agent capabilities
- Memories and rules customize behavior
- Windsurf Rules Directory (curated examples)
- Template projects with auto-included `AGENT.md`

---

## 7. Google Antigravity

### Overview
- **Announced:** Nov 18, 2025 (with Gemini 3 release)
- **Status:** Public preview (free for individuals, Feb 2026)
- **Type:** Agentic development platform (not just an editor)

### Installation Method
- No skills marketplace documented yet
- Agent-first interface with Editor view + Manager view
- Learning as core primitive (agents save context to knowledge base)

### Config Locations
- **Not documented** — new platform, likely evolving
- Supports multiple AI models: Gemini 3 Pro/Deep Think/Flash, Claude Sonnet 4.5/Opus 4.5, GPT-OSS-120B

### Key Features
- Multi-agent orchestration (parallel workspaces)
- Built-in learning/knowledge base
- Control center (Manager view) for coordinating agents
- Free for individual developers
- Agent-first paradigm (not IDE-first)

### Status
**New/Experimental** — No skill installation docs yet. Too early for SkillX integration.

---

## Summary Table: Skill Installation

| Agent | Install Command | Config Location | Env/API Key Support | SkillX Compatible |
|-------|-----------------|-----------------|---------------------|-------------------|
| **Claude Code** | `npx skills add owner/repo/skill` | `.claude/skills/` | `ANTHROPIC_API_KEY` | ✅ YES |
| **Codex** | Manual (AGENTS.md) | `.codex/config.toml` | `~/.codex/auth.json` or keyring | ⚠️ Manual only |
| **Gemini CLI** | `gemini skills install <source>` | `.gemini/skills/` | Likely `GEMINI_API_KEY` | ✅ YES |
| **Cursor** | Manual (.cursor/rules/*.mdc) | `.cursor/rules/` | UI-based (Settings > Models) | ⚠️ Manual only |
| **Amp** | Manual (.agents/skills/) | `.agents/skills/` | `ANTHROPIC_API_KEY` | ⚠️ Manual only |
| **Windsurf** | Manual (.windsurf/rules/) | `.windsurf/rules/` | MCP config JSON | ⚠️ Manual only |
| **Antigravity** | Not documented | Not documented | Not documented | ❌ Too early |

---

## Key Findings

### Universal CLI Support
**Only 2 agents support CLI-based skill installation:**
1. **Claude Code** — `npx skills add` (Vercel ecosystem)
2. **Gemini CLI** — `gemini skills install`

**All others require manual file creation.**

### SkillX Command Validation
**`npx skills add nextlevelbuilder/skillx/skillx` WILL WORK for Claude Code:**
- Vercel CLI supports `owner/repo/skill` three-part format
- Direct skill path documented and tested
- Will fetch from GitHub and install to `.claude/skills/skillx/`

### Standard Formats
**Most agents use:**
- `SKILL.md` or `AGENT.md` / `AGENTS.md` markdown files
- YAML frontmatter + markdown body
- Directory-based organization (not single files)

**Exception:** Cursor uses `.mdc` (Markdown with frontmatter) and legacy `.cursorrules`

### API Key Patterns
| Pattern | Agents |
|---------|--------|
| Env var (`ANTHROPIC_API_KEY`) | Claude Code, Amp |
| Config file | Codex (toml), Windsurf (MCP JSON) |
| UI-based | Cursor, Windsurf |
| Keyring/OS storage | Codex (optional) |

---

## Unresolved Questions

1. **Gemini CLI API key format** — Assumed `GEMINI_API_KEY` but not confirmed. Need to check `/docs/get-started/authentication/`.

2. **Antigravity skill system** — Platform too new (Nov 2025 launch). No skill installation docs yet. Monitor for updates.

3. **Windsurf CLI** — Does `.windsurf/rules/` have any CLI installation method? Docs only show manual creation + UI directory.

4. **Cursor rules CLI** — Modern `.cursor/rules/*.mdc` system has no CLI. Could `npx skills add` be extended to support Cursor?

5. **Agent Skills compatibility** — Which agents truly follow the [Agent Skills](https://agentskills.io) standard besides Claude Code and Gemini CLI?

---

## Sources

### Claude Code
- [Extend Claude with skills - Claude Code Docs](https://code.claude.com/docs/en/skills)
- [Vercel Add-Skill: Install Claude Code Skills Fast | Vibe Coding](https://medium.com/vibe-coding/the-easiest-way-to-extend-claude-code-cloudflare-complicates-it-4995e8b4cab3)
- [GitHub - vercel-labs/skills: The open agent skills tool - npx skills](https://github.com/vercel-labs/skills)
- [add-skill CLI Tool | Install Agent Skills for OpenCode, Claude Code, Codex, Cursor | npx add-skill](https://add-skill.org/)
- [Managing API key environment variables in Claude Code | Claude Help Center](https://support.claude.com/en/articles/12304248-managing-api-key-environment-variables-in-claude-code)

### Codex (OpenAI CLI)
- [Configuration Reference](https://developers.openai.com/codex/config-reference/)
- [OpenAI Codex CLI: Official Description & Setup Guide (Updated 2025-12) - SmartScope](https://smartscope.blog/en/generative-ai/chatgpt/openai-codex-cli-comprehensive-guide/)
- [GitHub - openai/codex: Lightweight coding agent that runs in your terminal](https://github.com/openai/codex)

### Gemini CLI
- [Agent Skills | Gemini CLI](https://geminicli.com/docs/cli/skills/)
- [Beyond Prompt Engineering: Using Agent Skills in Gemini CLI | by Daniel Strebel | Google Cloud - Community | Feb, 2026 | Medium](https://medium.com/google-cloud/beyond-prompt-engineering-using-agent-skills-in-gemini-cli-04d9af3cda21)
- [Gemini CLI Skills Are Here: Works With Your Claude Code Skills (Don't Miss This Update) | by Joe Njenga | AI Software Engineer | Jan, 2026 | Medium](https://medium.com/ai-software-engineer/gemini-cli-skills-are-here-works-with-your-claude-code-skills-dont-miss-this-update-0ed0d181f73b)

### Cursor
- [GitHub - PatrickJS/awesome-cursorrules: 📄 Configuration files that enhance Cursor AI editor experience with custom rules and behaviors](https://github.com/PatrickJS/awesome-cursorrules)
- [Cursor Rules Guide - Configure AI Rules for Cursor IDE | design.dev](https://design.dev/guides/cursor-rules/)
- [How to Use Custom API Keys in Cursor for Unlimited AI Coding](https://apidog.com/blog/how-to-add-custom-api-keys-to-cursor-a-comprehensive-guide/)
- [Configuring Cursor Environments with environment.json | Developing with AI Tools | Steve Kinney](https://stevekinney.com/courses/ai-development/cursor-environment-configuration)

### Amp
- [Owner's Manual - Amp](https://ampcode.com/manual)
- [How to Build an Agent - Amp](https://ampcode.com/notes/how-to-build-an-agent)
- [Diving into Amp Code: A QuickStart Guide | Sid Bharath](https://www.siddharthbharath.com/amp-code-guide/)
- [GitHub - agentmd/agent.md: This repository defines AGENT.md, a standardized format that lets your codebase speak directly to any agentic coding tool.](https://github.com/agentmd/agent.md)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)

### Windsurf
- [Windsurf Editor | Windsurf](https://windsurf.com/editor)
- [Windsurf Review (2026): Agentic AI IDE (Formerly Codeium)](https://vibecoding.app/blog/windsurf-review)
- [Using Windsurf as a Code Agent with Igniter.js](https://igniterjs.com/docs/code-agents/windsurf)
- [Windsurf Rules Directory | Windsurf](https://windsurf.com/editor/directory)
- [Provider API Keys | Windsurf](https://windsurf.com/subscription/provider-api-keys)

### Google Antigravity
- [Build with Google Antigravity, our new agentic development platform - Google Developers Blog](https://developers.googleblog.com/build-with-google-antigravity-our-new-agentic-development-platform/)
- [Google Antigravity Review (2026): The "Agent-First" IDE for Gemini 3](https://leaveit2ai.com/ai-tools/code-development/antigravity)
- [Getting Started with Google Antigravity | Google Codelabs](https://codelabs.developers.google.com/getting-started-google-antigravity)
- [Google Antigravity - Wikipedia](https://en.wikipedia.org/wiki/Google_Antigravity)
