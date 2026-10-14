import { describe, expect, it } from "vitest";
import { PersonalKitError } from "./codes";
import { decodeBase64, encodeBase64, textOf } from "./bytes";
import { mergeThreeWay } from "./three-way-merge";
import { applyPatch, formatPatch } from "./unified-patch";

const lines = (...xs: string[]) => xs.map((x) => `${x}\n`).join("");
const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (error) {
    return error instanceof PersonalKitError ? `${error.code} ${error.detail.split(":")[0]}` : String(error);
  }
  return "ok";
};

describe("unified patch", () => {
  it("round-trips formatPatch through applyPatch", () => {
    const a = lines("a", "b", "c", "d", "e", "f", "g", "h", "i", "j");
    const b = lines("a", "B", "c", "d", "e", "f", "g", "h", "I", "j", "k");
    const patch = formatPatch(a, b)!;
    expect(patch.startsWith("@@ -1,")).toBe(true);
    expect(applyPatch(a, patch)).toBe(b);
  });

  it("handles a missing final newline on either side", () => {
    expect(applyPatch("x\ny", formatPatch("x\ny", "x\ny\n")!)).toBe("x\ny\n");
    expect(applyPatch("x\n", formatPatch("x\n", "x\nz")!)).toBe("x\nz");
    expect(formatPatch("same\n", "same\n")).toBeNull();
  });

  it("accepts a --- / +++ header and creation from empty", () => {
    const patch = `--- a/f\n+++ b/f\n${formatPatch("", "new\n")}`;
    expect(applyPatch("", patch)).toBe("new\n");
  });

  it("refuses fuzz: a shifted base is a base_mismatch conflict", () => {
    const patch = formatPatch(lines("a", "b", "c"), lines("a", "X", "c"))!;
    expect(codeOf(() => applyPatch(lines("z", "a", "b", "c"), patch))).toBe("overlay.conflict base_mismatch");
    expect(codeOf(() => applyPatch(lines("a", "q", "c"), patch))).toBe("overlay.conflict base_mismatch");
  });

  it("classifies malformed patches as overlay.invalid", () => {
    expect(codeOf(() => applyPatch("a\n", "garbage\n"))).toBe("overlay.invalid patch");
    expect(codeOf(() => applyPatch("a\n", "@@ -1,2 +1,2 @@\n a\n"))).toBe("overlay.invalid patch");
    expect(codeOf(() => applyPatch("a\n", ""))).toBe("overlay.invalid patch");
  });

  it("keeps CRLF line endings as content", () => {
    const a = "one\r\ntwo\r\n";
    const b = "one\r\nTWO\r\n";
    expect(applyPatch(a, formatPatch(a, b)!)).toBe(b);
    expect(codeOf(() => applyPatch("one\ntwo\n", formatPatch(a, b)!))).toBe("overlay.conflict base_mismatch");
  });
});

describe("three-way merge", () => {
  const base = lines("1", "2", "3", "4", "5", "6", "7", "8");

  it("merges disjoint changes", () => {
    const ours = lines("1", "TWO", "3", "4", "5", "6", "7", "8");
    const theirs = lines("1", "2", "3", "4", "5", "6", "SEVEN", "8");
    expect(mergeThreeWay(base, ours, theirs)).toEqual({ clean: true, text: lines("1", "TWO", "3", "4", "5", "6", "SEVEN", "8") });
  });

  it("conflicts on overlapping and on adjacent edits", () => {
    const overlap = mergeThreeWay(base, lines("1", "A", "3", "4", "5", "6", "7", "8"), lines("1", "B", "3", "4", "5", "6", "7", "8"));
    expect(overlap.clean).toBe(false);
    const adjacent = mergeThreeWay(base, lines("1", "A", "3", "4", "5", "6", "7", "8"), lines("1", "2", "C", "4", "5", "6", "7", "8"));
    expect(adjacent.clean).toBe(false);
    if (!adjacent.clean) expect(adjacent.conflicts[0]!.base).toEqual(lines("2", "3").match(/.*\n/g));
  });

  it("takes identical changes once", () => {
    const both = lines("1", "2", "3", "x", "5", "6", "7", "8");
    expect(mergeThreeWay(base, both, both)).toEqual({ clean: true, text: both });
  });

  it("is deterministic", () => {
    const a = mergeThreeWay(base, lines("0", ...base.trim().split("\n")), lines(...base.trim().split("\n"), "9"));
    const b = mergeThreeWay(base, lines("0", ...base.trim().split("\n")), lines(...base.trim().split("\n"), "9"));
    expect(a).toEqual(b);
    expect(a).toEqual({ clean: true, text: lines("0", "1", "2", "3", "4", "5", "6", "7", "8", "9") });
  });
});

describe("bytes", () => {
  it("decodes only canonical padded base64", () => {
    expect(decodeBase64(encodeBase64(new Uint8Array([1, 2, 3, 250])))).toEqual(new Uint8Array([1, 2, 3, 250]));
    expect(decodeBase64("AQID+g")).toBeNull();
    expect(decodeBase64("AQIE+h==")).toBeNull();
  });

  it("treats NUL and invalid UTF-8 as binary", () => {
    expect(textOf(new Uint8Array([0x61, 0x00]))).toBeNull();
    expect(textOf(new Uint8Array([0xff, 0xfe]))).toBeNull();
    expect(textOf(new TextEncoder().encode("ok"))).toBe("ok");
  });
});
