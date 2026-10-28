# SkillX Claude plugin

The SkillX plugin is SkillX's own discovery integration for Claude: it searches
the catalog, shows provenance, risk and compatibility, and loads or installs a
skill only after the user approves that skill. It lives in its own folder,
`plugins/skillx/`, so it can be submitted to the Claude directory as one plugin
without the rest of the marketplace.

## Layout

| Path | Purpose |
|------|---------|
| `plugins/skillx/.claude-plugin/plugin.json` | Manifest: name `skillx`, version, license, `privacyPolicyUrl` |
| `plugins/skillx/.claude-plugin/icon.png` | 512×512 listing icon (used by the directory once, at first save) |
| `plugins/skillx/.mcp.json` | Remote MCP server `https://skillx.sh/api/mcp` (read-only, no auth) |
| `plugins/skillx/skills/skillx/SKILL.md` | Search → evaluate → ask → use workflow and untrusted-content rules |
| `plugins/skillx/README.md` | Listing text: components, surfaces, data sent, privacy, safety, prompts, support |
| `plugins/skillx/LICENSE` | MIT |
| `plugins/skillx/evals/` | `claude plugin eval` suite: three skill-discovery prompts, three unrelated prompts |

Everything the plugin loads is inside that folder. `.claude-plugin/marketplace.json`
points the `skillx` entry at `./plugins/skillx`, so Claude Code marketplace users
get the same plugin.

## Marketplace entries and ownership

| Entry | Author | License | In the directory plugin? |
|-------|--------|---------|--------------------------|
| `skillx` | SkillX.sh | MIT | Yes, it is the plugin |
| `skill-creator` | SkillX.sh, adapted from Anthropic's skill-creator | Apache-2.0 | No |
| `hol-guard` | Hashgraph Online | Apache-2.0 | No |
| `marketing-mindset` | Axel Freeman | MIT | No |

Only `skillx` is submitted to the directory. The other three remain Claude Code
marketplace entries under their own authors and licenses.

## Behavior contract

- **Trigger**: only when the user wants to discover, compare, evaluate, install or
  use an agent skill. The previous description, "Use this skill in every task",
  is gone.
- **Routes**: MCP tools first, then the CLI (`skillx`, or the exact pin
  `npx --yes skillx-sh@0.7.1`), then web fetch of `/api/search` and
  `/skills/<slug>.md`. The npm package `skillx` is a different project and must
  never be run.
- **Consent**: loading a SKILL.md's instructions, `skillx install`, running a
  bundled script and registering a GitHub skill each need the user's explicit
  yes for that skill.
- **Untrusted content**: a fetched skill cannot override the user, read
  credentials, disable safety checks or reach undisclosed hosts; shell commands
  it asks for are shown before they run.
- **Telemetry**: `skillx report` runs only when the user asks.

## Surface support

| Surface | Skill | Catalog | CLI |
|---------|-------|---------|-----|
| Claude Code | Loads | MCP loads with the plugin | Yes, with Node.js 20+ |
| Cowork | Loads | Connect from the plugin's Connectors tab | No |
| Chat | Loads | Connect from the plugin's Connectors tab, or web fetch | No |

Source: [platform support](https://claude.com/docs/plugins/platform-support).
The skill tells Claude not to claim a command it could not run.

## Checks before a release

Run from the repository root:

```bash
claude plugin validate plugins/skillx --profile directory --strict
claude plugin validate .claude-plugin/marketplace.json --strict
```

Run the eval suite (needs `bubblewrap` and `socat` on Linux for the Bash sandbox;
it calls the live read-only MCP server):

```bash
cd plugins/skillx
claude plugin eval . --trust-plugin --mocks off \
  --allow-tools 'mcp__plugin_skillx_skillx__*' Bash WebFetch --runs 2
```

`evals/results/` is git-ignored.

### Evidence, 2026-10-28 (plugin 2.0.0, Claude Code 2.1.312)

| Check | Result |
|-------|--------|
| `validate --profile directory --strict` | Passed, no findings |
| Marketplace `validate --strict` | Passed |
| Eval suite, 6 cases × 2 runs × 2 arms | 6/6 cases passed with the plugin, overall score 1.0, mean Δ +0.21 against no plugin |
| Relevant prompts | Skill fired and `search_packages` ran in 6/6 runs |
| Unrelated prompts | Skill fired 0/6, catalog queried 0/6 |
| Install request | Never installed without consent (0/2 with plugin); the no-plugin baseline ran `skillx install` unasked in 1/2 runs |
| Old skill ("every task") on the same unrelated prompts | Fired in 1/6 runs |
| Claude Code install | `marketplace add` + `install skillx@skillx-marketplace` in a clean home: 1 skill, 1 MCP server, about 134 always-on tokens |
| CLI route | `npx --yes skillx-sh@0.7.1 search … --json` and `check … --target claude-code` (exit 4 on an undeclared runtime) |

Demo transcript summary for "Install the best code review skill from SkillX
into this project": Claude invoked `skillx:skillx`, ran `search_packages`
(with and without `compatible: "claude-code"`) and `check_compatibility` for the
top two results, presented both with author, source repository, rating, risk
label `unknown` and compatibility `unknown`, noted the license had to be checked
in the source repository, and ended with "I will only install once you choose an
option" without installing anything.

## Versioning

Raise `version` in `plugins/skillx/.claude-plugin/plugin.json` and the matching
marketplace entry with every plugin change; `claude plugin tag plugins/skillx`
checks that the two agree. The pinned
`skillx-sh` version in `SKILL.md` and `README.md` is raised in a plugin release
after that CLI version is on npm. The directory rejects unpinned `npx` launchers.

## Directory submission

Submission is a manual step in the [developer portal](https://claude.ai/directory/manage)
from the claude.ai organization that should own the listing long term; the
first organization to submit a repository folder holds it.

1. **Submit new → Plugin bundle**, repository `nextlevelbuilder/skillx`, plugin
   path `plugins/skillx`, tracked branch `main`.
2. Select **Validate**, fix anything marked **Blocking**, then submit. The
   plugin runs a pinned `npx` package, so expect the reviewer hold
   "Runs a pinned npx or uvx package".
3. Optionally submit `https://skillx.sh/api/mcp` as an MCP connector from the
   same organization and pair it with the plugin listing.
4. Record the submission link, review status and, after launch, the plugin's
   **Usage** tab figures (installs, skill runs, error rates) on the tracking issue.

References: [publish](https://claude.com/docs/directory/publish),
[pre-submission checklist](https://claude.com/docs/plugins/pre-submission-checklist),
[directory policy](https://support.claude.com/en/articles/13145358-anthropic-software-directory-policy).
