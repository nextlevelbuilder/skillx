import { describe, expect, it } from "vitest";
import {
  COMPATIBILITY_STATUSES,
  isInstallable,
  normalizeCompatibility,
  normalizeRequirement,
  validateCompatibilityDeclaration,
} from "./compatibility";
import type { CompatibilityDeclarationMap, CompatibilityStatus } from "./compatibility";
import {
  COMPATIBILITY_DECLARATION_FIXTURE,
  FIXTURE_DIGEST,
  FIXTURE_OTHER_DIGEST,
  VERIFICATION_EVIDENCE_FIXTURE,
} from "./fixtures";

const DECLARATION: CompatibilityDeclarationMap = {
  "claude-code": {
    status: "declared",
    versions: ">=2.0.0 <3.0.0",
    scopes: ["project"],
    requires: ["hooks.PreToolUse"],
  },
  codex: { status: "unsupported" },
};

function statusOf(target: Parameters<typeof normalizeCompatibility>[0], context: Parameters<typeof normalizeCompatibility>[1] = {}): CompatibilityStatus {
  return normalizeCompatibility(target, context).status;
}

describe("compatibility engine — five states", () => {
  it("returns unknown when no declaration exists for the runtime", () => {
    const result = normalizeCompatibility({ runtime: "gemini-cli" }, { declaration: DECLARATION });
    expect(result.status).toBe("unknown");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_DECLARATION_MISSING");
    expect(isInstallable(result.status)).toBe(false);
  });

  it("returns unknown when there is no declaration at all", () => {
    const result = normalizeCompatibility({ runtime: "claude-code" });
    expect(result.status).toBe("unknown");
    expect(result.requirements).toEqual([]);
  });

  it("returns unsupported for an explicit unsupported declaration", () => {
    const result = normalizeCompatibility({ runtime: "codex" }, { declaration: DECLARATION });
    expect(result.status).toBe("unsupported");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_DECLARATION_UNSUPPORTED");
  });

  it("returns declared when the publisher declares support and no evidence matches", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, releaseDigest: FIXTURE_DIGEST },
    );
    expect(result.status).toBe("declared");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_ABSENT");
    expect(isInstallable(result.status)).toBe(true);
  });

  it("returns verified only when evidence matches the exact release digest", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "2.5.0", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, evidence: [VERIFICATION_EVIDENCE_FIXTURE], releaseDigest: FIXTURE_DIGEST },
    );
    expect(result.status).toBe("verified");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_PRESENT");
    expect(result.evidence?.probeId).toBe(VERIFICATION_EVIDENCE_FIXTURE.probeId);
  });

  it("reports a digest mismatch instead of verifying when evidence is for another artifact", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "2.5.0", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, evidence: [VERIFICATION_EVIDENCE_FIXTURE], releaseDigest: FIXTURE_OTHER_DIGEST },
    );
    expect(result.status).toBe("declared");
    expect(result.evidence).toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_DIGEST_MISMATCH");
  });

  it("never verifies from evidence that is not bound to a release digest", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "2.5.0", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, evidence: [VERIFICATION_EVIDENCE_FIXTURE] },
    );
    expect(result.status).toBe("declared");
    expect(result.evidence).toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_UNBOUND");
  });

  it("only ever reports verified when a digest actually matched", () => {
    const unbound = normalizeCompatibility(
      { runtime: "claude-code", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, evidence: [VERIFICATION_EVIDENCE_FIXTURE] },
    );
    expect(unbound.status).not.toBe("verified");

    const bound = normalizeCompatibility(
      { runtime: "claude-code", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION, evidence: [VERIFICATION_EVIDENCE_FIXTURE], releaseDigest: FIXTURE_DIGEST },
    );
    expect(bound.status).toBe("verified");
  });

  it("returns blocked when a required capability is unavailable", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: [] },
      { declaration: DECLARATION },
    );
    expect(result.status).toBe("blocked");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_CAPABILITY_MISSING");
    expect(result.reasons.find((r) => r.code === "COMPAT_CAPABILITY_MISSING")?.detail).toBe("hooks.PreToolUse");
  });

  it("does not block when capability data was never supplied", () => {
    expect(statusOf({ runtime: "claude-code", version: "2.1.0" }, { declaration: DECLARATION })).toBe("declared");
  });

  it("returns blocked when the version is outside the declared range", () => {
    const result = normalizeCompatibility(
      { runtime: "claude-code", version: "3.0.0", capabilities: ["hooks.PreToolUse"] },
      { declaration: DECLARATION },
    );
    expect(result.status).toBe("blocked");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_RANGE_MISMATCH");
  });

  it("returns blocked rather than supported when the range cannot be parsed", () => {
    const declaration: CompatibilityDeclarationMap = { "claude-code": { status: "declared", versions: "^2.0.0" } };
    const result = normalizeCompatibility({ runtime: "claude-code", version: "2.1.0" }, { declaration });
    expect(result.status).toBe("blocked");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_RANGE_UNPARSEABLE");
  });

  it("ignores optional requirements when gating", () => {
    const declaration: CompatibilityDeclarationMap = {
      "claude-code": { status: "declared", requires: [{ capability: "hooks.PostToolUse", optional: true }] },
    };
    expect(statusOf({ runtime: "claude-code", capabilities: [] }, { declaration })).toBe("declared");
  });

  it("only ever emits declared statuses from the closed set", () => {
    const seen = new Set<CompatibilityStatus>();
    for (const target of [{ runtime: "a" }, { runtime: "codex" }, { runtime: "claude-code", version: "9.9.9" }]) {
      const status = statusOf(target, { declaration: DECLARATION });
      expect(COMPATIBILITY_STATUSES).toContain(status);
      seen.add(status);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("normalizes string and object requirements identically", () => {
    expect(normalizeRequirement("hooks.PreToolUse")).toEqual({ capability: "hooks.PreToolUse" });
    expect(normalizeRequirement({ capability: "hooks.PreToolUse", optional: true })).toEqual({
      capability: "hooks.PreToolUse",
      optional: true,
    });
  });

  it("rejects malformed declarations", () => {
    expect(validateCompatibilityDeclaration(DECLARATION).valid).toBe(true);
    expect(validateCompatibilityDeclaration("claude-code").valid).toBe(false);
    expect(validateCompatibilityDeclaration({ "claude-code": { status: "maybe" } }).valid).toBe(false);
    expect(validateCompatibilityDeclaration({ "claude-code": { status: "declared", versions: "" } }).valid).toBe(false);
  });

  it("validates the shipped compatibility fixture", () => {
    expect(validateCompatibilityDeclaration(COMPATIBILITY_DECLARATION_FIXTURE).valid).toBe(true);
  });

  it("pins the vocabulary, because the CLI mirrors it by hand", () => {
    // `packages/cli/src/lib/skill-lookup.ts` does not import this package: its
    // tsconfig sets `rootDir: ./src` and its bundler does not resolve a
    // cross-package path, so `isActionable` enumerates these literals instead.
    // Adding a status here would otherwise leave that mirror silently wrong, and
    // no test in either package would notice.
    expect([...COMPATIBILITY_STATUSES].sort()).toEqual([
      "blocked",
      "declared",
      "unknown",
      "unsupported",
      "verified",
    ]);
  });
});
