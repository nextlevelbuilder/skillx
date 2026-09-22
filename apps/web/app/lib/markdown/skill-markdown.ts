/**
 * Route-level Markdown renderer for a skill.
 *
 * Markdown exists so an agent can read a skill without scraping HTML, which
 * means the resource has to be as honest as the API: the SKILL.md payload is
 * included only when `payloadGranted` says the viewer may read it, and the
 * compatibility section distinguishes a declaration from a verified probe.
 *
 * `payloadGranted` is a required input rather than something inferred from the
 * presence of `content`. Inferring it would make an omission indistinguishable
 * from a deliberate denial, and this is exactly the boundary that must not be
 * left to inference.
 */

import type { CompatibilitySummary } from "@skillx/contracts";

export interface MarkdownReference {
  title: string;
  url: string | null;
  type?: string | null;
}

export interface MarkdownScript {
  name: string;
  command?: string | null;
  url?: string | null;
}

export interface SkillMarkdownInput {
  siteUrl: string;
  skill: {
    slug: string;
    name: string;
    description: string;
    author: string;
    category: string;
    version?: string | null;
    source_url?: string | null;
    install_command?: string | null;
    risk_label?: string | null;
    avg_rating?: number | null;
    rating_count?: number | null;
    install_count?: number | null;
    updated_at?: Date | string | number | null;
    content?: string;
  };
  references?: MarkdownReference[];
  scripts?: MarkdownScript[];
  compatibility?: CompatibilitySummary[];
  /** True only when the viewer may read the SKILL.md payload. */
  payloadGranted: boolean;
}

/** Public page URL. Trailing slashes are normalized so links stay stable. */
export function skillPageUrl(siteUrl: string, slug: string): string {
  return `${siteUrl.replace(/\/+$/, "")}/skills/${slug}`;
}

/** The Markdown variant of the same resource, for `rel=alternate`. */
export function skillMarkdownUrl(siteUrl: string, slug: string): string {
  return `${skillPageUrl(siteUrl, slug)}.md`;
}

function compatibilityTable(summaries: CompatibilitySummary[]): string {
  const rows = summaries.map((summary) => {
    const notes = summary.verifiedAt
      ? `verified ${summary.verifiedAt.slice(0, 10)}${summary.probeId ? ` (probe ${summary.probeId})` : ""}`
      : summary.reasonCodes.length > 0
        ? summary.reasonCodes.join(", ")
        : "declared only, no probe recorded";
    return `| ${summary.runtime} | ${summary.status} | ${summary.versions ?? "—"} | ${notes} |`;
  });

  return [
    "## Compatibility",
    "",
    "| Runtime | Status | Versions | Notes |",
    "|---|---|---|---|",
    ...rows,
    "",
    "`declared` means a publisher claims support. `verified` means evidence for this exact",
    "artifact is recorded. `unknown` is the absence of a claim and is not support.",
    "",
  ].join("\n");
}

export function renderSkillMarkdown(input: SkillMarkdownInput): string {
  const { skill, siteUrl } = input;
  const page = skillPageUrl(siteUrl, skill.slug);
  const lines: string[] = [];

  lines.push(`# ${skill.name}`, "");
  if (skill.description) lines.push(`> ${skill.description}`, "");

  const facts: Array<[string, string]> = [["Author", skill.author], ["Category", skill.category]];
  if (skill.version) facts.push(["Version", skill.version]);
  if (skill.risk_label) facts.push(["Risk", skill.risk_label]);
  if (skill.avg_rating !== null && skill.avg_rating !== undefined) {
    facts.push(["Rating", `${skill.avg_rating} (${skill.rating_count ?? 0})`]);
  }
  if (skill.install_count !== null && skill.install_count !== undefined) {
    facts.push(["Installs", String(skill.install_count)]);
  }
  if (skill.install_command) facts.push(["Install", `\`${skill.install_command}\``]);
  if (skill.source_url) facts.push(["Source", skill.source_url]);
  facts.push(["Canonical", page]);

  for (const [label, value] of facts) lines.push(`- **${label}:** ${value}`);
  lines.push("");

  const compatibility = input.compatibility ?? [];
  if (compatibility.length > 0) {
    lines.push(compatibilityTable(compatibility));
  } else {
    lines.push(
      "## Compatibility",
      "",
      "No runtime is declared. An agent should treat this as unknown rather than as support.",
      "",
    );
  }

  const references = input.references ?? [];
  if (references.length > 0) {
    lines.push("## References", "");
    for (const ref of references) {
      const label = ref.type ? `${ref.title} (${ref.type})` : ref.title;
      lines.push(ref.url ? `- [${label}](${ref.url})` : `- ${label}`);
    }
    lines.push("");
  }

  const scripts = input.scripts ?? [];
  if (scripts.length > 0) {
    lines.push("## Scripts", "");
    for (const script of scripts) {
      const suffix = script.command ? ` — \`${script.command}\`` : script.url ? ` — ${script.url}` : "";
      lines.push(`- ${script.name}${suffix}`);
    }
    lines.push("");
  }

  lines.push("## SKILL.md", "");
  if (input.payloadGranted && typeof skill.content === "string") {
    lines.push(skill.content.trim(), "");
  } else {
    lines.push(
      "This listing is protected and no entitlement was presented for this request, so its",
      `payload is not included here. Request it through the API with authorization: ${page}`,
      "",
    );
  }

  return lines.join("\n");
}
