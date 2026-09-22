/**
 * Listing-level compatibility adapter.
 *
 * A `skills` row is mutable and has no artifact digest, so the adapter must never
 * produce `verified`, and a row whose JSON cannot be parsed must resolve to
 * `unknown` rather than to support.
 */

import { describe, expect, it } from "vitest";
import {
  listingInputs,
  listingMatchesTarget,
  parseCompatibilityTarget,
  resolveRowCompatibility,
  summarizeRowRuntime,
  summarizeRowRuntimes,
} from "./catalog-compatibility";

const DECLARED = JSON.stringify({
  agentkit: { status: "declared", versions: ">=1.0.0 <2.0.0" },
  "claude-code": { status: "unsupported" },
});

describe("listingInputs", () => {
  it("reads the declaration off the row", () => {
    const inputs = listingInputs({ compatibility_json: DECLARED });
    expect(Object.keys(inputs.listingDeclaration ?? {}).sort()).toEqual(["agentkit", "claude-code"]);
  });

  it.each([
    ["a null column", null],
    ["an absent column", undefined],
    ["empty text", ""],
    ["malformed JSON", "{not json"],
    ["a JSON array", "[1,2]"],
    ["a JSON scalar", '"agentkit"'],
  ])("yields no declaration for %s", (_label, value) => {
    expect(listingInputs({ compatibility_json: value })).toEqual({});
  });
});

describe("summarizeRowRuntimes", () => {
  it("enumerates exactly the declared runtimes", () => {
    const summaries = summarizeRowRuntimes({ compatibility_json: DECLARED });
    expect(summaries.map((s) => `${s.runtime}:${s.status}`).sort()).toEqual([
      "agentkit:declared",
      "claude-code:unsupported",
    ]);
  });

  it("returns nothing for an undeclared listing", () => {
    expect(summarizeRowRuntimes({ compatibility_json: null })).toEqual([]);
  });

  it("applies the target version when it names a declared runtime", () => {
    const [outside] = summarizeRowRuntimes({ compatibility_json: DECLARED }, {
      runtime: "agentkit",
      version: "2.5.0",
    });
    expect(outside?.status).toBe("blocked");
    expect(outside?.reasonCodes).toContain("COMPAT_RANGE_MISMATCH");
  });

  it("still enumerates other runtimes when a target is supplied", () => {
    const summaries = summarizeRowRuntimes({ compatibility_json: DECLARED }, { runtime: "agentkit" });
    expect(summaries).toHaveLength(2);
  });
});

describe("resolveRowCompatibility", () => {
  it("resolves a declared runtime", () => {
    const resolved = resolveRowCompatibility({ compatibility_json: DECLARED }, { runtime: "agentkit" });
    expect(resolved.status).toBe("declared");
    expect(resolved.versions).toBe(">=1.0.0 <2.0.0");
  });

  it("never reports verified for a mutable listing", () => {
    // There is no artifact digest on a listing, so nothing can promote it.
    const resolved = resolveRowCompatibility({ compatibility_json: DECLARED }, { runtime: "agentkit" });
    expect(resolved.status).not.toBe("verified");
  });

  it("is unknown with a machine-readable reason when nothing is declared", () => {
    const resolved = resolveRowCompatibility({ compatibility_json: null }, { runtime: "agentkit" });
    expect(resolved.status).toBe("unknown");
    expect(resolved.reasons[0]?.code).toBe("COMPAT_DECLARATION_MISSING");
  });
});

describe("summarizeRowRuntime", () => {
  it("returns a summary only for a declared runtime", () => {
    expect(summarizeRowRuntime({ compatibility_json: DECLARED }, { runtime: "agentkit" })?.status).toBe("declared");
    expect(summarizeRowRuntime({ compatibility_json: DECLARED }, { runtime: "codex" })).toBeNull();
  });
});

describe("listingMatchesTarget", () => {
  it("matches a declared runtime and refuses an unsupported one", () => {
    expect(listingMatchesTarget({ compatibility_json: DECLARED }, { runtime: "agentkit" })).toBe(true);
    expect(listingMatchesTarget({ compatibility_json: DECLARED }, { runtime: "claude-code" })).toBe(false);
  });

  it("does not treat an undeclared runtime as support", () => {
    expect(listingMatchesTarget({ compatibility_json: null }, { runtime: "agentkit" })).toBe(false);
  });

  it("refuses a version outside the declared range", () => {
    expect(listingMatchesTarget({ compatibility_json: DECLARED }, { runtime: "agentkit", version: "3.0.0" })).toBe(false);
  });
});

describe("parseCompatibilityTarget", () => {
  it("reads a bare runtime", () => {
    expect(parseCompatibilityTarget("agentkit")).toEqual({ runtime: "agentkit" });
  });

  it("keeps the version, which the detail surface evaluates", () => {
    expect(parseCompatibilityTarget("agentkit@1.4.0")).toEqual({ runtime: "agentkit", version: "1.4.0" });
  });

  it.each(["", "   ", null, undefined])("rejects %s", (value) => {
    expect(parseCompatibilityTarget(value)).toBeNull();
  });
});
