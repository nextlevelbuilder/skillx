import { describe, expect, it } from "vitest";
import { inlineText, isDangerListing } from "./listing-text";

describe("isDangerListing", () => {
  it("is true only for danger; unknown, caution and safe keep their bodies", () => {
    expect(isDangerListing("danger")).toBe(true);
    for (const label of ["unknown", "caution", "safe", null, undefined, ""]) {
      expect(isDangerListing(label)).toBe(false);
    }
  });
});

describe("inlineText", () => {
  it("collapses newlines to a single line", () => {
    expect(inlineText("one\n\n## Fake\r\ntwo")).toBe("one ## Fake two");
  });

  it("escapes a leading heading or quote marker", () => {
    expect(inlineText("# Heading")).toBe("\\# Heading");
    expect(inlineText("> quote")).toBe("\\> quote");
    expect(inlineText("\n\n# After blank lines")).toBe("\\# After blank lines");
  });

  it("escapes backtick runs so a value cannot open a fence", () => {
    expect(inlineText("```js\ncode")).toBe("\\`\\`\\`js code");
    expect(inlineText("```js\ncode")).not.toContain("```");
  });

  it("handles missing values", () => {
    expect(inlineText(null)).toBe("");
    expect(inlineText(undefined)).toBe("");
  });
});
