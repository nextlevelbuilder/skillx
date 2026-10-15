/**
 * MCP slug lookups are alias-aware.
 *
 * A legacy slug recorded in `skill_aliases` must answer through MCP exactly as it
 * does on the web page and the detail API, and the answer names the canonical
 * slug so an agent can update what it stored. Runs the real migration chain and
 * the real query helpers against an in-memory D1.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { callTool } from "~/lib/mcp/tools";
import { FakeD1 } from "../releases/fake-d1";

let d1: FakeD1;

function skillValues(id: string, slug: string, compatibility: Record<string, unknown> | null = null) {
  return {
    id,
    name: `Name ${id}`,
    slug,
    description: "desc",
    content: "content",
    author: "author",
    category: "testing",
    version: "1.0.0",
    is_paid: false,
    price_cents: 0,
    avg_rating: 0,
    rating_count: 0,
    github_stars: 0,
    install_count: 0,
    risk_label: "safe",
    compatibility_json: compatibility === null ? null : JSON.stringify(compatibility),
    created_at: new Date(0),
    updated_at: new Date(0),
  };
}

async function call(name: string, args: Record<string, unknown>) {
  const env = { DB: d1.asD1() } as unknown as Env;
  const result = await callTool(name, args, { env, userId: null });
  return { isError: result.isError === true, body: JSON.parse(result.content[0].text) as Record<string, any> };
}

beforeEach(async () => {
  d1 = new FakeD1();
  await getDb(d1.asD1())
    .insert(skills)
    .values(skillValues("s1", "org-find-skills", { agentkit: { status: "declared", versions: ">=1.0.0" } }));
  d1.raw
    .prepare("INSERT INTO skill_aliases (slug, skill_id, reason, created_at) VALUES (?, ?, 'legacy', 1)")
    .run("find-skills-legacy", "s1");
});

describe("MCP alias-aware lookups", () => {
  it("check_compatibility resolves a legacy slug and returns the canonical one", async () => {
    const { isError, body } = await call("check_compatibility", { slug: "find-skills-legacy", target: "agentkit@1.2.0" });
    expect(isError).toBe(false);
    expect(body.found).toBe(true);
    expect(body.slug).toBe("org-find-skills");
    expect(body.status).toBe("declared");
  });

  it("get_package resolves a legacy slug to the canonical listing", async () => {
    const { body } = await call("get_package", { slug: "find-skills-legacy" });
    expect(body.found).toBe(true);
    expect(body.package.slug).toBe("org-find-skills");
    expect(body.compatibility.declared.map((s: { runtime: string }) => s.runtime)).toEqual(["agentkit"]);
  });

  it("answers an unknown slug with not_found and does not echo it", async () => {
    const { isError, body } = await call("get_package", { slug: "nothing-here-xyz" });
    expect(isError).toBe(false);
    expect(body).toEqual({ found: false, code: "not_found" });
  });
});
