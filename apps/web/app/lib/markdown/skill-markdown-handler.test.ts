/**
 * Handler-level authorization tests for `GET /skills/<slug>.md`.
 *
 * This route is a payload surface: it renders a SKILL.md body into a document
 * that an agent will read and a browser will copy to the clipboard. The
 * renderer's own tests pin the rendering rules, and this file exercises the real
 * handler and asserts on the real response body, because the property that
 * matters — a protected body never appears in the document — is only true if the
 * route wires the gate up at all.
 *
 * The query layer is replaced so the loader runs unmodified; only storage is
 * faked.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    row: null as Record<string, unknown> | null,
    sessionReads: 0,
  };
  return { state };
});

vi.mock("~/lib/db", () => ({ getDb: () => ({}) }));

vi.mock("~/lib/db/skill-detail-queries", () => ({
  fetchSkillBySlug: async () => h.state.row,
  fetchSkillReferences: async () => [],
}));

// The document is public: reading a session would make the public cache wrong.
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => {
    h.state.sessionReads += 1;
    return { user: { id: "user_1" } };
  },
}));

import { handleSkillMarkdown, matchSkillMarkdownPath } from "./skill-markdown-handler";

const BODY = "# Find Skills\n\nThe canonical SKILL.md body text.";

function skillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "skill_1",
    slug: "find-skills",
    name: "Find Skills",
    description: "Discovery helper",
    author: "vercel",
    category: "discovery",
    content: BODY,
    is_paid: false,
    price_cents: 0,
    avg_rating: 4.5,
    rating_count: 2,
    install_count: 10,
    version: "1.0.0",
    source_url: null,
    install_command: "skillx use find-skills",
    risk_label: "safe",
    scripts: null,
    compatibility_json: null,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...overrides,
  };
}

async function callLoader(slug = "find-skills", init?: RequestInit) {
  const response = await handleSkillMarkdown(
    new Request(`https://skillx.sh/skills/${slug}.md`, init),
    { DB: {} } as unknown as Env,
    slug,
  );
  return { response, text: await response.clone().text() };
}

beforeEach(() => {
  h.state.row = null;
  h.state.sessionReads = 0;
});

describe("GET /skills/<slug>.md — payload boundary", () => {
  it("serves the SKILL.md body of a free listing to an anonymous caller", async () => {
    h.state.row = skillRow();
    const { response, text } = await callLoader();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("text/markdown");
    expect(text).toContain(BODY);
  });

  it("never serves the body of a protected listing to an anonymous caller", async () => {
    h.state.row = skillRow({ is_paid: true, price_cents: 1500 });
    const { response, text } = await callLoader();

    expect(response.status).toBe(200);
    expect(text).not.toContain("The canonical SKILL.md body text.");
    expect(text).toContain("is protected");
  });

  it("withholds a protected body even when the request carries a session cookie", async () => {
    h.state.row = skillRow({ is_paid: true, price_cents: 1500 });
    const { text } = await callLoader("find-skills", { headers: { Cookie: "better-auth.session_token=x" } });

    expect(text).not.toContain("The canonical SKILL.md body text.");
    expect(h.state.sessionReads).toBe(0);
  });

  it("is publicly cacheable because the body never depends on the viewer", async () => {
    h.state.row = skillRow();
    const { response } = await callLoader();

    expect(response.headers.get("Cache-Control")).toBe("public, max-age=300");
    expect(response.headers.get("Vary")).toBeNull();
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(h.state.sessionReads).toBe(0);
  });

  it("still describes a withheld listing, so it does not look like an empty skill", async () => {
    h.state.row = skillRow({ is_paid: true });
    const { text } = await callLoader();

    expect(text).toContain("# Find Skills");
    expect(text).toContain("- **Author:** vercel");
    expect(text).toContain("## SKILL.md");
  });

  it("names the HTML canonical in a Link header", async () => {
    h.state.row = skillRow();
    const { response } = await callLoader();

    expect(response.headers.get("Link")).toBe(
      '<https://skillx.sh/skills/find-skills>; rel="canonical"',
    );
  });

  it("returns 404 for an unknown slug", async () => {
    h.state.row = null;
    const { response, text } = await callLoader("does-not-exist");

    expect(response.status).toBe(404);
    expect(text).not.toContain("## SKILL.md");
  });

  it("returns 400 when the slug is absent rather than rendering a partial document", async () => {
    // An empty string, not `undefined`: a default parameter would supply the
    // real slug and quietly test the happy path instead.
    const { response } = await callLoader("");
    expect(response.status).toBe(400);
  });

  it("claims no runtime support when compatibility was never declared", async () => {
    h.state.row = skillRow();
    const { text } = await callLoader();

    expect(text).toContain("No runtime is declared");
    expect(text).not.toContain("verified");
  });

  it("does not turn malformed compatibility JSON into a claim", async () => {
    h.state.row = skillRow({ compatibility_json: "{not json" });
    const { text } = await callLoader();

    expect(text).toContain("No runtime is declared");
  });

  it("renders a declared runtime with the evidence tier it actually has", async () => {
    h.state.row = skillRow({
      compatibility_json: JSON.stringify({
        agentkit: { status: "declared", versions: ">=1.0.0" },
      }),
    });
    const { text } = await callLoader();

    const compatRow = text.split("\n").find((line) => line.startsWith("| agentkit |"));
    expect(compatRow).toBeDefined();
    expect(compatRow).toContain("| declared |");
    expect(compatRow).toContain(">=1.0.0");
    // A listing has no artifact digest, so it can never reach the verified tier.
    expect(compatRow).not.toContain("verified");
  });
});

describe("legacy slugs", () => {
  it("serves an aliased slug and points the canonical at the current slug", async () => {
    // `fetchSkillBySlug` resolves `skill_aliases`; the row carries the current slug.
    h.state.row = skillRow({ slug: "find-skills-v2" });
    const { response } = await callLoader("find-skills");

    expect(response.status).toBe(200);
    expect(response.headers.get("Link")).toBe('<https://skillx.sh/skills/find-skills-v2>; rel="canonical"');
  });
});

describe("matchSkillMarkdownPath", () => {
  it("extracts the slug from a Markdown skill path", () => {
    expect(matchSkillMarkdownPath("/skills/find-skills.md")).toBe("find-skills");
    expect(matchSkillMarkdownPath("/skills/a.b.md")).toBe("a.b");
    expect(matchSkillMarkdownPath("/skills/caf%C3%A9.md")).toBe("café");
  });

  it("leaves every other path to React Router", () => {
    for (const path of [
      "/skills/find-skills",
      "/skills/.md",
      "/skills/find-skills.md/",
      "/skills/a/b.md",
      "/api/skills/find-skills.md",
      "/skills/find-skills.mdx",
    ]) {
      expect(matchSkillMarkdownPath(path)).toBeNull();
    }
  });

  it("does not throw on malformed percent-encoding", () => {
    expect(matchSkillMarkdownPath("/skills/%E0%A4%A.md")).toBeNull();
  });
});
