/**
 * The `--compatible` filter contract.
 *
 * The property under test is honesty: a filter that drops undecidable listings
 * without saying so makes an agent believe the catalog is smaller than it is, and
 * treating `unknown` as support would make it install something a publisher never
 * said would run.
 */

import { describe, expect, it } from "vitest";
import type { CompatibilitySummary } from "@skillx/contracts";
import {
  applyCompatibilityFilter,
  compatibilityPoolSize,
  emptyFilterNote,
  INVALID_COMPATIBLE_MESSAGE,
  isPoolExhausted,
  MAX_COMPATIBILITY_POOL,
  parseCompatibilityFilter,
} from "./compatibility-filter";
import type { SearchResult } from "./search-result-projection";

function result(slug: string, compatibility?: CompatibilitySummary[]): SearchResult {
  const base = { slug };
  return (compatibility ? { ...base, compatibility } : base) as unknown as SearchResult;
}

function summary(runtime: string, status: CompatibilitySummary["status"]): CompatibilitySummary {
  return { runtime, status, versions: null, reasonCodes: [], verifiedAt: null, probeId: null };
}

const FILTER = { runtime: "agentkit" };

describe("applyCompatibilityFilter", () => {
  it("keeps a listing that declares the runtime", () => {
    const outcome = applyCompatibilityFilter([result("a", [summary("agentkit", "declared")])], FILTER, 20);
    expect(outcome.results.map((r) => r.slug)).toEqual(["a"]);
    expect(outcome.report.matched).toBe(1);
  });

  it("keeps a verified listing", () => {
    const outcome = applyCompatibilityFilter([result("a", [summary("agentkit", "verified")])], FILTER, 20);
    expect(outcome.report.matched).toBe(1);
  });

  it("counts a listing that declares nothing as undecided rather than dropping it silently", () => {
    const outcome = applyCompatibilityFilter([result("bare")], FILTER, 20);
    expect(outcome.results).toEqual([]);
    expect(outcome.report).toMatchObject({ evaluated: 1, matched: 0, undecided: 1, refused: 0 });
  });

  it("counts a listing that declares a different runtime as undecided", () => {
    const outcome = applyCompatibilityFilter(
      [result("a", [summary("claude-code", "declared")])],
      FILTER,
      20,
    );
    expect(outcome.report).toMatchObject({ undecided: 1, matched: 0 });
  });

  it.each(["unsupported", "blocked"] as const)("refuses a %s declaration", (status) => {
    const outcome = applyCompatibilityFilter([result("a", [summary("agentkit", status)])], FILTER, 20);
    expect(outcome.results).toEqual([]);
    expect(outcome.report).toMatchObject({ refused: 1, undecided: 0 });
  });

  it("reports exact counts across a mixed page", () => {
    const outcome = applyCompatibilityFilter(
      [
        result("ok", [summary("agentkit", "declared")]),
        result("bare"),
        result("other", [summary("claude-code", "declared")]),
        result("no", [summary("agentkit", "unsupported")]),
        result("blocked", [summary("agentkit", "blocked")]),
      ],
      FILTER,
      20,
    );
    expect(outcome.report).toEqual({
      runtime: "agentkit",
      evaluated: 5,
      matched: 1,
      undecided: 2,
      refused: 2,
      poolExhausted: false,
    });
  });

  it("truncates matches to the requested limit but still reports every match found", () => {
    const rows = Array.from({ length: 5 }, (_, i) => result(`s${i}`, [summary("agentkit", "declared")]));
    const outcome = applyCompatibilityFilter(rows, FILTER, 2);
    expect(outcome.results).toHaveLength(2);
    expect(outcome.report.matched).toBe(5);
  });

  it("propagates poolExhausted so a caller knows matches may exist beyond the pool", () => {
    const outcome = applyCompatibilityFilter([result("a", [summary("agentkit", "declared")])], FILTER, 20, true);
    expect(outcome.report.poolExhausted).toBe(true);
  });
});

describe("compatibilityPoolSize", () => {
  it("over-fetches so filtering still fills a page", () => {
    expect(compatibilityPoolSize(20)).toBe(100);
    expect(compatibilityPoolSize(5)).toBe(25);
  });

  it("never exceeds the hard cap", () => {
    expect(compatibilityPoolSize(10_000)).toBe(MAX_COMPATIBILITY_POOL);
  });

  it("never returns less than the requested page", () => {
    expect(compatibilityPoolSize(0)).toBe(0);
  });
});

describe("isPoolExhausted", () => {
  it("is true whenever the search filled the pool it asked for, not only the hard cap", () => {
    expect(isPoolExhausted(25, 25)).toBe(true);
    expect(isPoolExhausted(MAX_COMPATIBILITY_POOL, MAX_COMPATIBILITY_POOL)).toBe(true);
  });

  it("is false when the search returned fewer candidates than the pool", () => {
    expect(isPoolExhausted(24, 25)).toBe(false);
    expect(isPoolExhausted(0, 100)).toBe(false);
  });

  it("is false for an empty pool", () => {
    expect(isPoolExhausted(0, 0)).toBe(false);
  });
});

describe("parseCompatibilityFilter", () => {
  it("reads a bare runtime", () => {
    expect(parseCompatibilityFilter("agentkit")).toEqual({ ok: true, filter: { runtime: "agentkit" } });
  });

  it("tolerates a version without evaluating it here", () => {
    // Version-aware answers come from `skillx check --target`.
    expect(parseCompatibilityFilter("agentkit@1.4.0")).toEqual({ ok: true, filter: { runtime: "agentkit" } });
  });

  it("treats empty and whitespace-only values as no filter", () => {
    for (const value of ["", "   ", null, undefined]) {
      expect(parseCompatibilityFilter(value)).toEqual({ ok: true, filter: null });
    }
  });

  it("refuses a runtime outside the identifier grammar without echoing it", () => {
    for (const value of ["Agent Kit", "<script>", "@1.0.0", "a/b", "x".repeat(65), 42, {}]) {
      const parsed = parseCompatibilityFilter(value);
      expect(parsed).toEqual({ ok: false, error: INVALID_COMPATIBLE_MESSAGE });
    }
  });
});

describe("emptyFilterNote", () => {
  it("states the counts and that a missing declaration is not support", () => {
    const note = emptyFilterNote({
      runtime: "agentkit",
      evaluated: 12,
      matched: 0,
      undecided: 10,
      refused: 2,
      poolExhausted: false,
    });
    expect(note).toContain("agentkit");
    expect(note).toContain("10 declare nothing");
    expect(note).toContain("2 declare the runtime but refuse it");
    expect(note).toContain("is not support");
  });

  it("names the validated runtime and hints when the pool was full", () => {
    const note = emptyFilterNote({
      runtime: "agentkit",
      evaluated: 25,
      matched: 0,
      undecided: 25,
      refused: 0,
      poolExhausted: true,
    });
    expect(note).toContain("'agentkit'");
    expect(note).toContain("candidate pool was full");
  });

  it("says the query matched nothing instead of blaming compatibility", () => {
    const note = emptyFilterNote({
      runtime: "agentkit",
      evaluated: 0,
      matched: 0,
      undecided: 0,
      refused: 0,
      poolExhausted: false,
    });
    expect(note).toBe("The query matched no listings, so the compatibility filter had nothing to examine.");
  });
});
