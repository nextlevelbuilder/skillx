/**
 * `?batch=` bounds for the admin recompute endpoint.
 *
 * The bug this pins: `batch=0` used to pass validation, became `LIMIT 0`, and
 * the `all=true` loop then re-read the same offset for all 50 permitted
 * iterations while processing nothing. `batch=100000` was accepted too, which
 * defeats the per-request guard that keeps the Worker under its CPU limit.
 */

import { describe, expect, it } from "vitest";
import { parseBatchSize, RECOMPUTE_BATCH_LIMIT } from "./batch-limit";

describe("parseBatchSize", () => {
  it("falls back when the parameter is absent, blank, or unusable", () => {
    for (const raw of [null, undefined, "", "   ", "abc", "NaN", "Infinity", "-0"]) {
      expect(parseBatchSize(raw)).toBe(RECOMPUTE_BATCH_LIMIT.fallback);
    }
  });

  it("rejects zero and negative values instead of letting them through", () => {
    // `0` is the reported bug: it is a valid integer but a useless batch size.
    expect(parseBatchSize("0")).toBe(RECOMPUTE_BATCH_LIMIT.fallback);
    expect(parseBatchSize("0.0")).toBe(RECOMPUTE_BATCH_LIMIT.fallback);
    expect(parseBatchSize("-25")).toBe(RECOMPUTE_BATCH_LIMIT.fallback);
  });

  it("keeps in-range values as they are", () => {
    expect(parseBatchSize("1")).toBe(1);
    expect(parseBatchSize("100")).toBe(100);
    expect(parseBatchSize("200")).toBe(200);
    expect(parseBatchSize(" 250 ")).toBe(250);
    expect(parseBatchSize("500")).toBe(500);
  });

  it("floors fractional values because .limit() needs an integer", () => {
    expect(parseBatchSize("12.9")).toBe(12);
    expect(parseBatchSize("0.9")).toBe(RECOMPUTE_BATCH_LIMIT.fallback);
  });

  it("clamps anything above the cap instead of accepting it", () => {
    expect(parseBatchSize("501")).toBe(RECOMPUTE_BATCH_LIMIT.max);
    expect(parseBatchSize("100000")).toBe(RECOMPUTE_BATCH_LIMIT.max);
    // `parseInt("1e9")` would be 1; the magnitude is honoured instead.
    expect(parseBatchSize("1e9")).toBe(RECOMPUTE_BATCH_LIMIT.max);
  });

  it("honours a caller-supplied bound", () => {
    expect(parseBatchSize("1000", { max: 50, fallback: 10 })).toBe(50);
    expect(parseBatchSize(null, { max: 50, fallback: 10 })).toBe(10);
  });
});
