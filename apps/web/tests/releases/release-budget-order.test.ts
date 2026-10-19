import { describe, expect, it, vi } from "vitest";
import { RELEASE_FIXED_SUBREQUESTS } from "~/lib/releases/release-limits";
import { createHarness, file, tarOf } from "./release-harness";

const spies = vi.hoisted(() => ({ scan: vi.fn(), sign: vi.fn() }));

vi.mock("~/lib/releases/release-scan", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/releases/release-scan")>();
  return {
    ...actual,
    scanRelease: (...args: Parameters<typeof actual.scanRelease>) => {
      spies.scan();
      return actual.scanRelease(...args);
    },
  };
});
vi.mock("~/lib/releases/sign-manifest", async (importOriginal) => {
  const actual = await importOriginal<typeof import("~/lib/releases/sign-manifest")>();
  return {
    ...actual,
    signRelease: (...args: Parameters<typeof actual.signRelease>) => {
      spies.sign();
      return actual.signRelease(...args);
    },
  };
});

describe("release ingest order", () => {
  it("refuses an over-budget publish before scanning or signing", async () => {
    const h = await createHarness();
    const files = [file("SKILL.md", "---\nname: big\ndescription: d\n---\n")];
    for (let i = 0; i < 10; i++) files.push(file(`refs/${i}.md`, `${i}\n`));
    h.deps.subrequestBudget = RELEASE_FIXED_SUBREQUESTS + 5;
    const res = await h.upload("@alpha/big", tarOf(files));
    expect(res).toMatchObject({ status: 413, body: { error: { code: "tree.limit_exceeded" } } });
    expect(spies.scan).not.toHaveBeenCalled();
    expect(spies.sign).not.toHaveBeenCalled();
  });

  it("scans and signs a publish within budget", async () => {
    const h = await createHarness();
    const res = await h.upload("@alpha/ok", tarOf([file("SKILL.md", "---\nname: ok\ndescription: d\n---\n")]));
    expect(res.status).toBe(200);
    expect(spies.scan).toHaveBeenCalledTimes(1);
    expect(spies.sign).toHaveBeenCalledTimes(1);
  });
});
