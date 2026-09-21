import { describe, expect, it } from "vitest";
import {
  buildCatalogListingResponse,
  buildSkillDetailResponse,
  isProtectedListing,
  resolveSkillPayloadAccess,
} from "./protected-content";
import { parseScripts, toPublicCatalogListing, toPublicSkillDetail } from "./public-dto";
import type { SkillCatalogRow } from "./public-dto";

const SKILL_MD = "# Review Guardrails\n\nThe full SKILL.md payload.";

function row(overrides: Partial<SkillCatalogRow> = {}): SkillCatalogRow {
  return {
    id: "skill_1",
    slug: "review-guardrails",
    name: "Review Guardrails",
    description: "Guardrails for code review",
    author: "zuey",
    category: "code-review",
    version: "1.0.0",
    source_url: "https://github.com/zuey/skills/tree/main/review-guardrails",
    is_paid: false,
    price_cents: 0,
    risk_label: "safe",
    install_count: 12,
    avg_rating: 8.5,
    rating_count: 4,
    favorite_count: 3,
    net_votes: 7,
    install_command: "skillx use review-guardrails",
    updated_at: new Date("2026-09-15T10:00:00.000Z"),
    ...overrides,
  };
}

function source(overrides: Partial<{ slug: string; is_paid: boolean | null; content: string }> = {}) {
  return { slug: "review-guardrails", is_paid: false, content: SKILL_MD, ...overrides };
}

describe("public catalog DTO carries no protected payload", () => {
  it("omits content from the listing DTO", () => {
    const listing = toPublicCatalogListing(row());
    expect(Object.keys(listing)).not.toContain("content");
    expect(listing.slug).toBe("review-guardrails");
    expect(listing.isPaid).toBe(false);
    expect(listing.updatedAt).toBe("2026-09-15T10:00:00.000Z");
  });

  it("omits content from the detail DTO while keeping metadata", () => {
    const detail = toPublicSkillDetail(
      row(),
      [{ id: "ref_1", title: "Guide", filename: "guide.md", url: "https://example.com/g", type: "docs" }],
      [{ id: "rev_1", user_id: "user_1", content: "Solid", is_agent: false, created_at: new Date("2026-09-16T00:00:00.000Z") }],
      JSON.stringify([{ name: "lint", description: "Run lint", language: "bash" }]),
    );
    expect(Object.keys(detail)).not.toContain("content");
    expect(detail.references).toHaveLength(1);
    expect(detail.reviews).toHaveLength(1);
    expect(detail.scripts[0]?.name).toBe("lint");
    expect(detail.installCommand).toBe("skillx use review-guardrails");
  });

  it("tolerates absent or malformed scripts JSON", () => {
    expect(parseScripts(null)).toEqual([]);
    expect(parseScripts("{not json")).toEqual([]);
    expect(parseScripts('{"name":"lint"}')).toEqual([]);
    expect(parseScripts('[{"name":"lint"},{"nope":1}]')).toEqual([{ name: "lint" }]);
  });
});

describe("authorization regression: free versus protected listings", () => {
  it("treats only priced listings as protected", () => {
    expect(isProtectedListing({ is_paid: false })).toBe(false);
    expect(isProtectedListing({ is_paid: null })).toBe(false);
    expect(isProtectedListing({ is_paid: true })).toBe(true);
  });

  it("grants the SKILL.md payload for a free public listing", () => {
    const access = resolveSkillPayloadAccess(source());
    expect(access.granted).toBe(true);
    if (access.granted) expect(access.payload).toBe(SKILL_MD);
  });

  it("denies the payload for a paid listing with no entitlement", () => {
    const access = resolveSkillPayloadAccess(source({ is_paid: true }), {});
    expect(access.granted).toBe(false);
    if (!access.granted) {
      expect(access.reason).toBe("entitlement_required");
      expect(access.message).toContain("review-guardrails");
    }
  });

  it("grants the payload for a paid listing when an entitlement exists", () => {
    const access = resolveSkillPayloadAccess(source({ is_paid: true }), { userId: "user_1", hasEntitlement: true });
    expect(access.granted).toBe(true);
  });

  it("keeps content on the detail response for free listings only", () => {
    const detail = toPublicSkillDetail(row());

    const free = buildSkillDetailResponse(detail, source());
    expect(free.content).toBe(SKILL_MD);

    const paid = buildSkillDetailResponse(detail, source({ is_paid: true }));
    expect(paid).not.toHaveProperty("content");
    expect(paid.slug).toBe("review-guardrails");
  });

  it("keeps content on search/listing responses for free listings only", () => {
    const listing = toPublicCatalogListing(row());

    const free = buildCatalogListingResponse(listing, source());
    expect(free.content).toBe(SKILL_MD);

    const paid = buildCatalogListingResponse(listing, source({ is_paid: true }));
    expect(paid).not.toHaveProperty("content");
    expect(paid.name).toBe("Review Guardrails");
  });

  it("never surfaces the payload for a protected listing to an anonymous viewer", () => {
    const paidRow = toPublicCatalogListing(row({ is_paid: true, price_cents: 500 }));
    const response = buildCatalogListingResponse(paidRow, source({ is_paid: true }));
    expect(JSON.stringify(response)).not.toContain("SKILL.md payload");
  });
});
