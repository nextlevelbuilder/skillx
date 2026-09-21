import { describe, expect, it } from "vitest";
import {
  ALL_FIXTURES,
  COLLECTION_MEMBER_FIXTURES,
  ENTITLEMENT_FIXTURES,
  INGESTION_FIXTURES,
  PACKAGE_MANIFEST_FIXTURES,
  PACKAGE_MANIFEST_FIXTURE,
  VERIFICATION_EVIDENCE_FIXTURES,
} from "./fixtures";
import {
  PACKAGE_KINDS,
  RELEASE_STATES,
  SEMVER_PATTERN,
  isPackageKind,
  isReleaseState,
  isResolvableReleaseState,
  validatePackageManifest,
} from "./package-manifest";
import { validateCollectionMember, validateEntitlement } from "./collections";
import { validateListingImport, validateReleasePublish } from "./ingestion";
import { validateVerificationEvidence } from "./verification-evidence";

const VALIDATOR_BY_GROUP: Record<string, (input: unknown) => { valid: boolean; issues: { code: string }[] }> = {
  "package-manifest": validatePackageManifest,
  "verification-evidence": validateVerificationEvidence,
  "collection-member": validateCollectionMember,
  entitlement: validateEntitlement,
  "listing-import": validateListingImport,
  "release-publish": validateReleasePublish,
};

describe("skillx.package/v1 fixtures", () => {
  it("covers both a valid and a rejected case for every contract group", () => {
    const groups = new Set(ALL_FIXTURES.map((fixture) => fixture.group));
    expect(groups.size).toBe(6);
    for (const group of groups) {
      const cases = ALL_FIXTURES.filter((fixture) => fixture.group === group);
      expect(cases.some((c) => c.expectedValid), `${group} needs a valid fixture`).toBe(true);
      expect(cases.some((c) => !c.expectedValid), `${group} needs a rejected fixture`).toBe(true);
    }
  });

  it.each(ALL_FIXTURES)("$group :: $name is valid=$expectedValid", ({ group, value, expectedValid, expectedIssueCode }) => {
    const result = VALIDATOR_BY_GROUP[group]?.(value);
    expect(result, `no validator registered for group ${group}`).toBeDefined();
    expect(result?.valid).toBe(expectedValid);
    if (!expectedValid && expectedIssueCode) {
      expect(result?.issues.map((issue) => issue.code)).toContain(expectedIssueCode);
    }
  });

  it("exports one shared fixture list per group", () => {
    expect(PACKAGE_MANIFEST_FIXTURES.length).toBeGreaterThan(0);
    expect(VERIFICATION_EVIDENCE_FIXTURES.length).toBeGreaterThan(0);
    expect(COLLECTION_MEMBER_FIXTURES.length).toBeGreaterThan(0);
    expect(ENTITLEMENT_FIXTURES.length).toBeGreaterThan(0);
    expect(INGESTION_FIXTURES.length).toBeGreaterThan(0);
    expect(ALL_FIXTURES.length).toBe(
      PACKAGE_MANIFEST_FIXTURES.length +
        VERIFICATION_EVIDENCE_FIXTURES.length +
        COLLECTION_MEMBER_FIXTURES.length +
        ENTITLEMENT_FIXTURES.length +
        INGESTION_FIXTURES.length,
    );
  });
});

describe("package kinds and release states", () => {
  it("defines exactly skill, hook-pack, bundle", () => {
    expect([...PACKAGE_KINDS]).toEqual(["skill", "hook-pack", "bundle"]);
    for (const kind of PACKAGE_KINDS) expect(isPackageKind(kind)).toBe(true);
    expect(isPackageKind("plugin")).toBe(false);
  });

  it("defines exactly the four release states", () => {
    expect([...RELEASE_STATES]).toEqual(["draft", "quarantined", "published", "yanked"]);
    for (const state of RELEASE_STATES) expect(isReleaseState(state)).toBe(true);
    expect(isReleaseState("blocked")).toBe(false);
  });

  it("resolves only published releases for a normal new install", () => {
    expect(isResolvableReleaseState("published")).toBe(true);
    expect(isResolvableReleaseState("draft")).toBe(false);
    expect(isResolvableReleaseState("quarantined")).toBe(false);
    expect(isResolvableReleaseState("yanked")).toBe(false);
  });

  it("accepts the canonical roadmap manifest", () => {
    expect(validatePackageManifest(PACKAGE_MANIFEST_FIXTURE).valid).toBe(true);
  });

  it("rejects non-object input without throwing", () => {
    expect(validatePackageManifest(null).valid).toBe(false);
    expect(validatePackageManifest("skillx.package/v1").valid).toBe(false);
    expect(validatePackageManifest([]).valid).toBe(false);
  });

  it("keeps the semver pattern aligned with the manifest fixture", () => {
    expect(SEMVER_PATTERN.test(PACKAGE_MANIFEST_FIXTURE.version)).toBe(true);
  });
});
