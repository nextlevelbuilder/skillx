/**
 * `llms.txt` and `llms-full.txt`.
 *
 * These follow the llmstxt.org shape: a single Markdown document an agent can
 * read in one request instead of crawling the catalog.
 *
 * `llms-full.txt` embeds SKILL.md bodies, so it obeys the same rule as every
 * other surface — only a granted payload is included. It is also bounded: this
 * catalog holds thousands of listings and an unbounded document would be both
 * unusably large and expensive to render per request, so it reports exactly how
 * much it truncated rather than silently stopping.
 */

import type { CompatibilitySummary } from "@skillx/contracts";

export interface LlmsEntry {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  compatibility?: CompatibilitySummary[];
  /** Present only when the payload was granted for this request. */
  content?: string;
}

export interface LlmsFullOptions {
  /** Number of listings the catalog holds, so truncation is visible. */
  total: number;
  /** True when the entry list was cut short before rendering. */
  truncated: boolean;
}

function header(siteUrl: string): string[] {
  return [
    "# SkillX",
    "",
    "> The Only Skill That Your AI Agent Needs. AI agent skills, published and discoverable.",
    "",
  ];
}

function summaryLabel(summary: CompatibilitySummary): string {
  return summary.status === "verified"
    ? `verified ${summary.verifiedAt?.slice(0, 10) ?? ""}`.trim()
    : summary.status;
}

export function renderLlmsTxt(siteUrl: string, entries: LlmsEntry[], total: number): string {
  const base = siteUrl.replace(/\/+$/, "");
  const lines = header(base);

  lines.push("## Skills", "");
  for (const entry of entries) {
    const href = `${base}/skills/${entry.slug}.md`;
    const compat = entry.compatibility ?? [];
    const compatNote =
      compat.length > 0
        ? ` (${compat.map((s) => `${s.runtime}: ${summaryLabel(s)}`).join(", ")})`
        : "";
    lines.push(`- [${entry.name}](${href}): ${entry.description}${compatNote}`);
  }
  lines.push("");

  if (entries.length < total) {
    lines.push(
      `_Listing ${entries.length} of ${total} skills. The catalog is paginated; use the API`,
      `\`POST ${base}/api/search\` for the rest._`,
      "",
    );
  }

  lines.push(
    "## Optional",
    "",
    `- [Full skills document](${base}/llms-full.txt): every listed skill with its SKILL.md body`,
    `- [Search API](${base}/api/search): POST { query, compatible? } for filtered results`,
    "",
  );

  return lines.join("\n");
}

export function renderLlmsFullTxt(
  siteUrl: string,
  entries: LlmsEntry[],
  options: LlmsFullOptions,
): string {
  const base = siteUrl.replace(/\/+$/, "");
  const lines = header(base);
  lines.push("## Skills", "");

  if (options.truncated) {
    lines.push(
      `_This document renders ${entries.length} of ${options.total} skills. The remainder is`,
      `available through ${base}/llms.txt and the search API._`,
      "",
    );
  }

  for (const entry of entries) {
    lines.push(`### ${entry.name}`, "");
    lines.push(`- **Slug:** \`${entry.slug}\``);
    lines.push(`- **Author:** ${entry.author}`);
    lines.push(`- **Category:** ${entry.category}`);
    lines.push(`- **Canonical:** ${base}/skills/${entry.slug}`);
    lines.push(`- **Markdown:** ${base}/skills/${entry.slug}.md`);
    const compat = entry.compatibility ?? [];
    if (compat.length > 0) {
      lines.push(
        `- **Compatibility:** ${compat.map((s) => `${s.runtime} (${summaryLabel(s)})`).join(", ")}`,
      );
    }
    lines.push("");
    if (entry.description) lines.push(entry.description, "");
    if (typeof entry.content === "string") {
      lines.push("```markdown", entry.content.trim(), "```", "");
    } else {
      lines.push("_SKILL.md is not included: this listing's payload was not granted._", "");
    }
  }

  return lines.join("\n");
}
