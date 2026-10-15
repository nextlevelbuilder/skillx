/**
 * Catalog-level compatibility resolution.
 *
 * The precedence rule is the thing under test: release declaration beats listing
 * declaration, a listing can never reach `verified`, and a release declaration
 * that arrives without a release is ignored rather than trusted.
 */

import { describe, expect, it } from "vitest";
import {
  isCompatibilityActionable,
  resolveCatalogCompatibility,
  resolveDeclaredRuntimes,
  selectDeclaration,
  toCompatibilitySummary,
  type CatalogCompatibilityInputs,
} from "./compatibility/catalog";
import type { VerificationEvidence } from "./verification-evidence";

const DIGEST = `sha256:${"a".repeat(64)}`;

function evidence(overrides: Partial<VerificationEvidence> = {}): VerificationEvidence {
  return {
    releaseDigest: DIGEST,
    harness: "agentkit",
    harnessVersion: "1.4.0",
    probeId: "probe_001",
    verifiedAt: "2026-09-20T10:00:00.000Z",
    verifier: "ci",
    ...overrides,
  };
}

const LISTING = {
  agentkit: { status: "declared" as const, versions: ">=1.0.0 <2.0.0" },
};

const RELEASE = {
  agentkit: { status: "declared" as const, versions: ">=2.0.0" },
};

describe("selectDeclaration — the single precedence rule", () => {
  it("prefers the release declaration when the row really has a release", () => {
    const selected = selectDeclaration({ hasRelease: true, releaseDeclaration: RELEASE, listingDeclaration: LISTING });
    expect(selected.tier).toBe("release");
    expect(selected.declaration).toBe(RELEASE);
  });

  it("falls back to the listing declaration without a release", () => {
    const selected = selectDeclaration({ listingDeclaration: LISTING });
    expect(selected.tier).toBe("listing");
    expect(selected.declaration).toBe(LISTING);
  });

  it("ignores a release declaration when the row has no release", () => {
    // Trusting this would let a surface claim release-grade provenance it cannot prove.
    const selected = selectDeclaration({ hasRelease: false, releaseDeclaration: RELEASE, listingDeclaration: LISTING });
    expect(selected.tier).toBe("listing");
    expect(selected.declaration).toBe(LISTING);
  });

  it("reports no tier when neither tier declares anything", () => {
    expect(selectDeclaration({}).tier).toBeNull();
    expect(selectDeclaration({ hasRelease: true, evidence: [evidence()] }).tier).toBeNull();
  });
});

describe("resolveCatalogCompatibility — listing tier", () => {
  const inputs: CatalogCompatibilityInputs = { listingDeclaration: LISTING };

  it("resolves a declared listing to `declared`", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit" }, inputs);
    expect(result.status).toBe("declared");
    expect(result.versions).toBe(">=1.0.0 <2.0.0");
  });

  it("never reaches `verified` from matching evidence, because a listing has no digest", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit" }, {
      ...inputs,
      evidence: [evidence({ releaseDigest: "sha256:" + "b".repeat(64) })],
    });
    expect(result.status).toBe("declared");
    expect(result.reasons.map((reason) => reason.code)).toContain("COMPAT_EVIDENCE_UNBOUND");
  });

  it("stays unknown for a runtime the listing never declared", () => {
    const result = resolveCatalogCompatibility({ runtime: "claude-code" }, inputs);
    expect(result.status).toBe("unknown");
    expect(result.reasons[0]?.code).toBe("COMPAT_DECLARATION_MISSING");
  });

  it("blocks a version outside the declared range", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit", version: "2.5.0" }, inputs);
    expect(result.status).toBe("blocked");
    expect(result.reasons.map((reason) => reason.code)).toContain("COMPAT_RANGE_MISMATCH");
  });
});

describe("resolveCatalogCompatibility — release tier", () => {
  const inputs: CatalogCompatibilityInputs = {
    hasRelease: true,
    releaseDeclaration: RELEASE,
    releaseDigest: DIGEST,
    evidence: [evidence()],
  };

  it("reaches `verified` only with digest-bound evidence", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit" }, inputs);
    expect(result.status).toBe("verified");
    expect(result.evidence?.probeId).toBe("probe_001");
  });

  it("stays declared when the evidence is for a different digest", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit" }, {
      ...inputs,
      evidence: [evidence({ releaseDigest: "sha256:" + "c".repeat(64) })],
    });
    expect(result.status).toBe("declared");
    expect(result.reasons.map((reason) => reason.code)).toContain("COMPAT_EVIDENCE_DIGEST_MISMATCH");
  });

  it("uses the release range, not the listing range", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit", version: "2.5.0" }, {
      ...inputs,
      listingDeclaration: LISTING,
    });
    expect(result.status).toBe("verified");
  });
});

describe("resolveDeclaredRuntimes", () => {
  it("enumerates exactly the declared runtimes", () => {
    const inputs: CatalogCompatibilityInputs = {
      listingDeclaration: { ...LISTING, "claude-code": { status: "unsupported" } },
    };
    const resolved = resolveDeclaredRuntimes(inputs).map((entry) => `${entry.runtime}:${entry.status}`);
    expect(resolved.sort()).toEqual(["agentkit:declared", "claude-code:unsupported"]);
  });

  it("returns nothing when no tier declares anything", () => {
    expect(resolveDeclaredRuntimes({})).toEqual([]);
  });
});

describe("toCompatibilitySummary", () => {
  it("carries the reason codes an agent needs to explain a refusal", () => {
    const result = resolveCatalogCompatibility({ runtime: "agentkit", version: "9.9.9" }, {
      listingDeclaration: LISTING,
    });
    const summary = toCompatibilitySummary(result);
    expect(summary).toMatchObject({ runtime: "agentkit", status: "blocked" });
    expect(summary.reasonCodes).toContain("COMPAT_RANGE_MISMATCH");
    expect(summary.verifiedAt).toBeNull();
  });

  it("exposes the probe identity only for a verified answer", () => {
    const declared = toCompatibilitySummary(
      resolveCatalogCompatibility({ runtime: "agentkit" }, { listingDeclaration: LISTING }),
    );
    expect(declared.probeId).toBeNull();
  });
});

describe("isCompatibilityActionable", () => {
  it("treats only declared and verified as actionable", () => {
    expect(isCompatibilityActionable("declared")).toBe(true);
    expect(isCompatibilityActionable("verified")).toBe(true);
    expect(isCompatibilityActionable("unknown")).toBe(false);
    expect(isCompatibilityActionable("unsupported")).toBe(false);
    expect(isCompatibilityActionable("blocked")).toBe(false);
  });
});
