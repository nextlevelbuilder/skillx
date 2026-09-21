/**
 * Shared validator fixtures for `skillx.package/v1` and its sibling contracts.
 *
 * These are the single set of examples every surface validates against, so a
 * schema change forces one fixture update instead of five.
 */

import type { CompatibilityDeclarationMap } from "./compatibility";
import type { SkillxPackageManifest } from "./package-manifest";
import type { VerificationEvidence } from "./verification-evidence";

/** A syntactically valid digest used by fixtures. */
export const FIXTURE_DIGEST = `sha256:${"a".repeat(64)}`;
export const FIXTURE_OTHER_DIGEST = `sha256:${"b".repeat(64)}`;

export const COMPATIBILITY_DECLARATION_FIXTURE: CompatibilityDeclarationMap = {
  "claude-code": {
    status: "declared",
    versions: ">=2.0.0 <3.0.0",
    scopes: ["project"],
    requires: ["hooks.PreToolUse", { capability: "hooks.PostToolUse", optional: true }],
  },
  codex: { status: "unsupported" },
};

/** The roadmap's hook-pack example, used as the canonical valid manifest. */
export const PACKAGE_MANIFEST_FIXTURE: SkillxPackageManifest = {
  schemaVersion: "skillx.package/v1",
  name: "@publisher/review-guardrails",
  version: "0.1.0",
  kind: "hook-pack",
  compatible: COMPATIBILITY_DECLARATION_FIXTURE,
  environment: {
    os: ["macos", "linux"],
    runtimes: { node: ">=20" },
  },
};

export const VERIFICATION_EVIDENCE_FIXTURE: VerificationEvidence = {
  releaseDigest: FIXTURE_DIGEST,
  harness: "claude-code",
  harnessVersion: "2.1.0",
  os: "linux",
  probeId: "skillx-compat-probe/hook-pack",
  verifiedAt: "2026-09-15T10:00:00.000Z",
  verifier: "skillx-ci",
};

export interface FixtureCase<T = unknown> {
  name: string;
  group: "package-manifest" | "verification-evidence" | "collection-member" | "entitlement" | "listing-import" | "release-publish";
  value: T;
  expectedValid: boolean;
  /** Code expected to appear in the issues when `expectedValid` is false. */
  expectedIssueCode?: string;
}

/** A shallow-cloned plain-data fixture that a case may mutate before validation. */
type MutableFixture = Record<string, unknown>;

function cloneManifest(): MutableFixture {
  const environment = PACKAGE_MANIFEST_FIXTURE.environment ?? {};
  return {
    ...PACKAGE_MANIFEST_FIXTURE,
    compatible: { ...COMPATIBILITY_DECLARATION_FIXTURE },
    environment: {
      os: [...(environment.os ?? [])],
      runtimes: { ...(environment.runtimes ?? {}) },
    },
  };
}

function manifest(mutate: (draft: MutableFixture) => void): MutableFixture {
  const draft = cloneManifest();
  mutate(draft);
  return draft;
}

function evidence(mutate: (draft: MutableFixture) => void): MutableFixture {
  const draft: MutableFixture = { ...VERIFICATION_EVIDENCE_FIXTURE };
  mutate(draft);
  return draft;
}

export const PACKAGE_MANIFEST_FIXTURES: FixtureCase[] = [
  { name: "valid hook-pack", group: "package-manifest", value: PACKAGE_MANIFEST_FIXTURE, expectedValid: true },
  {
    name: "valid skill kind",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.kind = "skill";
    }),
    expectedValid: true,
  },
  {
    name: "valid bundle kind",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.kind = "bundle";
    }),
    expectedValid: true,
  },
  {
    name: "rejects unprefixed package name",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.name = "review-guardrails";
    }),
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "rejects non-semver version",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.version = "v1";
    }),
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "rejects unknown kind",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.kind = "plugin";
    }),
    expectedValid: false,
    expectedIssueCode: "unsupported_value",
  },
  {
    name: "rejects wrong schemaVersion",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.schemaVersion = "skillx.package/v2";
    }),
    expectedValid: false,
    expectedIssueCode: "unsupported_value",
  },
  {
    name: "rejects bad compatibility status",
    group: "package-manifest",
    value: manifest((draft) => {
      draft.compatible = { "claude-code": { status: "maybe" } };
    }),
    expectedValid: false,
    expectedIssueCode: "unsupported_value",
  },
];

