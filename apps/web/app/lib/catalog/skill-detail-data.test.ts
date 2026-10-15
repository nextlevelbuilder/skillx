/**
 * The skill detail loader's compatibility contract.
 *
 * The badge is only as honest as the data behind it, so this pins the wiring:
 * a declared listing reaches the page, an undeclared one reports nothing rather
 * than an implied "works everywhere", and malformed JSON does not throw a page.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ row: null as Record<string, unknown> | null }));

vi.mock("~/lib/db/skill-detail-queries", () => ({
  fetchSkillBySlug: async () => h.row,
  fetchSkillReferences: async () => [],
  fetchSkillReviews: async () => [],
  fetchRatingSummary: async () => ({ avgRating: 0, ratingCount: 0 }),
  fetchRatingBreakdown: async () => ({ humanCount: 0, agentCount: 0 }),
  fetchFavoriteCount: async () => 0,
  fetchUsageStats: async () => ({ successRate: 0, totalUsages: 0, modelBreakdown: [] }),
  fetchUserSkillData: async () => ({ isFavorited: false, userRating: null }),
}));

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

import { loadSkillDetailData } from "./skill-detail-data";

const DECLARED = JSON.stringify({
  agentkit: { status: "declared", versions: ">=1.0.0 <2.0.0" },
  "claude-code": { status: "unsupported" },
});

function skillRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "skill_1",
    slug: "find-skills",
    name: "Find Skills",
    description: "Discovery helper",
    author: "vercel",
    category: "discovery",
    version: "1.0.0",
    content: "# Find Skills\n\nBody.",
    is_paid: false,
    price_cents: 0,
    risk_label: "safe",
    install_count: 0,
    avg_rating: 0,
    rating_count: 0,
    favorite_count: 0,
    net_votes: 0,
    install_command: "skillx use find-skills",
    source_url: null,
    scripts: null,
    compatibility_json: DECLARED,
    created_at: new Date(0),
    updated_at: new Date(0),
    ...overrides,
  };
}

function load() {
  return loadSkillDetailData({} as never, {} as never, new Request("https://skillx.sh/skills/x"), "find-skills");
}

beforeEach(() => {
  h.row = skillRow();
});

describe("loadSkillDetailData compatibility", () => {
  it("carries every declared runtime to the page", async () => {
    const data = await load();
    expect(data.compatibility.map((s) => `${s.runtime}:${s.status}`).sort()).toEqual([
      "agentkit:declared",
      "claude-code:unsupported",
    ]);
  });

  it("reports nothing declared rather than implying support", async () => {
    h.row = skillRow({ compatibility_json: null });
    expect((await load()).compatibility).toEqual([]);
  });

  it("survives malformed declaration JSON without failing the page", async () => {
    h.row = skillRow({ compatibility_json: "{not json" });
    expect((await load()).compatibility).toEqual([]);
  });

  it("keeps the protected payload boundary intact while adding compatibility", async () => {
    // Free listing: payload present. The compatibility wiring must not change that.
    expect((await load()).skill.content).toBe("# Find Skills\n\nBody.");
  });

  it("still strips the payload from a protected listing", async () => {
    h.row = skillRow({ is_paid: true, price_cents: 1500 });
    expect((await load()).skill).not.toHaveProperty("content");
  });
});
