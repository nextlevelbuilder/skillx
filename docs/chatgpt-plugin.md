# ChatGPT plugin

SkillX ships a public plugin for the OpenAI plugin directory (ChatGPT and Codex). It lets
a user ask, in plain language, for an agent skill and get ranked, vetted results from the
SkillX catalog. The plugin is **read-only**: it never installs, enables or runs a skill.

## Package

The uploadable package is `integrations/chatgpt/plugin/` (Agent Plugins format). Brand
sources stay outside it in `integrations/chatgpt/brand/`.

| Path | Purpose |
|------|---------|
| `plugin.json` | Manifest and the `extensions["com.openai"]` listing: interface copy, links, brand colors, icons, onboarding skill, review test cases, release notes |
| `mcp.json` | One remote server, `https://skillx.sh/api/mcp` (streamable HTTP), auth `none` |
| `skills/skillx-discovery/` | The discovery skill: when to trigger, the tool workflow, the result card, pinning, compatibility, trust and untrusted-content rules |
| `skills/skillx-discovery/references/result-cases.md` | How to answer each result case (no match, ambiguous, danger, paid, quarantined, revoked, yanked, tool error) |
| `skills/setup/` | Onboarding skill shown on first use |
| `assets/logo.png`, `assets/composer-icon.png` | 512 px and 128 px PNGs rendered from `brand/logo.svg` |

Build the ZIP with `pnpm pack:chatgpt-plugin` (writes `dist/skillx-chatgpt-plugin-<version>.zip`,
or pass an output path). The archive is reproducible: the same tree yields the same bytes.

## Decisions

- **The remote MCP server ships in the first submission.** OpenAI does not support adding
  an MCP server to a listing that was approved as skills-only, and a skill alone cannot
  reach live catalog data. The plugin therefore uses the existing `/api/mcp` endpoint
  (`search_packages`, `get_package`, `get_release`, `check_compatibility`; `get_kit` is
  available but unused because it needs an account).
- **Anonymous access (`auth: none`).** Every tool the plugin relies on runs as the anonymous
  viewer, so no OAuth flow, account or reviewer credentials are needed. Moving the server to
  OAuth later (issue #140) changes the plugin's auth and needs a new plugin version and review.
- **Every tool is annotated read-only** (`readOnlyHint: true`, `destructiveHint: false`,
  `openWorldHint: false`), which the directory requires as explicit booleans.
- **Danger bodies never reach the model.** `search_packages` applies the same `danger` policy
  as `get_package` (body withheld, `contentOmitted` explains why). See
  [api-reference.md](./api-reference.md#post-apimcp).
- **Honest unknowns.** Undeclared compatibility is `unknown`, never support; an unscanned
  listing is "safety unknown", never safe; popularity is never presented as a safety signal.
  Catalog listings carry no release digest, so their cards say "Unpinned listing"; only
  registry releases (`@publisher/slug`) are presented as pinned.
- **Installation stays manual.** When the user decides to adopt a skill the discovery skill
  gives the source and the `npx skillx-sh use <slug>` command (the npm package is `skillx-sh`;
  see issue #142), and says the command fetches the current, unpinned listing.

## Listing pages

The listing links `https://skillx.sh/privacy`, `/terms` and `/support` (routes `privacy.tsx`,
`terms.tsx`, `support.tsx`). The privacy policy covers what the plugin sends: tool arguments
only, never the conversation; search text is embedded by Workers AI and not stored; client IP
is used only as a short-lived rate-limit key.

## Verification

- `apps/web/tests/chatgpt-plugin/plugin-manifest.test.ts` validates `plugin.json` and `mcp.json`
  against the vendored Agent Plugins schemas (`tests/chatgpt-plugin/schemas/`) and enforces
  OpenAI's field limits, icon sizes, brand-color contrast, the five positive and three negative
  review cases, and package contents (no hooks, app mappings or credentials).
- `apps/web/tests/chatgpt-plugin/plugin-skills.test.ts` checks the skills: trigger scope, only
  real tool names, the install and untrusted-content rules, relative links, and that every
  listing URL is a registered route.
- `apps/web/app/lib/mcp/discovery-scenarios.test.ts` drives each result case through `callTool`.

The OpenAI schema deviation is documented in the manifest test: OpenAI places MCP auth under
the server's `extensions["com.openai"]`, which the strict Agent Plugins MCP schema does not list.

## Submitting

These steps need a person with the OpenAI organization owner role:

1. Deploy the web app so `/privacy`, `/terms` and `/support` are live, and confirm
   `https://skillx.sh/api/mcp` answers `tools/list` with the annotations.
2. Record a demo of the positive test cases in ChatGPT and add its URL as
   `extensions["com.openai"].review.demo_recording_url` (required before submission).
3. Run `pnpm pack:chatgpt-plugin` and upload the ZIP in the OpenAI Platform plugin dashboard;
   resolve any portal scan findings, then submit for review.
4. A later change to tools, auth or listing copy ships as a new `version` and a new review.

## Limitations

- Results come from catalog listings, which are mutable and unpinned; there is no link yet
  from a listing to a registry package, so a search result cannot be pinned to a release.
- Most catalog rows have no declared compatibility and many were created before the scanner
  ran, so `unknown` is common in both columns.
- Search results include third-party SKILL.md text (except `danger` bodies); the skill tells
  the model to treat it as data, never as instructions.
