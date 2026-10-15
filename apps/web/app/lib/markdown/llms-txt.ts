/**
 * `llms.txt` and `llms-full.txt`.
 *
 * These follow the llmstxt.org shape: a single Markdown document an agent can
 * read in one request instead of crawling the catalog.
 *
 * `llms-full.txt` embeds SKILL.md bodies, so it obeys the same rule as every
 * other surface — only a granted payload is included. It is also bounded: this
 * catalog holds thousands of listings and an unbounded document would be both
 * unusably large and expensive to render per request, so it says when it is
 * truncated rather than silently stopping.
 *
 * Every entry states its scanner risk label. A `danger` body is never embedded,
 * and an embedded body sits in a fence it cannot close, so a SKILL.md cannot break
 * out of its block and pose as part of the surrounding document.
 */

import type { CompatibilitySummary } from "@skillx/contracts";
import { LLMS_FULL_MAX, LLMS_INDEX_MAX } from "./llms-limit";

export interface LlmsEntry {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  /** `skills.risk_label` from the content scanner: safe, caution, danger or unknown. */
  riskLabel?: string;
  compatibility?: CompatibilitySummary[];
  /** Present only when the payload was granted for this request. */
  content?: string;
}

export interface LlmsFullOptions {
  /** True when the catalog holds more listings than were rendered. */
  truncated: boolean;
}

function header(): string[] {
  return [
    "# SkillX",
    "",
    "> The Only Skill That Your AI Agent Needs. AI agent skills, published and discoverable.",
    "",
  ];
}

/**
 * A Markdown code fence that the body cannot close: one backtick longer than the
 * longest backtick run inside it, and never shorter than three.
 */
export function codeFence(body: string): string {
  let longest = 0;
  for (const match of body.matchAll(/`+/g)) longest = Math.max(longest, match[0].length);
  return "`".repeat(Math.max(3, longest + 1));
}

function summaryLabel(summary: CompatibilitySummary): string {
  return summary.status === "verified"
    ? `verified ${summary.verifiedAt?.slice(0, 10) ?? ""}`.trim()
    : summary.status;
}

export function renderLlmsTxt(siteUrl: string, entries: LlmsEntry[], truncated: boolean): string {
  const base = siteUrl.replace(/\/+$/, "");
  const lines = header();

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

  if (truncated) {
    lines.push(
      `_Listing the top ${entries.length} skills; the catalog holds more. Request a larger slice with \`?limit=\``,
      `(up to ${LLMS_INDEX_MAX}) or use \`POST ${base}/api/search\`._`,
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
  const lines = header();
  lines.push("## Skills", "");

  if (options.truncated) {
    lines.push(
      `_This document renders the top ${entries.length} skills; the catalog holds more. Raise \`?limit=\``,
      `(up to ${LLMS_FULL_MAX}), or read the remainder through ${base}/llms.txt and`,
      `\`POST ${base}/api/search\`._`,
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
    lines.push(`- **Risk:** ${entry.riskLabel ?? "unknown"}`);
    const compat = entry.compatibility ?? [];
    if (compat.length > 0) {
      lines.push(
        `- **Compatibility:** ${compat.map((s) => `${s.runtime} (${summaryLabel(s)})`).join(", ")}`,
      );
    }
    lines.push("");
    if (entry.description) lines.push(entry.description, "");
    if (entry.riskLabel === "danger") {
      lines.push(
        "> **Warning:** the content scanner flagged this skill as `danger`. Its SKILL.md body is",
        "> omitted here; review it on the canonical page before installing.",
        "",
      );
    } else if (typeof entry.content === "string") {
      const body = entry.content.trim();
      const fence = codeFence(body);
      lines.push(`${fence}markdown`, body, fence, "");
    } else {
      lines.push("_SKILL.md is not included: this listing's payload was not granted._", "");
    }
  }

  return lines.join("\n");
}
