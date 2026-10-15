/**
 * The Markdown renderer.
 *
 * The property that matters most is the one a renderer is most tempted to infer:
 * whether the SKILL.md body may be included. It is an explicit input, so an
 * omission can never be mistaken for a denial — and a denial is visible in the
 * output rather than silently blank.
 */

import { describe, expect, it } from "vitest";
import {
  renderSkillMarkdown,
  skillMarkdownUrl,
  skillPageUrl,
  type SkillMarkdownInput,
} from "./skill-markdown";

const SITE = "https://skillx.sh";
const BODY = "# Find Skills\n\nBody text.";

function input(overrides: Partial<SkillMarkdownInput> = {}): SkillMarkdownInput {
  return {
    siteUrl: SITE,
    skill: {
      slug: "find-skills",
      name: "Find Skills",
      description: "Discovery helper",
      author: "vercel",
      category: "discovery",
      version: "1.0.0",
      risk_label: "safe",
      avg_rating: 4.5,
      rating_count: 12,
      install_count: 340,
      install_command: "npx skillx-sh use vercel/find-skills",
      source_url: "https://github.com/vercel/find-skills",
      content: BODY,
    },
    payloadGranted: true,
    ...overrides,
  };
}

describe("url helpers", () => {
  it("builds the canonical page url", () => {
    expect(skillPageUrl(SITE, "find-skills")).toBe("https://skillx.sh/skills/find-skills");
  });

  it("normalizes a trailing slash so links stay stable", () => {
    expect(skillPageUrl("https://skillx.sh/", "find-skills")).toBe("https://skillx.sh/skills/find-skills");
  });

  it("appends .md for the alternate resource", () => {
    expect(skillMarkdownUrl(SITE, "find-skills")).toBe("https://skillx.sh/skills/find-skills.md");
  });
});

describe("renderSkillMarkdown — payload boundary", () => {
  it("includes the SKILL.md body when the payload is granted", () => {
    expect(renderSkillMarkdown(input())).toContain(BODY);
  });

  it("withholds the body when the payload is not granted, and says why", () => {
    const out = renderSkillMarkdown(input({ payloadGranted: false }));
    expect(out).not.toContain(BODY);
    expect(out).toContain("is protected");
    expect(out).toContain("## SKILL.md");
  });

  it("never leaks the body even when content is present but access was denied", () => {
    // The renderer must obey the decision, not the presence of the string.
    const out = renderSkillMarkdown(input({ payloadGranted: false }));
    expect(out).not.toContain("Body text.");
  });
});

describe("renderSkillMarkdown — content", () => {
  it("starts with the skill name and its description as a summary", () => {
    const out = renderSkillMarkdown(input());
    expect(out.startsWith("# Find Skills\n")).toBe(true);
    expect(out).toContain("> Discovery helper");
  });

  it("lists the facts an agent needs to act", () => {
    const out = renderSkillMarkdown(input());
    expect(out).toContain("- **Author:** vercel");
    expect(out).toContain("- **Install:** `npx skillx-sh use vercel/find-skills`");
    expect(out).toContain("- **Canonical:** https://skillx.sh/skills/find-skills");
  });

  it("omits facts it does not have rather than printing empty bullets", () => {
    const out = renderSkillMarkdown(
      input({ skill: { ...input().skill, version: null, source_url: null, install_command: null } }),
    );
    expect(out).not.toContain("- **Version:**");
    expect(out).not.toContain("- **Source:**");
    expect(out).not.toContain("- **Install:**");
  });

  it("states that nothing is declared when there is no compatibility entry", () => {
    const out = renderSkillMarkdown(input());
    expect(out).toContain("No runtime is declared");
    expect(out).toContain("unknown rather than as support");
  });

  it("distinguishes a verified probe from a bare declaration", () => {
    const out = renderSkillMarkdown(
      input({
        compatibility: [
          {
            runtime: "agentkit",
            status: "verified",
            versions: ">=1.0.0",
            reasonCodes: [],
            verifiedAt: "2026-09-20T10:00:00.000Z",
            probeId: "probe_001",
          },
          {
            runtime: "claude-code",
            status: "declared",
            versions: null,
            reasonCodes: ["COMPAT_EVIDENCE_ABSENT"],
            verifiedAt: null,
            probeId: null,
          },
        ],
      }),
    );
    expect(out).toContain("| agentkit | verified | >=1.0.0 | verified 2026-09-20 (probe probe_001) |");
    expect(out).toContain("| claude-code | declared | — | COMPAT_EVIDENCE_ABSENT |");
    expect(out).toContain("`unknown` is the absence of a claim and is not support");
  });

  it("renders references and scripts when present", () => {
    const out = renderSkillMarkdown(
      input({
        references: [{ title: "Docs", url: "https://example.com", type: "docs" }],
        scripts: [{ name: "setup.sh", command: "bash setup.sh" }],
      }),
    );
    expect(out).toContain("- [Docs (docs)](https://example.com)");
    expect(out).toContain("- setup.sh — `bash setup.sh`");
  });

  it("omits the references and scripts sections entirely when there are none", () => {
    const out = renderSkillMarkdown(input());
    expect(out).not.toContain("## References");
    expect(out).not.toContain("## Scripts");
  });
});
