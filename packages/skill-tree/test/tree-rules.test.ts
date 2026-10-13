import { describe, expect, it } from "vitest";
import { LIMITS, buildTree, checkLimits, headerMode } from "../src/tree";
import type { TreeEntry } from "../src/tree";
import { errorCodeOf } from "./vector-helpers";

describe("headerMode", () => {
  it.each([
    [0o100644, "100644"],
    [0o644, "100644"],
    [0o100755, "100755"],
    [0o170644, "100644"], // type bits are cleared, as Go's &^ 0o170000
  ])("maps %o to a mode class", (mode, want) => {
    expect(headerMode(mode)).toBe(want);
  });

  it.each([
    [2 ** 32 + 0o644, "040000000644"],
    [2 ** 32 + 0o100755, "040000100755"],
    [0o7777777 + 1, "010000000"],
    [-1, "0-1"],
    [-(2 ** 32) + 0o644, "0-37777777134"],
    [1.5, "01.4"],
    [Number.MAX_SAFE_INTEGER + 1, `0${(2 ** 53).toString(8)}`],
    [NaN, "0NaN"],
    [Infinity, "0Infinity"],
  ])("rejects %s without truncating it", (mode, want) => {
    expect(headerMode(mode)).toBe(want);
  });
});

describe("checkLimits", () => {
  const file = (size: number): TreeEntry => ({ path: "a.md", mode: "100644", size, sha256: "0".repeat(64) });

  it.each([NaN, 1.5, Infinity, 2 ** 53])("rejects size %s as tree.limit_exceeded", (size) => {
    expect(checkLimits([file(size)], 1, LIMITS)?.code).toBe("tree.limit_exceeded");
  });

  it("lets validation reject a negative size", async () => {
    expect(checkLimits([file(-1)], 1, LIMITS)).toBeNull();
    expect(await errorCodeOf(() => buildTree([file(-1)]))).toBe("tree.unsupported_entry");
  });
});
