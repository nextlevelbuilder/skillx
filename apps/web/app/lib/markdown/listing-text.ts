/**
 * Shared text policy for the agent surfaces (`llms-full.txt`, `/skills/<slug>.md`,
 * MCP `get_package`).
 *
 * Two rules live here so every surface applies them the same way:
 * - a `danger` listing never has its SKILL.md body embedded. `unknown` (rows that
 *   predate the scanner) and `caution` keep their bodies; the label is stated next
 *   to them so a reader can weigh it.
 * - listing metadata is publisher-controlled, so it is flattened to one line and
 *   stripped of leading Markdown syntax before it is written into a document.
 */

export const DANGER_BODY_NOTICE =
  "the content scanner flagged this skill as `danger`. Its SKILL.md body is omitted here; review it on the canonical page before installing.";

export function isDangerListing(riskLabel: string | null | undefined): boolean {
  return riskLabel === "danger";
}

/**
 * One line of inline text. Newlines collapse to spaces, a leading `#` or `>` is
 * escaped so the value cannot start a heading or quote, and backtick runs are
 * escaped so the value cannot open a code fence or span.
 */
export function inlineText(value: string | null | undefined): string {
  const flat = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/`/g, "\\`");
  return flat.replace(/^([#>])/, "\\$1");
}