export const VERIFICATION_EVIDENCE_FIXTURES: FixtureCase[] = [
  { name: "valid evidence", group: "verification-evidence", value: VERIFICATION_EVIDENCE_FIXTURE, expectedValid: true },
  {
    name: "rejects malformed digest",
    group: "verification-evidence",
    value: evidence((draft) => {
      draft.releaseDigest = "sha256:xyz";
    }),
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "rejects missing harness version",
    group: "verification-evidence",
    value: evidence((draft) => {
      delete draft.harnessVersion;
    }),
    expectedValid: false,
    expectedIssueCode: "required",
  },
  {
    name: "rejects non-ISO timestamp",
    group: "verification-evidence",
    value: evidence((draft) => {
      draft.verifiedAt = "15/09/2026";
    }),
    expectedValid: false,
    expectedIssueCode: "format",
  },
  {
    name: "rejects missing verifier",
    group: "verification-evidence",
    value: evidence((draft) => {
      draft.verifier = "";
    }),
    expectedValid: false,
    expectedIssueCode: "required",
  },
];

export const COLLECTION_MEMBER_FIXTURES: FixtureCase[] = [
  {
    name: "valid member with digest",
    group: "collection-member",
    value: { packageName: "@zuey/work", version: "1.2.3", digest: FIXTURE_DIGEST },
    expectedValid: true,
  },
  {
    name: "valid optional member",
    group: "collection-member",
    value: { packageName: "@zuey/work", optional: true },
    expectedValid: true,
  },
  {
    name: "rejects bare slug",
    group: "collection-member",
    value: { packageName: "work" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "rejects bad digest",
    group: "collection-member",
    value: { packageName: "@zuey/work", digest: "deadbeef" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
];

export const ENTITLEMENT_FIXTURES: FixtureCase[] = [
  {
    name: "valid purchase entitlement",
    group: "entitlement",
    value: {
      id: "ent_1",
      subjectId: "user_1",
      packageName: "@zuey/work",
      source: "purchase",
      orderId: "order_1",
      grantedAt: "2026-09-15T10:00:00.000Z",
    },
    expectedValid: true,
  },
  {
    name: "valid grant entitlement",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "grant", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: true,
  },
  {
    name: "rejects purchase without orderId",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "purchase", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "required",
  },
  {
    name: "rejects unknown source",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "bribe", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "unsupported_value",
  },
];

export const INGESTION_FIXTURES: FixtureCase[] = [
  {
    name: "valid import",
    group: "listing-import",
    value: { mode: "import", sourceUrl: "https://github.com/o/r/tree/main/skills/x", fetchedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: true,
  },
  {
    name: "rejects relative import source",
    group: "listing-import",
    value: { mode: "import", sourceUrl: "/skills/x", fetchedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "valid publish",
    group: "release-publish",
    value: {
      mode: "publish",
      packageName: "@agentkit/engineer",
      version: "1.2.3",
      kind: "skill",
      channel: "beta",
      releaseState: "quarantined",
      releaseDigest: FIXTURE_DIGEST,
      artifactSize: 2048,
    },
    expectedValid: true,
  },
  {
    name: "rejects publish without digest",
    group: "release-publish",
    value: { mode: "publish", version: "1.2.3", kind: "skill", releaseState: "draft", artifactSize: 2048 },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
];

export const ALL_FIXTURES: FixtureCase[] = [
  ...PACKAGE_MANIFEST_FIXTURES,
  ...VERIFICATION_EVIDENCE_FIXTURES,
  ...COLLECTION_MEMBER_FIXTURES,
  ...ENTITLEMENT_FIXTURES,
  ...INGESTION_FIXTURES,
];
