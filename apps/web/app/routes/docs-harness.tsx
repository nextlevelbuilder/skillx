/**
 * Harness integration landing page.
 *
 * Aimed at whoever is wiring an agent runtime into SkillX, so it leads with the
 * read surfaces an agent can use without scraping HTML, then the one semantic that
 * causes the most wrong answers downstream: `unknown` is the absence of a claim,
 * not support.
 */

import { PageContainer } from "../components/layout/page-container";
import { DocsSubNav } from "../components/docs/docs-sub-nav";
import { CommandBox } from "../components/command-box";
import { FileText, PlugZap, GitCompare, Lock } from "lucide-react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Harness Integration — SkillX.sh" },
  {
    name: "description",
    content:
      "Integrate an agent runtime with SkillX: Markdown and llms.txt surfaces, the remote MCP endpoint and its tools, and how compatibility is decided.",
  },
];

const TOOLS: Array<[string, string]> = [
  ["search_packages", "Hybrid search, with an optional runtime filter"],
  ["get_package", "One listing: metadata, references, scripts, declaration"],
  ["get_release", "Immutable releases for a package, newest first"],
  ["check_compatibility", "Whether one listing supports a runtime or runtime@version"],
  ["get_kit", "A published kit (collection revision) and its members"],
];

const CODE_BLOCK =
  "overflow-x-auto rounded-lg border border-sx-border bg-sx-bg-elevated p-4 font-mono text-xs text-sx-fg-muted";

export default function DocsHarness() {
  return (
    <PageContainer>
      <DocsSubNav />

      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">Integrate a harness</h1>
        <p className="mt-2 text-sx-fg-muted">
          Read the catalog without scraping HTML, and get compatibility answers you can trust.
        </p>
      </div>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <FileText className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">1. Discovery in Markdown</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <div className="space-y-3">
            <CommandBox command="curl https://skillx.sh/llms.txt" />
            <CommandBox command="curl https://skillx.sh/llms-full.txt?limit=50" />
            <CommandBox command="curl https://skillx.sh/skills/find-skills.md" />
          </div>
          <p className="mt-4 text-sm text-sx-fg-muted">
            <span className="font-mono text-xs text-sx-fg">/llms.txt</span> is the index and{" "}
            <span className="font-mono text-xs text-sx-fg">/llms-full.txt</span> includes published
            SKILL.md bodies. Both are bounded and both say how much they left out;{" "}
            <span className="font-mono text-xs text-sx-fg">?limit=</span> takes a larger slice. The
            catalog holds six figures of skills, so neither document is the whole catalog, and
            neither pretends to be.
          </p>
          <p className="mt-3 text-sm text-sx-fg-muted">
            Every skill page advertises its Markdown variant through{" "}
            <span className="font-mono text-xs text-sx-fg">rel=&quot;alternate&quot;</span>, and the
            Markdown response names the HTML canonical in a{" "}
            <span className="font-mono text-xs text-sx-fg">Link</span> header.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <PlugZap className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">2. Remote MCP</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            <span className="font-mono text-xs text-sx-fg">POST https://skillx.sh/api/mcp</span>{" "}
            speaks JSON-RPC 2.0 over the streamable-HTTP transport. The server is read-only, so it
            implements `initialize`, `tools/list`, and `tools/call`, and answers anything else with
            `method not found` rather than a stub. It does not open a server-sent event stream.
          </p>
          <pre className={CODE_BLOCK}>
            <code>{`{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "check_compatibility",
    "arguments": { "slug": "find-skills", "target": "agentkit@1.2.0" }
  }
}`}</code>
          </pre>
          <div className="mt-4 space-y-2">
            {TOOLS.map(([name, purpose]) => (
              <div key={name} className="flex flex-wrap items-baseline gap-x-3 text-sm">
                <code className="font-mono text-xs text-sx-accent">{name}</code>
                <span className="text-sx-fg-muted">{purpose}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-sm text-sx-fg-muted">
            A tool failure is a successful call whose result carries{" "}
            <span className="font-mono text-xs text-sx-fg">isError</span>, so the reason is
            readable. A listing that simply is not there comes back as{" "}
            <span className="font-mono text-xs text-sx-fg">found: false</span> with a reason code,
            because &ldquo;not in the registry&rdquo; and &ldquo;the call failed&rdquo; are
            different answers.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <GitCompare className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">3. What a status means</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            <span className="text-sx-accent">declared</span> is a publisher claim.{" "}
            <span className="text-sx-accent">verified</span> is evidence bound to the exact
            artifact digest.{" "}
            <span className="text-sx-fg">unsupported</span> and{" "}
            <span className="text-sx-fg">blocked</span> are decisions against a requested target.{" "}
            <span className="text-sx-fg">unknown</span> is the absence of a claim.
          </p>
          <p className="text-sm text-sx-fg-muted">
            Only `declared` and `verified` mean support, and a search filter never drops an
            undecidable listing silently: the response carries a report of how many were evaluated,
            matched, and left undecided, so a short result is explained rather than mysterious.
            Treating `unknown` as compatible is the single most common way an integration reports
            support it did not verify.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <Lock className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">4. Protected payloads</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            Public listings return their SKILL.md content. A protected listing answers with
            metadata and no body, and says so — in the JSON it omits `content`, and in Markdown it
            prints an explicit note instead of an empty section. An empty section would read as an
            empty skill.
          </p>
          <p className="text-sm text-sx-fg-muted">
            Browser pages that support the WebMCP draft API get three read tools (search, get
            skill, check compatibility) registered in-page. That is a progressive enhancement:
            everything above works without it.
          </p>
        </div>
      </section>
    </PageContainer>
  );
}
