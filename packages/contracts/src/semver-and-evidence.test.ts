/**
 * Semver range evaluation and verification-evidence contract tests.
 *
 * Split from `compatibility.test.ts` to keep each test module within the
 * project's 200 LOC rule.
 */

import { describe, expect, it } from "vitest";
import { FIXTURE_DIGEST, FIXTURE_OTHER_DIGEST, VERIFICATION_EVIDENCE_FIXTURE } from "./fixtures";
import { compareVersions, parseVersion, satisfiesRange } from "./semver-range";
import { evidenceMatchesRelease, isReleaseDigest, validateVerificationEvidence } from "./verification-evidence";

describe("semver range evaluation", () => {
  it("parses and compares versions", () => {
    const a = parseVersion("2.1.0");
    const b = parseVersion("2.0.0");
    expect(a && b && compareVersions(a, b)).toBeGreaterThan(0);
    expect(parseVersion("2.1")).toBeNull();
    expect(parseVersion("v2.1.0")).toBeNull();
  });

  it("sorts a prerelease before its release", () => {
    const pre = parseVersion("2.1.0-beta.1");
    const rel = parseVersion("2.1.0");
    expect(pre && rel && compareVersions(pre, rel)).toBeLessThan(0);
  });

  it("evaluates AND comparators and wildcards", () => {
    expect(satisfiesRange("2.1.0", ">=2.0.0 <3.0.0")).toBe(true);
    expect(satisfiesRange("3.0.0", ">=2.0.0 <3.0.0")).toBe(false);
    expect(satisfiesRange("1.2.3", "1.2.3")).toBe(true);
    expect(satisfiesRange("1.2.4", "1.2.3")).toBe(false);
    expect(satisfiesRange("1.2.3", "*")).toBe(true);
  });

  it("returns null for unsupported or unparseable ranges", () => {
    expect(satisfiesRange("2.1.0", "^2.0.0")).toBeNull();
    expect(satisfiesRange("2.1.0", "1.x || 2.x")).toBeNull();
    expect(satisfiesRange("not-a-version", ">=1.0.0")).toBeNull();
  });
});

describe("verification evidence", () => {
  it("accepts only sha256 digests", () => {
    expect(isReleaseDigest(FIXTURE_DIGEST)).toBe(true);
    expect(isReleaseDigest(`sha256:${"A".repeat(64)}`)).toBe(false);
    expect(isReleaseDigest("sha256:abc")).toBe(false);
    expect(isReleaseDigest(undefined)).toBe(false);
  });

  it("validates the canonical evidence fixture", () => {
    expect(validateVerificationEvidence(VERIFICATION_EVIDENCE_FIXTURE).valid).toBe(true);
  });

  it("binds evidence to digest and harness", () => {
    expect(
      evidenceMatchesRelease(VERIFICATION_EVIDENCE_FIXTURE, {
        releaseDigest: FIXTURE_DIGEST,
        harness: "claude-code",
      }),
    ).toBe(true);
    expect(
      evidenceMatchesRelease(VERIFICATION_EVIDENCE_FIXTURE, {
        releaseDigest: FIXTURE_OTHER_DIGEST,
        harness: "claude-code",
      }),
    ).toBe(false);
    expect(
      evidenceMatchesRelease(VERIFICATION_EVIDENCE_FIXTURE, {
        releaseDigest: FIXTURE_DIGEST,
        harness: "codex",
      }),
    ).toBe(false);
  });
});
