---
name: hol-guard
description: Use when setting up HOL Guard, protecting local AI harnesses, reviewing Guard approvals or receipts, or scanning agent plugins, skills, MCP servers, and marketplace packages before use.
license: Apache-2.0
---

# HOL Guard

HOL Guard protects local AI harnesses before tools run. Use it for runtime safety, approval review, package verification, and auditable evidence around agent actions.

## Safety Rules

- Never read `.env` files.
- Never bypass Guard approvals.
- Do not claim a workspace is protected until a Guard command proves it.
- Prefer reversible Guard commands over manual harness configuration edits.
- Treat scanner failures as real until inspected.
- Preserve user changes and inspect `git status --short` before editing a repository.

## Install Check

Probe the CLIs directly so the check works across shells:

```bash
hol-guard --version
plugin-scanner --version
```

If `hol-guard` is missing and the user asked for runtime setup, prefer an isolated install:

```bash
pipx install hol-guard
```

If `plugin-scanner` is missing and scanning was requested, install its separate distribution:

```bash
pipx install plugin-scanner
```

Do not assume the `hol-guard` distribution provides the `plugin-scanner` command. If `pipx` is unavailable, explain that isolated CLI installation is recommended rather than silently modifying the user's Python environment.

After installing HOL Guard:

```bash
hol-guard status
hol-guard detect --json
```

## Protect a Local Harness

First detect the exact supported harness, then use Guard-owned setup:

```bash
hol-guard detect --json
hol-guard bootstrap
hol-guard install <harness>
hol-guard run <harness> --dry-run
hol-guard run <harness>
hol-guard doctor <harness> --json
hol-guard status
```

Supported harness names include:

- `codex`
- `claude-code`
- `copilot`
- `cursor`
- `gemini`
- `hermes`
- `openclaw`
- `opencode`
- `antigravity`

Use the exact detected harness rather than assuming another healthy harness protects the current session. Hermes has its own bootstrap flow:

```bash
hol-guard hermes bootstrap
```

## Review Approvals and Evidence

When Guard blocks or queues work:

```bash
hol-guard approvals
hol-guard approvals open
hol-guard receipts
hol-guard diff <harness>
```

For terminal-only resolution:

```bash
hol-guard approvals approve <request-id>
hol-guard approvals deny <request-id>
```

Only approve after reading the risk reason and understanding the requested scope.

For audit evidence:

```bash
hol-guard inventory
hol-guard abom --format json
hol-guard events
hol-guard explain <artifact-id>
```

Cloud sync is optional and user-directed:

```bash
hol-guard connect status
hol-guard sync
```

## Scan a Plugin or Skill Package

Use the separate scanner for Codex plugins, Claude Code project surfaces, skills, MCP server configs, and marketplace packages:

```bash
plugin-scanner lint <path>
plugin-scanner verify <path>
```

For JSON evidence:

```bash
plugin-scanner verify <path> --json
```

Do not execute an untrusted target repository merely to scan it. Scan its package or repository files directly.

## Report Results

State:

- the command that ran;
- what HOL Guard or plugin-scanner found;
- what remains blocked or risky;
- what evidence exists;
- the exact next command if the user must act.

Never claim protection, approval, or release readiness without command output proving it.
