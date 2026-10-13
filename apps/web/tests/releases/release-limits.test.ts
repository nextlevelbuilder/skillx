import { describe, expect, it, vi } from "vitest";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import {
  DEFAULT_RELEASE_SUBREQUEST_BUDGET,
  RELEASE_FIXED_SUBREQUESTS,
  RELEASE_SERVER_TREE_LIMITS,
  assertSubrequestBudget,
  releaseSubrequestBudget,
} from "~/lib/releases/release-limits";
import { createHarness, file, tarOf } from "./release-harness";

/** Workers Paid default subrequests per request. */
const PAID_SUBREQUEST_CAP = 10_000;

const thrown = (fn: () => void): unknown => {
  try {
    fn();
  } catch (e) {
    return e;
  }
  return undefined;
};

describe("release subrequest budget", () => {
  it("fits the largest accepted tree in the default budget, which stays at half the paid cap", () => {
    expect(RELEASE_SERVER_TREE_LIMITS.maxFiles).toBe(1000);
    expect(DEFAULT_RELEASE_SUBREQUEST_BUDGET).toBeLessThanOrEqual(PAID_SUBREQUEST_CAP / 2);
    expect(() => assertSubrequestBudget(RELEASE_SERVER_TREE_LIMITS.maxFiles)).not.toThrow();
  });

  it("refuses a plan over the budget with 413 tree.limit_exceeded", () => {
    expect(() => assertSubrequestBudget(600 - RELEASE_FIXED_SUBREQUESTS, 600)).not.toThrow();
    const error = thrown(() => assertSubrequestBudget(600 - RELEASE_FIXED_SUBREQUESTS + 1, 600));
    expect(error).toBeInstanceOf(ReleaseHttpError);
    expect(error).toMatchObject({ status: 413, code: "tree.limit_exceeded" });
  });

  it("reads the Worker var, falling back to the default when unset or malformed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(releaseSubrequestBudget({})).toBe(DEFAULT_RELEASE_SUBREQUEST_BUDGET);
    expect(releaseSubrequestBudget({ SKILLX_RELEASE_SUBREQUEST_BUDGET: " 600 " })).toBe(600);
    for (const bad of ["0", "-5", "1e3", "abc", "99999999"]) {
      expect(releaseSubrequestBudget({ SKILLX_RELEASE_SUBREQUEST_BUDGET: bad })).toBe(DEFAULT_RELEASE_SUBREQUEST_BUDGET);
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("refuses an upload over the configured budget with 413 before any R2 write", async () => {
    const h = await createHarness();
    const files = [file("SKILL.md", "---\nname: big\ndescription: d\n---\n")];
    for (let i = 0; i < 10; i++) files.push(file(`refs/${i}.md`, `${i}\n`));
    h.deps.subrequestBudget = RELEASE_FIXED_SUBREQUESTS + 5;
    const res = await h.upload("@alpha/big", tarOf(files));
    expect(res).toMatchObject({ status: 413, body: { error: { code: "tree.limit_exceeded" } } });
    expect(h.r2.putLog).toEqual([]);
    expect(h.releaseRows()).toEqual([]);
  });

  it("rejects a tree with more files than the server limit before any R2 write", async () => {
    const h = await createHarness();
    const files = [file("SKILL.md", "---\nname: big\ndescription: d\n---\n")];
    for (let i = 0; i < RELEASE_SERVER_TREE_LIMITS.maxFiles; i++) files.push(file(`refs/${i}.md`, `${i}\n`));
    const res = await h.upload("@alpha/big", tarOf(files));
    expect(res).toMatchObject({ status: 413, body: { error: { code: "tree.limit_exceeded" } } });
    expect(h.r2.putLog).toEqual([]);
  });
});
