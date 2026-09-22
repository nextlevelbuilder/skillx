import { describe, expect, it } from "vitest";
import {
  FIXTURE_DIGEST,
  FIXTURE_OTHER_DIGEST,
  PACKAGE_MANIFEST_FIXTURE,
  VERIFICATION_EVIDENCE_FIXTURE,
} from "@skillx/contracts";
import {
  parseDeclaration,
  resolveAllDeclaredRuntimes,
  resolveCompatibility,
  toVerificationEvidence,
} from "./compatibility-service";
import type { EvidenceRecord } from "./compatibility-service";

const DECLARATION_JSON = JSON.stringify(PACKAGE_MANIFEST_FIXTURE.compatible);

function evidenceRecord(overrides: Partial<EvidenceRecord> = {}): EvidenceRecord {
  return {
    release_digest: FIXTURE_DIGEST,
    harness: "claude-code",
    harness_version: "2.1.0",
    os: "linux",
    probe_id: VERIFICATION_EVIDENCE_FIXTURE.probeId,
    verified_at: new Date("2026-09-15T10:00:00.000Z"),
    verifier: "skillx-ci",
    ...overrides,
  };
}

describe("compatibility service (web adapter over the shared engine)", () => {
  it("parses a persisted declaration", () => {
    expect(parseDeclaration(DECLARATION_JSON)?.["claude-code"]?.status).toBe("declared");
  });

  it("treats absent or malformed declaration JSON as no declaration", () => {
    expect(parseDeclaration(null)).toBeUndefined();
    expect(parseDeclaration(undefined)).toBeUndefined();
    expect(parseDeclaration("")).toBeUndefined();
    expect(parseDeclaration("{not json")).toBeUndefined();
    expect(parseDeclaration('["claude-code"]')).toBeUndefined();
  });

  it("maps persisted evidence rows into contract evidence", () => {
    const [mapped] = toVerificationEvidence([evidenceRecord()]);
    expect(mapped?.releaseDigest).toBe(FIXTURE_DIGEST);
    expect(mapped?.harnessVersion).toBe("2.1.0");
    expect(mapped?.verifiedAt).toBe("2026-09-15T10:00:00.000Z");
  });

  it("maps numeric and string timestamps without throwing", () => {
    const mapped = toVerificationEvidence([
      evidenceRecord({ verified_at: 1_757_930_400_000 }),
      evidenceRecord({ verified_at: "2026-09-15T10:00:00.000Z" }),
    ]);
    expect(mapped[0]?.verifiedAt).toBe(new Date(1_757_930_400_000).toISOString());
    expect(mapped[1]?.verifiedAt).toBe("2026-09-15T10:00:00.000Z");
  });

  it("resolves unknown when the release has no declaration", () => {
    const result = resolveCompatibility({ runtime: "claude-code" }, { declarationJson: null });
    expect(result.status).toBe("unknown");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_DECLARATION_MISSING");
  });

  it("resolves unsupported for an explicit unsupported runtime", () => {
    const result = resolveCompatibility({ runtime: "codex" }, { declarationJson: DECLARATION_JSON });
    expect(result.status).toBe("unsupported");
  });

  it("resolves declared when support is claimed without matching evidence", () => {
    const result = resolveCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
      { declarationJson: DECLARATION_JSON, releaseDigest: FIXTURE_DIGEST },
    );
    expect(result.status).toBe("declared");
  });

  it("resolves verified only for the exact release digest", () => {
    const verified = resolveCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
      { declarationJson: DECLARATION_JSON, releaseDigest: FIXTURE_DIGEST },
      [evidenceRecord()],
    );
    expect(verified.status).toBe("verified");

    const mismatched = resolveCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
      { declarationJson: DECLARATION_JSON, releaseDigest: FIXTURE_OTHER_DIGEST },
      [evidenceRecord()],
    );
    expect(mismatched.status).toBe("declared");
    expect(mismatched.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_DIGEST_MISMATCH");
  });

  it("never verifies when the release has no artifact digest to bind evidence to", () => {
    const result = resolveCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
      { declarationJson: DECLARATION_JSON, releaseDigest: null },
      [evidenceRecord()],
    );
    expect(result.status).toBe("declared");
    expect(result.evidence).toBeNull();
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_EVIDENCE_UNBOUND");
  });

  it("resolves blocked when a required capability is missing", () => {
    const result = resolveCompatibility(
      { runtime: "claude-code", version: "2.1.0", capabilities: [] },
      { declarationJson: DECLARATION_JSON },
    );
    expect(result.status).toBe("blocked");
    expect(result.reasons.map((r) => r.code)).toContain("COMPAT_CAPABILITY_MISSING");
  });

  it("covers all five statuses through this adapter", () => {
    const statuses = [
      resolveCompatibility({ runtime: "unknown-runtime" }, { declarationJson: DECLARATION_JSON }).status,
      resolveCompatibility({ runtime: "codex" }, { declarationJson: DECLARATION_JSON }).status,
      resolveCompatibility({ runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] }, { declarationJson: DECLARATION_JSON }).status,
      resolveCompatibility(
        { runtime: "claude-code", version: "2.1.0", capabilities: ["hooks.PreToolUse"] },
        { declarationJson: DECLARATION_JSON, releaseDigest: FIXTURE_DIGEST },
        [evidenceRecord()],
      ).status,
      resolveCompatibility({ runtime: "claude-code", version: "2.1.0", capabilities: [] }, { declarationJson: DECLARATION_JSON }).status,
    ];
    expect(new Set(statuses)).toEqual(new Set(["unknown", "unsupported", "declared", "verified", "blocked"]));
  });

  it("enumerates one normalized result per declared runtime", () => {
    const all = resolveAllDeclaredRuntimes({ declarationJson: DECLARATION_JSON });
    expect(all.map((entry) => entry.runtime).sort()).toEqual(["claude-code", "codex"]);
    expect(resolveAllDeclaredRuntimes({ declarationJson: null })).toEqual([]);
  });
});
