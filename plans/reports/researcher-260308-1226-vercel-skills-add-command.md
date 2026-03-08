# Research Report: Vercel Labs `skills add` Command

**Date:** 2026-03-08
**Source:** https://github.com/vercel-labs/skills
**Focus:** Complete reverse engineering of `skills add` command

---

## 1. What `skills add` Does (Full User Flow)

### High-Level Purpose
The `skills add` command installs reusable AI agent skills from various sources (GitHub repos, local paths, or well-known endpoints) into agent-specific or global installation directories.

### Complete User Flow

```
User runs: npx skills add <source> [options]
  ↓
Parse source (GitHub shorthand, URLs, local paths)
  ↓
Clone/validate repository (or use local path)
  ↓
Discover available SKILL.md files in repository
  ↓
Select skills (interactive multiselect or via --skill flag)
  ↓
Detect installed agents on system
  ↓
Select target agents (interactive or via --agent flag)
  ↓
Choose installation scope (global vs project-local, unless -g specified)
  ↓
Choose installation method (symlink vs copy, unless --copy specified)
  ↓
Display installation summary + security audit results
  ↓
Confirm installation (unless -y flag)
  ↓
Install skills for each agent (create dirs, symlink/copy files)
  ↓
Update skill lock files (.claude/skills.lock.json, .skills.lock.json)
  ↓
Prompt to install find-skills skill (one-time only)
  ↓
Display results summary
```

---

## 2. Arguments and Flags

### Required Argument
- **`<source>`** (positional) - Skill source identifier (required, no default)
  - Examples: `vercel-labs/skills`, `/path/to/local`, `https://github.com/owner/repo`

### Optional Flags

| Flag | Long Form | Type | Default | Purpose |
|------|-----------|------|---------|---------|
| `-g` | `--global` | boolean | false | Install to home directory instead of project |
| `-y` | `--yes` | boolean | false | Skip all confirmation prompts |
| `-l` | `--list` | boolean | false | List available skills without installing |
| `-a` | `--agent` | string[] | (detect) | Target specific agents; can repeat: `-a claude-code -a cursor` |
| `-s` | `--skill` | string[] | (interactive) | Install specific skills; can repeat: `-s frontend-design -s utils` |
| `--all` | `--all` | boolean | false | Install all skills to all agents (implies `-y`) |
| `--copy` | `--copy` | boolean | false | Copy files instead of symlinking |
| `--full-depth` | `--full-depth` | boolean | false | Search all subdirectories even if root has SKILL.md |

### Flag Combinations

Special handling:
- `--all` implies `--skill '*'` + `--agent '*'` + `-y`
- `--skill '*'` installs all discovered skills
- `--agent '*'` installs to all available agents
- If source contains `@skill-name` syntax (e.g., `owner/repo@find-skills`), it sets a skill filter

### Example Commands
```bash
# Interactive mode
npx skills add vercel-labs/skills

# Specific skill & agent, skip prompts
npx skills add vercel-labs/skills -s find-skills -a claude-code -y -g

# All skills, all agents, global
npx skills add vercel-labs/agent-skills --all -g

# List available skills
npx skills add /path/to/repo --list

# Using @skill syntax
npx skills add vercel-labs/skills@find-skills -y -g -a claude-code
```

---

## 3. Skill Name Resolution

### Source Parsing Priority (parseSource function)

The `parseSource()` function accepts multiple input formats:

1. **Source Aliases**
   - `coinbase/agentWallet` → `coinbase/agentic-wallet-skills`

2. **GitHub Prefix**
   - `github:owner/repo` → parses as GitHub shorthand

3. **GitLab Prefix**
   - `gitlab:owner/repo` → `https://gitlab.com/owner/repo`

4. **Local Paths** (Absolute, relative, or current directory)
   - `/path/to/skills`, `./skills`, `../repo`, `.`, `..`, `C:\Users\...` (Windows)
   - Returns: `ParsedSource` with `type: 'local'`, `localPath` set

5. **GitHub URLs with Path + Branch**
   - `https://github.com/owner/repo/tree/main/path/to/skills`
   - Returns: `type: 'github'`, `ref: 'main'`, `subpath: 'path/to/skills'`

6. **GitHub Shorthand** (Most Common)
   - `owner/repo` → `https://github.com/owner/repo.git`
   - `owner/repo/path/to/skills` → adds `subpath`
   - `owner/repo@skill-name` → adds `skillFilter` (extracts single skill)

7. **GitHub URLs (Full)**
   - `https://github.com/owner/repo`
   - Automatically strips `.git` suffix

8. **GitLab URLs** (with group/subgroup support)
   - `https://gitlab.com/owner/repo` or `https://gitlab.com/group/subgroup/repo`
   - Also supports path + branch: `/tree/main/path`

