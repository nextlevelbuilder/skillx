/**
 * `?limit=` bounds for `llms.txt` and `llms-full.txt`.
 *
 * Two properties are pinned: a bad value gives a usable document (never a 400),
 * and every value lands on one of a few fixed sizes, so the KV cache cannot be
 * fanned out by spelling the parameter differently.
 */

import { describe, expect, it } from "vitest";
import {
  FULL_LIMITS,
  INDEX_LIMITS,
  LLMS_FULL_MAX,
  LLMS_INDEX_MAX,
  llmsCacheKey,
  parseLlmsLimit,
} from "./llms-limit";

describe("parseLlmsLimit", () => {
  it("falls back when the parameter is absent, blank, or unusable", () => {
    for (const raw of [null, undefined, "", "   ", "abc", "12abc", "0", "-25", "NaN", "Infinity"]) {
      expect(parseLlmsLimit(raw, INDEX_LIMITS)).toBe(INDEX_LIMITS.fallback);
      expect(parseLlmsLimit(raw, FULL_LIMITS)).toBe(FULL_LIMITS.fallback);
    }
  });

  it("snaps a value up to the smallest allowed size that holds it", () => {
    expect(parseLlmsLimit("1", INDEX_LIMITS)).toBe(100);
    expect(parseLlmsLimit("101", INDEX_LIMITS)).toBe(250);
    expect(parseLlmsLimit(" 250 ", INDEX_LIMITS)).toBe(250);
    expect(parseLlmsLimit("1.9", FULL_LIMITS)).toBe(25);
    expect(parseLlmsLimit("60", FULL_LIMITS)).toBe(100);
  });

  it("caps a value above the largest size at the largest size", () => {
    expect(parseLlmsLimit("999999", INDEX_LIMITS)).toBe(LLMS_INDEX_MAX);
    // `parseInt("1e9")` would be 1; the magnitude is honoured instead.
    expect(parseLlmsLimit("1e9", FULL_LIMITS)).toBe(LLMS_FULL_MAX);
  });

  it("only ever returns an allowlisted size", () => {
    const inputs = ["1", "7", "99", "100", "101", "333", "500", "501", "1000", "5000", "1e3", "0x10"];
    for (const raw of inputs) {
      expect(INDEX_LIMITS.sizes).toContain(parseLlmsLimit(raw, INDEX_LIMITS));
      expect(FULL_LIMITS.sizes).toContain(parseLlmsLimit(raw, FULL_LIMITS));
    }
  });

  it("keeps the defaults inside their allowlists", () => {
    expect(INDEX_LIMITS.sizes).toContain(INDEX_LIMITS.fallback);
    expect(FULL_LIMITS.sizes).toContain(FULL_LIMITS.fallback);
    // The document carrying bodies stays smaller than the metadata index.
    expect(LLMS_FULL_MAX).toBeLessThan(LLMS_INDEX_MAX);
  });
});

describe("llmsCacheKey", () => {
  it("is built from the normalized limit, so equivalent spellings share one entry", () => {
    const origin = "https://skillx.sh";
    const keys = ["120", "250", " 250", "2.5e2", "249.5"].map((raw) =>
      llmsCacheKey("llms-txt", origin, parseLlmsLimit(raw, INDEX_LIMITS)),
    );
    expect(new Set(keys)).toEqual(new Set(["llms-txt:v4:https://skillx.sh:250"]));
  });

  it("separates the two documents and the origins", () => {
    expect(llmsCacheKey("llms-txt", "https://a", 100)).not.toBe(llmsCacheKey("llms-full-txt", "https://a", 100));
    expect(llmsCacheKey("llms-txt", "https://a", 100)).not.toBe(llmsCacheKey("llms-txt", "https://b", 100));
  });
});
