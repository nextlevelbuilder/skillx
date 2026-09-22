/**
 * `llms.txt` and `llms-full.txt`.
 *
 * The two properties that matter: a listing whose payload was not granted is
 * marked as such rather than rendered blank, and truncation is always visible —
 * a document that silently stops mid-catalog makes an agent believe the catalog
 * ends there.
 */

import { describe, expect, it } from "vitest";
import { renderLlmsFullTxt, renderLlmsTxt, type LlmsEntry } from "./llms-txt";

const SITE = "https://skillx.sh";

function entry(overrides: Partial<LlmsEntry> = {}): LlmsEntry {
  return {
    slug: "find-skills",
    name: "Find Skills",
    description: "Discovery helper",
    author: "vercel",
    category: "discovery",
    ...overrides,
  };
}

describe("renderLlmsTxt", () => {
  it("opens with the catalog identity", () => {
    const out = renderLlmsTxt(SITE, [entry()], 1);
    expect(out.startsWith("# SkillX")).toBe(true);
    expect(out).toContain("## Skills");
  });

  it("links each skill to its Markdown resource", () => {
    const out = renderLlmsTxt(SITE, [entry()], 1);
    expect(out).toContain("- [Find Skills](https://skillx.sh/skills/find-skills.md): Discovery helper");
  });

  it("annotates compatibility when a runtime is declared", () => {
    const out = renderLlmsTxt(
      SITE,
      [
        entry({
          compatibility: [
            {
              runtime: "agentkit",
              status: "verified",
              versions: null,
              reasonCodes: [],
              verifiedAt: "2026-09-20T00:00:00.000Z",
              probeId: "p1",
            },
          ],
        }),
      ],
      1,
    );
    expect(out).toContain("(agentkit: verified 2026-09-20)");
  });

  it("says nothing about compatibility when nothing is declared", () => {
    const out = renderLlmsTxt(SITE, [entry({ compatibility: [] })], 1);
    expect(out).toContain(": Discovery helper\n");
    expect(out).not.toContain(": Discovery helper (");
  });

  it("names the truncation instead of stopping silently", () => {
    const out = renderLlmsTxt(SITE, [entry()], 5080);
    expect(out).toContain("Listing 1 of 5080 skills");
  });

  it("omits the truncation note when the catalog is fully listed", () => {
    const out = renderLlmsTxt(SITE, [entry()], 1);
    expect(out).not.toContain("Listing 1 of 1 skills");
  });

  it("advertises the sibling resources", () => {
    const out = renderLlmsTxt(SITE, [entry()], 1);
    expect(out).toContain("https://skillx.sh/llms-full.txt");
    expect(out).toContain("https://skillx.sh/api/search");
  });
});

describe("renderLlmsFullTxt", () => {
  it("embeds a granted SKILL.md body", () => {
    const out = renderLlmsFullTxt(SITE, [entry({ content: "# Find Skills\n\nBody." })], {
      total: 1,
      truncated: false,
    });
    expect(out).toContain("```markdown");
    expect(out).toContain("# Find Skills\n\nBody.");
  });

  it("marks a withheld body instead of rendering an empty one", () => {
    const out = renderLlmsFullTxt(SITE, [entry()], { total: 1, truncated: false });
    expect(out).toContain("payload was not granted");
    expect(out).not.toContain("```markdown");
  });

  it("states how many skills it left out", () => {
    const out = renderLlmsFullTxt(SITE, [entry()], { total: 5080, truncated: true });
    expect(out).toContain("renders 1 of 5080 skills");
  });

  it("carries per-skill links so an agent can fetch one skill directly", () => {
    const out = renderLlmsFullTxt(SITE, [entry()], { total: 1, truncated: false });
    expect(out).toContain("- **Canonical:** https://skillx.sh/skills/find-skills");
    expect(out).toContain("- **Markdown:** https://skillx.sh/skills/find-skills.md");
  });

  it("lists declared compatibility when present", () => {
    const out = renderLlmsFullTxt(
      SITE,
      [
        entry({
          compatibility: [
            {
              runtime: "agentkit",
              status: "declared",
              versions: null,
              reasonCodes: [],
              verifiedAt: null,
              probeId: null,
            },
          ],
        }),
      ],
      { total: 1, truncated: false },
    );
    expect(out).toContain("- **Compatibility:** agentkit (declared)");
  });
});