9. **Well-Known Endpoints** (RFC 8615)
   - Any `http(s)://` URL not matching GitHub/GitLab
   - Expects `/.well-known/skills/index.json` endpoint

10. **Direct Git URLs** (Fallback)
    - Any other git URL (e.g., private git servers)

### Returned ParsedSource Structure
```typescript
interface ParsedSource {
  type: 'github' | 'gitlab' | 'git' | 'local' | 'well-known';
  url: string;           // Full URL or resolved local path
  subpath?: string;      // Path within repository
  localPath?: string;    // Set only for local type
  ref?: string;          // Git branch/tag
  skillFilter?: string;  // Skill name extracted from @syntax
}
```

---

## 4. Files Created/Modified on User's System

### Installation Directory Structure

**Global Installation:**
- Base: `~/.agent/skills/` (canonical directory for all agents)
- Per-agent (symlink):
  - `~/.agent/<agent-name>/skills/` → symlinks to canonical
  - Examples: `~/.claude-code/skills/`, `~/.cline/skills/`, `~/.cursor/skills/`

**Project-Local Installation:**
- Base: `./.agent/skills/` (in current working directory)
- Per-agent: `./.agent/<agent-name>/skills/`

### Directory Creation Pattern

For global install of skill `find-skills` to `claude-code`:

```
~/.agent/
├── skills/                        # Canonical dir (universal agents + symlink targets)
│   └── find-skills/               # Sanitized skill name
│       ├── SKILL.md               # Skill metadata + instructions
│       └── [other files from repo]
├── .claude-code/                  # Agent-specific dir
│   └── skills/
│       └── find-skills → symlink to ~/.agent/skills/find-skills
└── .universal/                    # Special agent type
    └── skills/
        └── find-skills → symlink or copy
```

### Lock Files Updated

**Global Skills Lock (for update tracking):**
- Path: `~/.agent/.skills.lock.json`
- Version: 3
- Contains: Map of installed skills with source, branch, folder hash, plugin name

Example:
```json
{
  "version": 3,
  "skills": {
    "find-skills": {
      "source": "vercel-labs/skills",
      "sourceType": "github",
      "sourceUrl": "https://github.com/vercel-labs/skills",
      "skillPath": "skills/find-skills/SKILL.md",
      "skillFolderHash": "a1b2c3d...",
      "pluginName": "curated"
    }
  }
}
```

**Project-Local Skills Lock:**
- Path: `.skills.lock.json` (in project root)
- Contains: Similar structure but tracks project-scoped installs
- Stores: `computedHash` instead of `skillFolderHash` (file-based hash, not GitHub tree hash)

**Telemetry/Tracking:** (Opt-out)
- Only sent for public repos (private repos never tracked)
- Tracks: event type, source, skill names, agents, installation mode, skill file paths

---

## 5. SKILL.md File Handling

### Structure Expected

**Minimal SKILL.md:**
```yaml
---
name: "Find Skills"
description: "Help your agent discover and suggest skills"
# Optional metadata
metadata:
  internal: false
  category: "discovery"
---

# Skill Implementation

[Markdown content with agent instructions and code]
```

### Parsing (parseSkillMd function)

```typescript
async function parseSkillMd(skillMdPath: string): Promise<Skill | null>
```

1. **Reads file** from `SKILL.md` (must be exact filename)
2. **Parses frontmatter** (YAML) using gray-matter library
3. **Validates:**
   - `data.name` exists and is string
   - `data.description` exists and is string
   - Skips internal skills unless `INSTALL_INTERNAL_SKILLS=1` or `includeInternal=true`
4. **Returns:** Skill object with name, description, path, rawContent, metadata
5. **Returns null** if parsing fails or validation fails (skipped silently)

### Returned Skill Object
```typescript
interface Skill {
  name: string;                    // From frontmatter
  description: string;             // From frontmatter
  path: string;                    // Directory containing SKILL.md
  rawContent?: string;             // Full file content (for hashing)
  metadata?: Record<string, any>;  // Additional frontmatter fields
  pluginName?: string;             // Assigned during discovery (optional)
}
```

### Internal Skills

Hidden by default. Revealed only if:
1. Environment variable `INSTALL_INTERNAL_SKILLS=1` is set, OR
2. User explicitly requests the skill (via `--skill` or `@skill` syntax)

---

## 6. Directory Structure & Discovery Algorithm

### Skill Discovery (discoverSkills function)

**Search Order (Priority Lookup):**

1. **Direct path check:** If `basePath/SKILL.md` exists, return it (unless `--full-depth`)
2. **Priority directories** (checked in order):
   ```
   skills/
   skills/.curated/
   skills/.experimental/
   skills/.system/
   .agent/skills/
   .agents/skills/
   .claude/skills/
   .cline/skills/
   .codebuddy/skills/
   .codex/skills/
   .commandcode/skills/
   .continue/skills/
   [30+ more agent-specific dirs...]
   ```
