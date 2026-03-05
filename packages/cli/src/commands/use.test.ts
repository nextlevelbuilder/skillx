import { describe, it, expect } from "vitest";
import { parseIdentifier } from "./use.js";

describe("parseIdentifier", () => {
  it("classifies space-containing input as search", () => {
    const result = parseIdentifier("ui ux design");
    expect(result.type).toBe("search");
    expect(result.parts).toEqual(["ui ux design"]);
  });

  it("classifies three-part slash input as three-part", () => {
    const result = parseIdentifier("binhmuc/autobot-review/ui-ux-pro-max");
    expect(result.type).toBe("three-part");
    expect(result.parts).toEqual(["binhmuc", "autobot-review", "ui-ux-pro-max"]);
  });

  it("classifies two-part slash input as two-part", () => {
    const result = parseIdentifier("vercel-labs/find-skills");
    expect(result.type).toBe("two-part");
    expect(result.parts).toEqual(["vercel-labs", "find-skills"]);
  });

  it("classifies single word as slug", () => {
    const result = parseIdentifier("find-skills");
    expect(result.type).toBe("slug");
    expect(result.parts).toEqual(["find-skills"]);
  });

  it("handles author/skill-name format", () => {
    const result = parseIdentifier("nextlevelbuilder/ui-ux-pro-max");
    expect(result.type).toBe("two-part");
    expect(result.parts).toEqual(["nextlevelbuilder", "ui-ux-pro-max"]);
  });

  it("treats four-part slash as slug (unexpected format)", () => {
    const result = parseIdentifier("a/b/c/d");
    // 4 parts = not 2 or 3, falls through to slug? Actually split gives 4 parts
    // parseIdentifier only checks for 3 and 2, else slug
    expect(result.type).toBe("slug");
    expect(result.parts).toEqual(["a/b/c/d"]);
  });

  it("handles mixed spaces and slashes (space wins)", () => {
    const result = parseIdentifier("my skill / name");
    expect(result.type).toBe("search");
    expect(result.parts).toEqual(["my skill / name"]);
  });

  it("treats empty string as slug", () => {
    const result = parseIdentifier("");
    expect(result.type).toBe("slug");
    expect(result.parts).toEqual([""]);
  });
});
