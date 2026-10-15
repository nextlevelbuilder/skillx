/**
 * The gated catalog index that backs `llms.txt` and `llms-full.txt`.
 *
 * `llms-full.txt` embeds SKILL.md bodies, which makes this the highest-risk
 * surface in the product: a projection bug here publishes a protected payload to
 * an anonymous request. The query shape is pinned too, because this is also the
 * most expensive read an anonymous caller can trigger.
 */

import { describe, expect, it } from "vitest";
import type { Database } from "~/lib/db";
import { fetchPublicCatalogIndex } from "./public-catalog-index";

function row(overrides: Record<string, unknown> = {}) {
  return {
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

interface Recorded {
  columns: string[];
  limit: number | null;
  selects: number;
}

/** Stub of the one query this module issues: a column-limited, ordered, limited select. */
function stubDb(rows: Array<Record<string, unknown>>, recorded: Recorded = { columns: [], limit: null, selects: 0 }) {
  const db = {
    select: (columns?: Record<string, unknown>) => {
      recorded.selects += 1;
      recorded.columns = Object.keys(columns ?? {});
      return {
        from: () => ({
          orderBy: () => ({
            limit: async (n: number) => {
              recorded.limit = n;
              return rows.slice(0, n);
            },
          }),
        }),
      };
    },
  } as unknown as Database;
  return { db, recorded };
}

describe("fetchPublicCatalogIndex", () => {
  it("returns the declared runtime summary for each listing", async () => {
    const withCompat = row({
      compatibility_json: JSON.stringify({ agentkit: { status: "declared", versions: ">=1.0.0" } }),
    });
    const { entries } = await fetchPublicCatalogIndex(stubDb([withCompat]).db, { limit: 10 });
    expect(entries[0].compatibility?.map((c) => c.runtime)).toEqual(["agentkit"]);
  });

  it("does not read content at all for the index", async () => {
    const { db, recorded } = stubDb([row()]);
    const { entries } = await fetchPublicCatalogIndex(db, { limit: 10 });
    expect(recorded.columns).not.toContain("content");
    expect(entries[0].content).toBeUndefined();
  });

  it("reads only the rendered columns, plus content for the full document", async () => {
    const { db, recorded } = stubDb([row()]);
    await fetchPublicCatalogIndex(db, { limit: 10, includeContent: true });
    expect(recorded.columns.sort()).toEqual(
      ["author", "category", "compatibility_json", "content", "description", "is_paid", "name", "slug"].sort(),
    );
  });

  it("includes content for a free listing when asked", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row()]).db, { limit: 10, includeContent: true });
    expect(entries[0].content).toBe("SECRET BODY");
  });

  it("withholds content for a protected listing and leaves no content key", async () => {
    const { entries } = await fetchPublicCatalogIndex(stubDb([row({ is_paid: 1 })]).db, {
      limit: 10,
      includeContent: true,
    });
    expect(Object.hasOwn(entries[0], "content")).toBe(false);
    // The metadata still travels, so the listing is visibly present but unread.
    expect(entries[0].slug).toBe("find-skills");
  });

  it("issues one bounded select and no catalog-wide count", async () => {
    const { db, recorded } = stubDb([row()]);
    await fetchPublicCatalogIndex(db, { limit: 100 });
    expect(recorded.selects).toBe(1);
    expect(recorded.limit).toBe(101);
  });

  it("reports truncation from the probe row, and renders only the slice", async () => {
    const many = Array.from({ length: 4 }, (_, i) => row({ slug: `s${i}` }));
    const cut = await fetchPublicCatalogIndex(stubDb(many).db, { limit: 3 });
    expect(cut.truncated).toBe(true);
    expect(cut.entries.map((e) => e.slug)).toEqual(["s0", "s1", "s2"]);

    const whole = await fetchPublicCatalogIndex(stubDb(many).db, { limit: 4 });
    expect(whole.truncated).toBe(false);
    expect(whole.entries).toHaveLength(4);
  });
});