3. **Plugin-declared paths** (from plugin manifests)
4. **Recursive fallback:** If no skills found in priority dirs, recursively search up to 5 levels deep
   - Skips: `node_modules`, `.git`, `dist`, `build`, `__pycache__`

### De-duplication
- Tracks seen skill names to prevent duplicates
- First match wins in priority order

### Plugin Grouping
Skills discovered within a plugin are grouped together in UI (e.g., "Curated Skills", "Experimental Skills")

---

## 7. Interactive Prompts and Confirmations

### Prompt Sequence (Unless -y flag)

**Step 1: Skill Selection**
- If single skill: Auto-selected, shown for confirmation
- If multiple skills: Grouped multiselect (by plugin if available)
  - Space to toggle, Enter to confirm
  - Shows description hints (truncated to 60 chars)

**Step 2: Agent Detection**
- Auto-detects installed agents on system
- If none detected: Prompts to select from all available agents
  - Can select multiple agents
  - Uses searchable multiselect if many agents
- If detected: Shows detected agents, optionally prompts if multiple

**Step 3: Installation Scope** (only if agent supports global)
- Options: "Project" (local ./.agent) or "Global" (~/.agent)
- Only shown if `-g` not specified and `--global` not implied

**Step 4: Installation Method**
- Options: "Symlink (Recommended)" or "Copy to all agents"
- Symlink = single source of truth, easy updates
- Copy = independent copies per agent (fallback if symlink fails on Windows)
- Only shown if `--copy` not specified

**Step 5: Installation Summary** (p.note display)
- Shows: Skill names → installation paths → target agents → overwrite status

**Step 6: Security Audit Results** (if available)
- Fetched in parallel from telemetry service
- Shows risk levels: Critical/High/Medium/Low/Safe
- Shows partner audit results (Socket, Snyk, ATH)

**Step 7: Final Confirmation**
- Message: "Proceed with installation?"
- Yes/No prompt (unless -y flag)

**Step 8: Post-Installation Prompts**
- "Install find-skills skill?" (one-time only, after first install)
  - If dismissed, won't ask again

### Cancellation
- `Ctrl+C` at any prompt cancels and cleans up
- All prompts allow `p.cancel(symbol)` to exit gracefully

---

## 8. Error Handling Patterns

### Source Validation
```typescript
if (!source) {
  console.error('ERROR: Missing required argument: source');
  console.error('Usage: npx skills add <source> [options]');
  process.exit(1);
}
```

### Repository Cloning
```typescript
try {
  tempDir = await cloneRepo(parsed.url, parsed.ref);
} catch (error) {
  if (error instanceof GitCloneError) {
    p.log.error('Failed to clone repository');
    // Print each error line
  }
  process.exit(1);
}
```

### Skill Discovery
```typescript
if (skills.length === 0) {
  p.outro(pc.red('No valid skills found. Skills require a SKILL.md with name and description.'));
  process.exit(1);
}
```

### Skill Selection
```typescript
if (selectedSkills.length === 0) {
  p.log.error(`No matching skills found for: ${options.skill.join(', ')}`);
  p.log.info('Available skills:');
  for (const s of skills) {
    p.log.message(`  - ${getSkillDisplayName(s)}`);
  }
  process.exit(1);
}
```

### Agent Validation
```typescript
const invalidAgents = options.agent.filter((a) => !validAgents.includes(a));
if (invalidAgents.length > 0) {
  p.log.error(`Invalid agents: ${invalidAgents.join(', ')}`);
  p.log.info(`Valid agents: ${validAgents.join(', ')}`);
  process.exit(1);
}
```

### Installation Failures
- Per-skill failures don't stop other installations
- Results collected in array: `{ success, path, error, symlinkFailed, mode }`
- Symlink failures fallback to copy (Windows developer mode issue)
- Final summary shows successes and failures separately

### Path Safety
- Validates subpaths don't contain `..` segments (path traversal protection)
- Checks symlink targets are within expected directories
- Handles ELOOP (circular symlinks) gracefully

### Cleanup
- Temporary cloned directories cleaned up on exit (finally block)
- Errors in cleanup don't fail the main process

---

## 9. Agent Configuration

### Supported Agents (40+)
```typescript
type AgentType =
  'amp' | 'antigravity' | 'augment' | 'claude-code' | 'cline' | 'cursor'
  | 'continue' | 'vscode' | 'github-copilot' | 'windsurf'
  | 'replit' | 'openhands' | 'goose' | 'command-code'
  // ... 28 more
```

### Universal vs Symlinked Agents

**Universal Agents** (shared canonical directory):
- `claude-code` (Claude Code), `cline`, `copilot`, `windsurf`, `cursor` (partial list)
- Installed to: `~/.agent/skills/`
- No symlinks needed (prevent redundancy)

