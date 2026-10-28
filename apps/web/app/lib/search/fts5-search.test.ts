import { describe, expect, it } from "vitest";
import { fts5Search, toFts5Query } from "./fts5-search";

describe("toFts5Query", () => {
  it("OR-joins lowercased prefix terms", () => {
    expect(toFts5Query("deploy tool")).toBe("deploy* OR tool*");
  });

  it("splits on punctuation instead of gluing words together", () => {
    expect(toFts5Query("playwright end-to-end")).toBe("playwright* OR end* OR to* OR end*");
    expect(toFts5Query("node.js")).toBe("node* OR js*");
  });

  it("keeps non-ASCII words", () => {
    expect(toFts5Query("kiểm thử")).toBe("kiểm* OR thử*");
    expect(toFts5Query("テスト")).toBe("テスト*");
  });

  it("never emits an FTS5 operator, column filter or phrase", () => {
    const query = toFts5Query('do NOT use "AND" OR name:x NEAR(a) c++ ^start');
    expect(query).toBe("do* OR not* OR use* OR and* OR or* OR name* OR x* OR near* OR a* OR c* OR start*");
    expect(query).not.toMatch(/["():^+]/);
  });

  it("is empty when nothing searchable is left", () => {
    expect(toFts5Query(" --- !!! ")).toBe("");
  });
});

describe("fts5Search", () => {
  it("skips the database when the query has no searchable term", async () => {
    const db = { prepare: () => { throw new Error("should not query"); } } as unknown as D1Database;
    expect(await fts5Search(db, "?!")).toEqual([]);
  });

  it("binds the generated MATCH query", async () => {
    let bound: unknown[] = [];
    const db = {
      prepare: () => ({
        bind: (...params: unknown[]) => {
          bound = params;
          return { all: async () => ({ results: [{ skill_id: "a", bm25_score: -1 }] }) };
        },
      }),
    } as unknown as D1Database;
    const results = await fts5Search(db, "End-to-End", 5);
    expect(bound).toEqual(["end* OR to* OR end*", 5]);
    expect(results).toEqual([{ skill_id: "a", bm25_score: -1, rank: 1 }]);
  });
});
