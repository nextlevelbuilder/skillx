import { describe, expect, it, vi } from "vitest";

const searchSpy = vi.hoisted(() => vi.fn());
vi.mock("~/lib/search/search-executor", () => ({ executeSearch: searchSpy }));

import { applyDangerPolicy, omitDangerBody, searchPackages } from "./handlers-packages";

const pkg = { slug: "s", content: "SECRET BODY", contentIncluded: true };

describe("applyDangerPolicy", () => {
  it("drops content from a danger listing and says why", () => {
    const out = applyDangerPolicy(pkg, "danger") as Record<string, unknown>;
    expect(out).not.toHaveProperty("content");
    expect(out.contentIncluded).toBe(false);
    expect(String(out.contentOmitted)).toContain("danger");
    expect(out.slug).toBe("s");
  });

  it("leaves safe, caution, unknown and unlabelled listings untouched", () => {
    for (const label of ["safe", "caution", "unknown", null, undefined]) {
      expect(applyDangerPolicy(pkg, label)).toEqual(pkg);
    }
  });
});

describe("search_packages danger policy", () => {
  it("never returns the SKILL.md body of a danger hit, and keeps the others", async () => {
    searchSpy.mockResolvedValueOnce({
      results: [
        { slug: "bad", riskLabel: "danger", content: "SECRET BODY", final_score: 1 },
        { slug: "ok", riskLabel: "safe", content: "# fine", final_score: 0.5 },
      ],
    });
    const out = await searchPackages({ query: "x" }, { env: {} as Env, userId: null });
    const [bad, ok] = out.results as Array<Record<string, unknown>>;
    expect(bad).not.toHaveProperty("content");
    expect(String(bad.contentOmitted)).toContain("danger");
    expect(bad.slug).toBe("bad");
    expect(bad.final_score).toBe(1);
    expect(ok.content).toBe("# fine");
    expect(JSON.stringify(out)).not.toContain("SECRET BODY");
  });

  it("leaves non-danger hits identical", () => {
    const hit = { slug: "s", riskLabel: "unknown", content: "body" };
    expect(omitDangerBody(hit)).toBe(hit);
  });
});