**Symlinked Agents** (per-agent symlink):
- Most others: `~/.claude-code/skills/` → `~/.agent/skills/`
- Use symlinks to save space and enable easy updates

### Agent Detection
```typescript
const installedAgents = await detectInstalledAgents();
```
Checks for agent presence on system (config files, env vars, executables)

### Install Mode Impact

**Symlink mode (recommended):**
- Universal agents: Installed to canonical dir
- Symlinked agents: Dir created with symlinks to canonical
- Benefit: Single source of truth, easy updates, no duplication

**Copy mode:**
- All agents: Independent full copies
- Benefit: Works on Windows without Developer Mode
- Cost: Duplicated files, harder updates

---

## 10. Key Implementation Details

### Sanitization (sanitizeName function)
```typescript
name
  .toLowerCase()
  .replace(/[^a-z0-9._]+/g, '-')     // Spaces & special chars → hyphens
  .replace(/^[.\-]+|[.\-]+$/g, '')   // Trim leading/trailing dots & hyphens
  .substring(0, 255)                  // Limit to 255 chars
  || 'unnamed-skill'                  // Fallback if empty
```

### Hashing for Updates
- **Global installs:** GitHub Trees API hash (folder-level, tracks updates)
- **Local installs:** File-based hash (computeSkillFolderHash, for integrity check)
- Used in `check` and `update` commands

### Telemetry
- Event type: `'install'`
- Tracked fields: source, skill names, agents, global flag, skill files map
- **Only for public repos** (private repos excluded)
- Can be opted out at system level

### Skill Filtering with @syntax
```
Source: owner/repo@find-skills
  ↓
Parser extracts: skillFilter: 'find-skills'
  ↓
Merged into options.skill array
  ↓
Only 'find-skills' displayed/installed
```

---

## 11. File System Operations Summary

### Operations per Skill Installation

For each skill × agent combination:

1. **Create directory:** `getAgentBaseDir(agent) / skill-name/`
2. **Symlink mode (non-universal):**
   - Compute relative path from agent dir to canonical dir
   - Create symlink at agent dir pointing to canonical
   - Fallback to copy on ENOENT, ELOOP, or permission errors (Windows)
3. **Copy mode:**
   - Recursively copy skill files to agent dir
   - Preserve permissions and structure
4. **Write lock file:**
   - Update global or local `.skills.lock.json`
   - Record source, hash, plugin name for future updates

### Cleanup
- Temporary clone directory deleted on process exit
- Partial failures don't prevent other installations
- Lock file updates wrapped in try-catch (don't fail install)

---

## 12. Dependencies & Libraries

**Key packages:**
- `@clack/prompts` - Interactive prompts (multiselect, confirm, etc.)
- `picocolors` - Terminal colors (no dependencies)
- `gray-matter` - YAML frontmatter parsing
- `fs/promises` - Async file operations
- Built-in: `path`, `os`, `child_process`

**Custom modules:**
- `parseSource()` - Source string → ParsedSource
- `discoverSkills()` - Directory → Skill[] array
- `installSkillForAgent()` - Skill × Agent → install result
- `fetchSkillFolderHash()` - GitHub Trees API lookup
- `addSkillToLock()` / `addSkillToLocalLock()` - Lock file management

---

## Unresolved Questions

1. **Well-known endpoint format** - Exact JSON structure of `/.well-known/skills/index.json` (assumed from code but not fully documented in repo)
2. **Plugin manifest format** - Exact structure of `plugin-manifest.ts` (mentioned but not fully explored)
3. **Private repo handling** - How are credentials passed for private GitHub repos?
4. **Symlink fallback mechanics** - Exact conditions that trigger copy fallback on Windows
5. **Agent detection details** - How each agent type is detected (env vars? Config file locations?)
6. **Rate limiting** - GitHub API rate limits and behavior when exceeded

---

## Summary for SkillX Implementation

### Key Learnings for `skillx add`

1. **Source parsing is complex but handles many cases** - Shorthand, URLs, local paths, well-known endpoints
2. **Skill discovery uses priority search** - Common dirs first, then recursive fallback, prevents duplicates
3. **Installation is agent-aware** - Universal vs symlinked requires different handling; per-agent discovery needed
4. **Lock files enable updates** - Track source, path, folder hash for checking updates later
5. **Prompts are ergonomic** - Grouped multiselect, search, hints; respect -y flag
6. **Error handling is graceful** - Per-skill failures don't block; cleanup happens regardless
7. **Symlink vs copy trade-off** - Symlink preferred (space, updates) but copy fallback for Windows
8. **Telemetry respects privacy** - Only public repos; can be disabled
9. **Security scanning is parallel** - Fetched while user selects agents (non-blocking)
10. **Sanitization is strict** - File names sanitized; paths validated against traversal attacks

