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
import { RELEASE_MANIFEST_FIXTURES } from "./fixtures/release-fixtures";
import { RELEASE_MANIFEST_V2_FIXTURES } from "./fixtures/release-v2-fixtures";
import { RELEASE_STATUS_FIXTURES } from "./fixtures/release-status-fixtures";
import * as contracts from "./index";
import { validateReleaseManifest } from "./release-manifest";
import { validateReleaseStatus } from "./release-status";
import {
  PACKAGE_KINDS,
  PACKAGE_VISIBILITIES,
  RELEASE_STATES,
  SEMVER_PATTERN,
  isOpenPackageVisibility,
  isPackageKind,
  isPackageVisibility,
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
  "release-manifest": validateReleaseManifest,
  "release-status": validateReleaseStatus,
};

/** Every fixture case, including the test-only signed-release fixtures the root export leaves out. */
const EVERY_FIXTURE = [...ALL_FIXTURES, ...RELEASE_MANIFEST_FIXTURES, ...RELEASE_MANIFEST_V2_FIXTURES, ...RELEASE_STATUS_FIXTURES];

describe("skillx.package/v1 fixtures", () => {
  it("covers both a valid and a rejected case for every contract group", () => {
    const groups = new Set(EVERY_FIXTURE.map((fixture) => fixture.group));
    expect(groups.size).toBe(8);
    for (const group of groups) {
      const cases = EVERY_FIXTURE.filter((fixture) => fixture.group === group);
      expect(cases.some((c) => c.expectedValid), `${group} needs a valid fixture`).toBe(true);
      expect(cases.some((c) => !c.expectedValid), `${group} needs a rejected fixture`).toBe(true);
    }
  });

  it("keeps the test-only signed-release fixtures out of the package root", () => {
    expect("RELEASE_MANIFEST_FIXTURES" in contracts).toBe(false);
    expect("RELEASE_MANIFEST_V2_FIXTURES" in contracts).toBe(false);
    expect("RELEASE_STATUS_FIXTURES" in contracts).toBe(false);
    expect(ALL_FIXTURES.some((f) => f.group === "release-manifest" || f.group === "release-status")).toBe(false);
  });

  it.each(EVERY_FIXTURE)("$group :: $name is valid=$expectedValid", ({ group, value, expectedValid, expectedIssueCode }) => {
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
    expect(RELEASE_MANIFEST_FIXTURES.length).toBeGreaterThan(0);
    expect(RELEASE_STATUS_FIXTURES.length).toBeGreaterThan(0);
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

  it("defines exactly the public, unlisted and private package visibilities", () => {
    expect([...PACKAGE_VISIBILITIES]).toEqual(["public", "unlisted", "private"]);
    for (const v of PACKAGE_VISIBILITIES) expect(isPackageVisibility(v)).toBe(true);
    for (const bad of ["Public", "internal", "", null, 1]) expect(isPackageVisibility(bad)).toBe(false);
  });

  it("protects only private packages and fails closed on unknown stored values", () => {
    expect(isOpenPackageVisibility("public")).toBe(true);
    expect(isOpenPackageVisibility("unlisted")).toBe(true);
    expect(isOpenPackageVisibility("private")).toBe(false);
    expect(isOpenPackageVisibility("PUBLIC")).toBe(false);
    expect(isOpenPackageVisibility("")).toBe(false);
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
