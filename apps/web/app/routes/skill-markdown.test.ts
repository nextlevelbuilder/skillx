/**
 * Route-level authorization tests for `GET /skills/:slug.md`.
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
    sessionUser: null as { id: string } | null,
  };
  return { state };
});

vi.mock("~/lib/db", () => ({ getDb: () => ({}) }));

vi.mock("~/lib/db/skill-detail-queries", () => ({
  fetchSkillBySlug: async () => h.state.row,
  fetchSkillReferences: async () => [],
}));

vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (h.state.sessionUser ? { user: h.state.sessionUser } : null),
}));

import { loader } from "./skill-markdown";

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

async function callLoader(slug: string | undefined = "find-skills") {
  const response = (await loader({
    params: { slug },
    request: new Request(`https://skillx.sh/skills/${slug ?? ""}.md`),
    context: { cloudflare: { env: { DB: {} } } },
  } as never)) as Response;
  return { response, text: await response.clone().text() };
}

beforeEach(() => {
  h.state.row = null;
  h.state.sessionUser = null;
});

describe("GET /skills/:slug.md — route-level payload boundary", () => {
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

  it("still withholds a protected body from an authenticated caller without an entitlement", async () => {
    // Entitlement resolution arrives in Phase 5; a session alone grants nothing.
    h.state.sessionUser = { id: "user_1" };
    h.state.row = skillRow({ is_paid: true, price_cents: 1500 });
    const { text } = await callLoader();

    expect(text).not.toContain("The canonical SKILL.md body text.");
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
