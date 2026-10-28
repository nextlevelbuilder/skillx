/**
 * ChatGPT plugin guide.
 *
 * The page a ChatGPT user and an OpenAI reviewer land on from the plugin listing.
 * It says what the plugin does, what each answer means, and, as plainly, what it
 * will never do: install or run a skill from a chat.
 */

import { PageContainer } from "../components/layout/page-container";
import { DocsSubNav } from "../components/docs/docs-sub-nav";
import { MessageSquare, ShieldCheck, ListChecks, MonitorSmartphone } from "lucide-react";
import type { ReactNode } from "react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "ChatGPT Plugin — SkillX.sh" },
  {
    name: "description",
    content:
      "Use SkillX in ChatGPT to discover, compare and vet AI agent skills: publisher, source, pinned release, compatibility and trust warnings. Read-only.",
  },
];

const PROMPTS = [
  "Find a SkillX skill for reviewing pull requests",
  "Compare the top SkillX skills for Playwright browser testing for Claude Code",
  "Who publishes the SkillX skill vercel-labs-find-skills, and is it scanned?",
  "Which find-skills skills on SkillX work with Codex?",
];

const FIELDS: Array<[string, string]> = [
  ["Publisher and source", "The listing's author and its source repository, plus the SkillX page."],
  ["Release", "Pinned: a signed, immutable release with version and digest. Unpinned listing: no signed release, and the content can change."],
  ["Compatibility", "declared (publisher claim) or verified (evidence bound to the artifact digest) mean support. unknown means nobody claimed it."],
  ["Trust", "The content scanner's label (safe, caution, danger, unknown) and any quarantine, revocation or yank. Popularity is shown separately and never as safety."],
];

const CLIENTS: Array<[string, string]> = [
  ["ChatGPT (web, desktop, mobile)", "Plugin with the discovery skill and the SkillX MCP connector."],
  ["ChatGPT developer mode", "Add https://skillx.sh/api/mcp as a connector without the skill, for testing."],
  ["Codex, Claude Code and other MCP clients", "Same endpoint, streamable HTTP, no sign-in. Install pinned releases there with the skillx CLI."],
];

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="mb-12">
      <div className="mb-6 flex items-center gap-3">
        {icon}
        <h2 className="font-mono text-2xl font-semibold">{title}</h2>
      </div>
      <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6 text-sm text-sx-fg-muted">{children}</div>
    </section>
  );
}

export default function DocsChatgpt() {
  return (
    <PageContainer>
      <DocsSubNav />

      <div className="mb-8">
        <h1 className="mb-4 font-mono text-4xl font-bold">ChatGPT Plugin</h1>
        <p className="text-lg text-sx-fg-muted">
          Ask ChatGPT for a skill in plain words. SkillX searches its catalog and answers with who
          publishes each skill, where its source lives, whether a release is pinned, which runtimes
          it supports and what trust warnings apply. Discovery is read-only: nothing is installed
          or run from the chat.
        </p>
      </div>

      <Section icon={<MessageSquare className="text-sx-accent" size={24} />} title="1. Try it">
        <ul className="list-disc space-y-2 pl-5">
          {PROMPTS.map((prompt) => (
            <li key={prompt} className="font-mono text-xs text-sx-fg">
              {prompt}
            </li>
          ))}
        </ul>
        <p className="mt-4">
          When several skills share a name, SkillX lists each publisher and asks which one you
          mean. When nothing matches, it says so instead of suggesting a skill from memory.
        </p>
      </Section>

      <Section icon={<ListChecks className="text-sx-accent" size={24} />} title="2. Reading a result">
        <div className="space-y-3">
          {FIELDS.map(([name, meaning]) => (
            <div key={name}>
              <span className="font-mono text-xs text-sx-accent">{name}</span>
              <p className="mt-1">{meaning}</p>
            </div>
          ))}
        </div>
      </Section>

      <Section icon={<ShieldCheck className="text-sx-accent" size={24} />} title="3. What it will not do">
        <ul className="list-disc space-y-2 pl-5">
          <li>Install, download, enable or run a skill. Every tool it calls is read-only.</li>
          <li>Follow instructions written inside a listing. Listing text is treated as data.</li>
          <li>Show private packages, or say whether one exists. They answer as not publicly available.</li>
          <li>Treat installs, ratings or votes as proof of safety.</li>
        </ul>
        <p className="mt-4">
          To install a pinned release, review its source, then run the command ChatGPT shows you
          yourself, in Claude Code or Codex, for example{" "}
          <span className="font-mono text-xs text-sx-fg">
            npx skillx-sh install @publisher/name@1.2.0 --runtime codex --dry-run
          </span>
          . The installer verifies the signed digest before writing anything. Unpinned listings
          have no verified install path.
        </p>
      </Section>

      <Section icon={<MonitorSmartphone className="text-sx-accent" size={24} />} title="4. Clients and limits">
        <div className="space-y-3">
          {CLIENTS.map(([client, note]) => (
            <div key={client}>
              <span className="font-mono text-xs text-sx-fg">{client}</span>
              <p className="mt-1">{note}</p>
            </div>
          ))}
        </div>
        <p className="mt-4">
          The connector is anonymous, so it sees public listings only, not your private library or
          kits, and requests are rate limited per caller. Most catalog listings predate signed
          releases and declare no compatibility, so expect many unpinned listings and unknown
          compatibility. Privacy: https://skillx.sh/privacy. Help: https://skillx.sh/support.
        </p>
      </Section>
    </PageContainer>
  );
}
