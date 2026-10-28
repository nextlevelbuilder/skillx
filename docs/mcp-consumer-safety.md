# MCP consumer safety: provenance, red flags and install approval

How the remote MCP server (`POST /api/mcp`) tells a host, and the person
using it, what a recommended skill is and whether it is safe to activate.
Discoverable does not mean safe: anyone can publish a skill, so every answer
says what SkillX knows, labels what it does not know as `unknown`, and leaves
the install decision with the person.

Code: `apps/web/app/lib/mcp/trust.ts`, `handlers-install.ts`,
`handlers-packages.ts`, `handlers-releases.ts`. Tool reference:
[api-reference.md](./api-reference.md#post-apimcp).

## Rules

1. **Content is data, not instructions.** A SKILL.md body or a listing field
   never gains authority over host policy, secrets or tool execution because
   the server returned it. `initialize.instructions` says so, and a readable
   body carries `contentTrust`.
2. **Unknown stays unknown.** A catalog listing is mutable (`immutable: false`,
   `pinned: "unknown"`) and its author is publisher-declared
   (`origin.verified: "unknown"`). A listing that was never scanned has
   `scan.riskLabel: "unknown"`. A release without a recorded commit has
   `sourceProvenance: "unknown"`.
3. **Popularity is not safety.** Rating, installs, votes and rank never change
   `trust`; results carry a `notices` line saying so. `safe` means only that
   no scanner rule matched.
4. **One scanner.** Red flags come from the existing content scanner
   (`lib/security/content-scanner.ts`), the publish-time release scan
   (quarantine), the signed release manifest and `agentkit-exec.json`. A flag
   names a rule (`prompt-injection`, `env-access`, `executable-files`,
   `declared-secret-access`, ...), never the matched text.
5. **Fail closed, with a reason.** Every refusal carries a stable `code` and a
   readable `explanation`.
6. **Reading is not installing.** The server installs and runs nothing.

## Red-flag categories

| Category | Sources |
|----------|---------|
| `instruction_injection` | Prompt-injection phrases, `<system>`/`<assistant>`/`<human>` tags |
| `hidden_content` | Zero-width or bidi characters, ANSI escapes, long HTML comments, base64 blocks |
| `code_execution` | Shell substitution, `eval`/`exec`, `child_process`, `<script>`; declared subprocess |
| `credential_access` | `process.env`, `fs.readFile`; declared secrets |
| `remote_or_active_content` | `javascript:`/`data:text/html` URLs, URL shorteners, embedded frames and forms; declared network hosts |
| `scripts` | Declared scripts, files with mode 755 |
| `unknown_provenance` | No source commit, unverified publisher |

A protected (paid) listing whose body the caller cannot read gets no red
flags at all, so nothing about the body leaks through them.

## Hosts

| | Read-only host (ChatGPT app, chat client) | Installer-capable host (CLI, agent runtime) |
|---|---|---|
| Recommend | `search_packages` / `get_package`: show `trust` beside every result | Same |
| Decide | `prepare_install` with `host: "read_only"` (default) | `prepare_install` with `host: "installer"` |
| Install | Cannot. The answer has `installed: false`, links to the release and its signed manifest, and manual steps. Never report a successful install. | Show `trust` (executable files and declared permissions come from here, not from the dry-run), the red flags and the files `skillx install --dry-run '<ref>'` would write; run `skillx install '<ref>'` only after the person explicitly approves |
| Pin | `@publisher/slug@version#sha256:<digest>` | Same; the CLI refuses a different digest (`integrity_error`) |
| Scripts | Never run | Written (mode 755 kept), listed on stderr, never run |

`prepare_install` requires `version`, so a plan always names one immutable
release. Passing the `digest` the person reviewed turns any later change into
`digest_mismatch` instead of a silent substitution.

The CLI refuses a quarantined release, a revoked publisher and a different
digest. A version the publisher yanks after the plan still installs with a
warning (on stderr and in `--json` warnings), so a pinned recipe keeps
working; an installer host stops and re-plans when that warning appears.
The ref is single-quoted in the generated commands because `#` and a leading
`@` are special in some shells.

Red flags come from a fresh scan of the stored body, which had invisible
characters and ANSI escapes stripped before storage, while `scan.riskLabel`
was computed before that. A listing can therefore be `danger` without a
`hidden_content` flag.

## Refusal codes

| Code | When |
|------|------|
| `not_found` | Unknown, private, draft or unsigned; identical to an unknown package |
| `release_quarantined` | The publish-time scan quarantined the tree |
| `publisher_revoked` | Publisher suspended or revoked |
| `release_yanked` | The publisher withdrew the version |
| `digest_mismatch` | The release digest differs from the pinned one |
| `origin_mismatch` | The signed manifest names another package or version than the registry row |
| `release.storage_inconsistent` | The stored manifest is missing or its digest differs from the registry row |

## Tests

| Fixture | Test |
|---------|------|
| Malicious SKILL.md (injection, shell, env access) | `app/lib/mcp/trust.test.ts` |
| Popularity cannot raise the security state | `app/lib/mcp/trust.test.ts` |
| Protected body leaks nothing through red flags | `app/lib/mcp/trust.test.ts` |
| Quarantined, revoked, yanked, digest mismatch, substituted origin, private | `tests/releases/mcp-prepare-install.test.ts` |
| Private package indistinguishable from unknown, logs clean | `tests/releases/private-leak-matrix.test.ts` |
| CLI digest pin refuses a changed release | `packages/cli/src/lib/install/install-units.test.ts` |
