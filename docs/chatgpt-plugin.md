# ChatGPT Plugin

SkillX ships a read-only discovery plugin for the ChatGPT Plugin Directory: one Skill
(`skillx-discovery`) plus the SkillX remote MCP server. It searches the catalog and answers
with publisher, source, pinned release, compatibility and trust warnings. It never installs,
downloads or runs a skill. User-facing page: [`/docs/chatgpt`](https://skillx.sh/docs/chatgpt).

## Decision: Skill + remote MCP in the first submission

OpenAI does not support adding an MCP server to a listing that was first submitted as
Skills-only, and a submitted MCP URL cannot be changed later. The plugin therefore ships with
both from version 1.0.0:

- **Server:** `https://skillx.sh/api/mcp`, streamable HTTP, auth `none`
  (`integrations/chatgpt-plugin/mcp.json`).
- **Tools used:** `search_packages`, `get_package`, `get_release`, `check_compatibility`. All
  four run as the anonymous viewer, so the plugin only ever sees public listings and public,
  published releases. `get_kit` is listed by the server but the Skill never calls it.
- **Constraints this places on the MCP server** (coordinate with the remote MCP work in #140):
  keep serving this exact URL, keep protocol `2025-06-18` working for ChatGPT, keep every tool
  annotated read-only, and keep anonymous discovery working without credentials. Moving the
  server to `mixed` or OAuth auth later needs a resubmission check with OpenAI first.

## Package layout

```
integrations/chatgpt-plugin/
├── plugin.json                 # Agent Plugins manifest + extensions["com.openai"]
├── mcp.json                    # the one MCP server (streamable-http, auth none)
├── LICENSE                     # MIT, same as plugins/skillx
├── assets/                     # logo, logo-dark, composer-icon (square SVG)
└── skills/skillx-discovery/
    ├── SKILL.md                # ground rules, workflow, result card, install policy
    ├── references/result-states.md   # every tool answer mapped to what to tell the user
    └── agents/openai.yaml      # skill UI metadata + MCP dependency
```

`plugin.json` carries the review test cases (5 positive, 3 negative) that OpenAI reviewers
replay. Their prompts and expected answers were checked against production on 2026-10-28.

## Commands

```bash
pnpm plugin:chatgpt:check   # offline submission checks (scripts/chatgpt-plugin/validate-package.mjs)
pnpm plugin:chatgpt:pack    # validate, then build dist/chatgpt-plugin/skillx-<version>.zip
```

The check enforces the documented portal rules offline: manifest keys and lengths, HTTPS
URLs without credentials, brand colour contrast (2:1 against white and `#212121`), square
images of at least 48 px and at most 5 MiB, at most three default prompts, the test-case
shape and tool names, one streamable-HTTP MCP server, and no hooks, apps, test credentials or
client secrets. It prints what is still pending (demo URL, domain token) without failing.
The zip is deterministic (fixed timestamps), so the same source gives the same hash.
`apps/web/tests/chatgpt-plugin/package.test.ts` runs the same checks in `pnpm test`.

## Submission runbook (owner actions)

These need the OpenAI organization owner and cannot be done from the repository:

1. **Domain verification.** Copy the token from the portal, then
   `wrangler secret put OPENAI_APPS_CHALLENGE --name skillx-web`. The route
   `/.well-known/openai-apps-challenge` serves it as plain text and answers `404` while unset.
2. **Developer-mode test.** Connect `https://skillx.sh/api/mcp` in ChatGPT developer mode and
   run every prompt in `plugin.json` → `review.test_cases`.
3. **Demo recording.** Record those prompts, upload, and add
   `review.demo_recording_url` to `plugin.json`; `pnpm plugin:chatgpt:check` then stops
   listing it as pending.
4. **Portal scans.** Upload the zip from `pnpm plugin:chatgpt:pack`; fix anything the Skill
   or MCP scan reports, then submit.
5. **Legal review.** `/privacy`, `/terms` and `/support` describe current behaviour; have them
   reviewed before submission and add a contact email if the portal asks for one.

## Demo dataset (production, 2026-10-28)

| Case | Prompt | What production returns |
|------|--------|-------------------------|
| Search | "Find a SkillX skill for generating PDF reports" | PDF skills such as `vinhnx-pdf-report-generator`, all `riskLabel: unknown` |
| Detail | "Who publishes vercel-labs-find-skills…" | author `vercel-labs`, source `github.com/vercel-labs/skills/…`, `riskLabel: unknown`, no release |
| Compatibility | "Does vercel-labs-find-skills work with codex?" | `status: unknown` (must not be called compatible) |
| Ambiguous | "Show me the find-skills skill" | five publishers: vercel-labs, smallnest, NeverSight, wpank, Baltsat |
| Compare | "Compare the top 3 … Playwright browser testing …" | `korallis-playwright-automation`, `partme-ai-playwright`, `julianobarbosa-playwright-skill` |
| No match | nonsense query | nearest off-topic hits (search never returns zero); the Skill must call it no match |
| Private | `@someone/secret-tools` | `get_release` → `not_found` |

## Tested clients

| Client | Result |
|--------|--------|
| `@modelcontextprotocol/sdk` 1.x `StreamableHTTPClientTransport` | `initialize`, `tools/list`, `tools/call` work against production; `ping` works from this release on (production before it answered `Method not found`) |
| `curl` JSON-RPC (local build) | `ping`, `tools/list` with read-only annotations, the domain-challenge route and the new pages |
| ChatGPT developer mode | owner step 2 above |

## Limitations

- **Anonymous only.** No private library, entitlements or kits; private packages answer
  `not_found` and the Skill does not speculate.
- **Mostly unpinned.** Most listings predate signed releases, so results are usually an
  "unpinned listing" with no verified install path.
- **Compatibility is sparse.** Most listings declare nothing, so `unknown` is common.
- **Search always returns neighbours.** Hybrid search ranks the nearest listings even when
  nothing fits; the Skill filters off-topic hits itself.
- **Danger bodies withheld.** `search_packages` and `get_package` omit the SKILL.md body of a
  `danger` listing and add `contentOmitted`.
- **No installs from ChatGPT.** Installing happens in Claude Code or Codex with
  `npx skillx-sh install @publisher/name@version --runtime <claude-code|codex> --dry-run`, and
  only for a pinned release.
