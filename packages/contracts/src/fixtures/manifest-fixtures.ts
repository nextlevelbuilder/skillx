/**
 * `skillx.package/v1` manifest and verification-evidence fixtures.
 */

import type { CompatibilityDeclarationMap } from "../compatibility";
import type { SkillxPackageManifest } from "../package-manifest";
import type { VerificationEvidence } from "../verification-evidence";
import { FIXTURE_DIGEST } from "./types";
import type { FixtureCase, MutableFixture } from "./types";

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
