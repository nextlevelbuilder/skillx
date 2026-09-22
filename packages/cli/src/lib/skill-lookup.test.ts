/**
 * Read-only skill lookup.
 *
 * Two properties matter: the slug queried is the same one `use` resolves, and the
 * `--target` value reaches the API so the version-aware answer is the server's,
 * not one the CLI invents.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ calls: [] as string[] }));

vi.mock("./api-client.js", () => ({
  apiRequest: async (endpoint: string) => {
    h.calls.push(endpoint);
    return { skill: { slug: "x", name: "X" } };
  },
}));

import { fetchSkillInspection, isActionable } from "./skill-lookup.js";

beforeEach(() => {
  h.calls.length = 0;
});

describe("fetchSkillInspection", () => {
  it("queries the mapped slug for a two-part identifier", async () => {
    const result = await fetchSkillInspection("vercel-labs/find-skills");
    expect(h.calls).toEqual(["/api/skills/vercel-labs-find-skills"]);
    expect(result.slug).toBe("vercel-labs-find-skills");
  });

  it("uses the org-skill slug for a three-part identifier", async () => {
    await fetchSkillInspection("org/repo/skill");
    expect(h.calls).toEqual(["/api/skills/org-skill"]);
  });

  it("passes a bare target through", async () => {
    await fetchSkillInspection("find-skills", "agentkit");
    expect(h.calls).toEqual(["/api/skills/find-skills?target=agentkit"]);
  });

  it("url-encodes a versioned target", async () => {
    await fetchSkillInspection("find-skills", "agentkit@1.4.0");
    expect(h.calls).toEqual(["/api/skills/find-skills?target=agentkit%401.4.0"]);
  });

  it("omits the query string when no target was asked for", async () => {
    await fetchSkillInspection("find-skills");
    expect(h.calls[0]).not.toContain("?");
  });

  it("refuses a search phrase instead of guessing a slug", async () => {
    await expect(fetchSkillInspection("ui ux design")).rejects.toThrow(/search phrase/);
    expect(h.calls).toEqual([]);
  });
});

describe("isActionable", () => {
  it("permits action only for declared and verified", () => {
    expect(isActionable("declared")).toBe(true);
    expect(isActionable("verified")).toBe(true);
  });

  it("never permits action for an undecidable or refused answer", () => {
    expect(isActionable("unknown")).toBe(false);
    expect(isActionable("unsupported")).toBe(false);
    expect(isActionable("blocked")).toBe(false);
  });

  it("treats a missing answer as not actionable", () => {
    expect(isActionable(null)).toBe(false);
    expect(isActionable(undefined)).toBe(false);
  });
});
