/**
 * The gated catalog index that backs `llms.txt` and `llms-full.txt`.
 *
 * `llms-full.txt` embeds SKILL.md bodies, which makes this the highest-risk
 * surface in the product: a projection bug here publishes a protected payload to
 * an anonymous request. The properties pinned below are therefore the boundary
 * itself, not cosmetic output.
 */

import { describe, expect, it } from "vitest";
import type { Database } from "~/lib/db";
import { fetchPublicCatalogIndex } from "./public-catalog-index";

const TOTAL = 5080;

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "s1",
    slug: "find-skills",
    name: "Find Skills",
    description: "Discovery helper",
    author: "vercel",
    category: "discovery",
    content: "SECRET BODY",
    is_paid: 0,
    compatibility_json: null,
    ...overrides,
  };
}

/**
 * Minimal stub of the two query shapes this module issues: a limited ordered
 * select, and a `count()` select that is awaited directly.
 */
function stubDb(rows: Array<Record<string, unknown>>): Database {
  return {
    select: () => ({
      from: () => ({
        orderBy: () => ({ limit: async () => rows }),
        then: (resolve: (value: unknown) => unknown) =>
          Promise.resolve([{ value: TOTAL }]).then(resolve),
      }),
    }),
  } as unknown as Database;
}

describe("fetchPublicCatalogIndex", () => {
  it("returns the declared runtime summary for each listing", async () => {
    const withCompat = row({
      compatibility_json: JSON.stringify({
        agentkit: { status: "declared", versions: ">=1.0.0" },
      }),
    });
    const { entries } = await fetchPublicCatalogIndex(stubDb([withCompat]), { limit: 10 });
    expect(entries[0].compatibility?.map((c) => c.runtime)).toEqual(["agentkit"]);
  });

  it("omits content by default, even for a free listing", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row()]), { limit: 10 });
    expect(entries[0].content).toBeUndefined();
  });

  it("includes content for a free listing when asked", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row()]), {
      limit: 10,
      includeContent: true,
    });
    expect(entries[0].content).toBe("SECRET BODY");
  });

  it("withholds content for a protected listing even when asked", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row({ is_paid: 1 })]), {
      limit: 10,
      includeContent: true,
    });
    expect(entries[0].content).toBeUndefined();
    // The metadata still travels, so the listing is visibly present but unread.
    expect(entries[0].slug).toBe("find-skills");
  });

  it("reports the catalog total, not the size of the rendered slice", async () => {
    const { entries, total } = await fetchPublicCatalogIndex(stubDb([row()]), { limit: 200 });
    expect(entries).toHaveLength(1);
    expect(total).toBe(TOTAL);
  });

  it("returns no content key at all when the payload is withheld", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row({ is_paid: 1 })]), {
      limit: 10,
      includeContent: true,
    });
    expect(Object.hasOwn(entries[0], "content")).toBe(false);
  });
});
