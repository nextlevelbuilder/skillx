/**
 * `?limit=` bounds for `llms.txt` and `llms-full.txt`.
 *
 * The behaviour worth pinning is the fallback direction: a bad value must give a
 * usable document, never a 400 and never a surprise size. The cap matters because
 * the whole document is rendered and cached as one string.
 */

import { describe, expect, it } from "vitest";
import {
  FULL_LIMITS,
  INDEX_LIMITS,
  LLMS_FULL_DEFAULT,
  LLMS_FULL_MAX,
  LLMS_INDEX_DEFAULT,
  LLMS_INDEX_MAX,
  parseLlmsLimit,
} from "./llms-limit";

describe("parseLlmsLimit", () => {
  it("falls back when the parameter is absent", () => {
    expect(parseLlmsLimit(null, INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
    expect(parseLlmsLimit(undefined, FULL_LIMITS)).toBe(LLMS_FULL_DEFAULT);
  });

  it("falls back for blank and whitespace-only values", () => {
    expect(parseLlmsLimit("", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
    expect(parseLlmsLimit("   ", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
  });

  it("falls back for non-numeric values instead of failing the request", () => {
    expect(parseLlmsLimit("abc", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
    expect(parseLlmsLimit("12abc", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
  });

  it("clamps a scientific-notation value instead of truncating it to 1", () => {
    // `parseInt("1e9")` is 1, which would hand a caller asking for more far less
    // than the default. Clamping honours the magnitude.
    expect(parseLlmsLimit("1e9", INDEX_LIMITS)).toBe(LLMS_INDEX_MAX);
  });

  it("rounds a fractional value down to a whole count", () => {
    expect(parseLlmsLimit("1.9", INDEX_LIMITS)).toBe(1);
  });

  it("falls back for zero and negative values", () => {
    expect(parseLlmsLimit("0", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
    expect(parseLlmsLimit("-25", INDEX_LIMITS)).toBe(LLMS_INDEX_DEFAULT);
  });

  it("honours a value within the cap", () => {
    expect(parseLlmsLimit("50", INDEX_LIMITS)).toBe(50);
    expect(parseLlmsLimit(" 250 ", INDEX_LIMITS)).toBe(250);
  });

  it("clamps a value above the cap rather than honouring it", () => {
    expect(parseLlmsLimit("999999", INDEX_LIMITS)).toBe(LLMS_INDEX_MAX);
    expect(parseLlmsLimit(String(LLMS_FULL_MAX + 1), FULL_LIMITS)).toBe(LLMS_FULL_MAX);
  });

  it("accepts exactly the cap", () => {
    expect(parseLlmsLimit(String(LLMS_INDEX_MAX), INDEX_LIMITS)).toBe(LLMS_INDEX_MAX);
  });

  it("keeps the two documents independently bounded", () => {
    // The index is metadata and can be larger than the document carrying bodies.
    expect(LLMS_INDEX_DEFAULT).toBeGreaterThan(LLMS_FULL_DEFAULT);
    expect(LLMS_INDEX_MAX).toBeGreaterThan(LLMS_FULL_MAX);
  });
});
