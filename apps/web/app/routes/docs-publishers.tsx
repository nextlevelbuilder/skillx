/**
 * Publisher landing page.
 *
 * Everything stated here is checkable against the code, and the distinctions that
 * matter are the ones a publisher gets wrong: a listing declaration can reach
 * `declared` and never `verified`, and only the `published` release state
 * resolves. Saying that plainly on the page a publisher reads first is cheaper
 * than correcting a wrong expectation later.
 */

import { PageContainer } from "../components/layout/page-container";
import { DocsSubNav } from "../components/docs/docs-sub-nav";
import { CommandBox } from "../components/command-box";
import { Upload, ShieldCheck, Tag, FileCheck2 } from "lucide-react";
import type { MetaFunction } from "react-router";

export const meta: MetaFunction = () => [
  { title: "Publisher Guide — SkillX.sh" },
  {
    name: "description",
    content:
      "Publish an agent skill to SkillX: ownership checks, content scanning, compatibility declarations, and what `verified` actually requires.",
  },
];

const DECLARATION = `{
  "agentkit":  { "status": "declared", "versions": ">=1.0.0 <2.0.0" },
  "claude-code": { "status": "unsupported" }
}`;

const CODE_BLOCK =
  "overflow-x-auto rounded-lg border border-sx-border bg-sx-bg-elevated p-4 font-mono text-xs text-sx-fg-muted";

export default function DocsPublishers() {
  return (
    <PageContainer>
      <DocsSubNav />

      <div className="mb-8">
        <h1 className="font-mono text-3xl font-bold">Publish a skill</h1>
        <p className="mt-2 text-sx-fg-muted">
          Ship an agent skill, declare where it runs, and be honest about how you know.
        </p>
      </div>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <Upload className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">1. Publish from GitHub</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            Publishing needs an API key from your{" "}
            <span className="text-sx-fg">settings page</span>. Ownership of the repository is
            verified with a GitHub collaborator check, so you can only publish a repo you can
            already write to.
          </p>
          <div className="space-y-3">
            <CommandBox command="skillx publish owner/repo" />
            <CommandBox command="skillx publish owner/repo --path skills/my-skill --scan" />
            <CommandBox command="skillx publish owner/repo --dry-run" />
          </div>
          <p className="mt-4 text-sm text-sx-fg-muted">
            <code className="font-mono text-xs text-sx-accent">--dry-run</code> reports what would
            be published without writing anything, which is the cheapest way to check your layout.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <ShieldCheck className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">2. What gets scanned</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            Every SKILL.md is scanned for prompt injection, invisible Unicode, ANSI escapes, and
            shell injection. The result is stored as a risk label and shown on your listing:
            <span className="text-sx-fg"> safe</span>,
            <span className="text-yellow-400"> caution</span>,
            <span className="text-red-400"> danger</span>, or
            <span className="text-sx-fg-subtle"> unknown</span>.
          </p>
          <p className="text-sm text-sx-fg-muted">
            A label is a statement about the content, not about you. Zero-width characters and
            escape sequences are stripped before storage, so a `caution` result usually means a
            stray invisible character rather than anything deliberate.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <Tag className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">3. Declare where it runs</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            A compatibility declaration maps a runtime to a status and, for a supported runtime, a
            semver range:
          </p>
          <pre className={CODE_BLOCK}>
            <code>{DECLARATION}</code>
          </pre>
          <p className="mt-4 text-sm text-sx-fg-muted">
            Unknown runtimes, an unparseable range, and a version outside the declared range all
            resolve to <span className="text-sx-fg">blocked</span> rather than to silent support.
            Declaring nothing is <span className="text-sx-fg">unknown</span>, which is not the same
            as compatible and is never treated as compatibility by the API, the CLI, or an agent.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <div className="mb-6 flex items-center gap-3">
          <FileCheck2 className="text-sx-accent" size={24} />
          <h2 className="font-mono text-2xl font-semibold">4. Declared is not verified</h2>
        </div>

        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            Two tiers are shown on every listing, and they mean different things.{" "}
            <span className="text-sx-accent">declared</span> means you claim the runtime works.{" "}
            <span className="text-sx-accent">verified</span> means a probe recorded evidence
            against the exact artifact digest.
          </p>
          <p className="text-sm text-sx-fg-muted">
            A listing can reach `declared` and never `verified`, because a mutable listing has no
            artifact digest to bind evidence to. That is why listing a skill today shows a
            declaration and never a verified badge: claiming the stronger tier without the
            evidence would make the badge meaningless for everyone.
          </p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="mb-4 font-mono text-2xl font-semibold">Kinds and release states</h2>
        <div className="rounded-lg border border-sx-border bg-sx-bg-elevated p-6">
          <p className="mb-4 text-sm text-sx-fg-muted">
            A package is one of <span className="text-sx-fg">skill</span>,{" "}
            <span className="text-sx-fg">hook-pack</span>, or{" "}
            <span className="text-sx-fg">bundle</span>. Each release carries a state:{" "}
            <span className="text-sx-fg">draft</span>,{" "}
            <span className="text-sx-fg">quarantined</span>,{" "}
            <span className="text-sx-fg">published</span>, or{" "}
            <span className="text-sx-fg">yanked</span>. Only `published` resolves, so a draft or a
            yanked release is not served and a quarantine is never silent.
          </p>
          <p className="text-sm text-sx-fg-muted">
            Immutable releases and named versions arrive with the registry work; until then,
            publishing a skill registers and scans it without inventing a release history it
            cannot prove.
          </p>
        </div>
      </section>
    </PageContainer>
  );
}
