/**
 * `skillx.release/v1` manifest fixtures.
 *
 * File contents are part of the fixture so every consumer can recompute the
 * per-file hashes and `releaseDigest` (the `agentkit.skill-tree/v1` tree
 * digest) instead of trusting the literals. The signed cross-language vectors
 * in `release-manifest-v1.json` are built from these manifests.
 */

import type { SkillxReleaseManifest, UnsignedReleaseManifest } from "../release-manifest";
import type { FixtureCase, MutableFixture } from "./types";

/** Key ID of the public, test-only vector key; never trusted outside tests. */
export const RELEASE_FIXTURE_KEY_ID = "skillx-test-vector-1";

/** A well-formed placeholder signature for structure-only fixtures; it verifies under no key. */
export const RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE = `${"A".repeat(86)}==`;

/**
 * A path with non-ASCII, `&` and U+2028, which the canonical JSON emits raw
 * (Go's encoding/json would escape `&` and U+2028). Built from code points
 * so no editor or formatter can normalize it.
 */
export const RELEASE_FIXTURE_UNICODE_PATH = `references/caf${String.fromCodePoint(0xe9)} & notes${String.fromCodePoint(0x2028)}.md`;

/** Exact file contents of each fixture tree, keyed by path. */
export const RELEASE_FIXTURE_CONTENTS: Readonly<Record<"full" | "minimal", Readonly<Record<string, string>>>> = {
  full: {
    "SKILL.md": "---\nname: review-guardrails\ndescription: Review guardrails for pull requests.\n---\n# Review guardrails\n",
    [RELEASE_FIXTURE_UNICODE_PATH]: "Notes with a line separator path.\n",
    "scripts/check.sh": "#!/bin/sh\necho ok\n",
  },
  minimal: {
    "SKILL.md": "---\nname: tiny\ndescription: Tiny skill.\n---\n",
  },
};

/** A published, publisher-verified multi-file release with git provenance and a declared script. */
export const RELEASE_MANIFEST_FIXTURE: UnsignedReleaseManifest = {
  schemaVersion: "skillx.release/v1",
  identity: "@publisher/review-guardrails",
  version: "1.2.0",
  channel: "stable",
  kind: "skill",
  releaseDigest: "sha256:4c2eac09c7ba5fc5e0d642959c7e38b65a53ca08e65b8e728d6ca5798e458974",
  artifactDigest: `sha256:${"c".repeat(64)}`,
  artifactSize: 10240,
  files: [
    { path: "SKILL.md", mode: "100644", sha256: "bcfdc953c1af6a7fdfde9d0a99d73bfba6a5fad8bb81d484b3bb416461ab5b11", size: 102 },
    {
      path: RELEASE_FIXTURE_UNICODE_PATH,
      mode: "100644",
      sha256: "d8bcfd787914776aba5f5923ce82d187239133d4c4fd46efd26c83aae0f0a84f",
      size: 34,
    },
    { path: "scripts/check.sh", mode: "100755", sha256: "b4d644d4279594903f1a9911956432d9473041f2984fc6014c14d7402c7d126c", size: 18 },
  ],
  fileCount: 3,
  treeSize: 154,
  state: "published",
  publisher: { handle: "publisher", verifiedBy: "github" },
  sourceProvenance: {
    repo: "https://github.com/publisher/review-guardrails",
    commit: "0123456789abcdef0123456789abcdef01234567",
    path: "skills/review-guardrails",
  },
  declaredScripts: ["scripts/check.sh"],
  createdAt: "2026-10-13T04:30:00Z",
  keyId: RELEASE_FIXTURE_KEY_ID,
  signatureAlgorithm: "ed25519",
};

/** A quarantined, unverified single-file prerelease without provenance: covers `null` and empty arrays. */
export const RELEASE_MANIFEST_MINIMAL_FIXTURE: UnsignedReleaseManifest = {
  schemaVersion: "skillx.release/v1",
  identity: "@solo.dev/tiny_skill",
  version: "0.1.0-beta.1",
  channel: "beta",
  kind: "skill",
  releaseDigest: "sha256:2b80424f6839c7ae445108317a623797ecab4ee94fbb6cddbc9695326aed8544",
  artifactDigest: `sha256:${"d".repeat(64)}`,
  artifactSize: 1536,
  files: [{ path: "SKILL.md", mode: "100644", sha256: "7822f865b6a9be616262a844ffb54085d095857dcf35a172150523db31a3726d", size: 44 }],
  fileCount: 1,
  treeSize: 44,
  state: "quarantined",
  publisher: { handle: "solo.dev", verifiedBy: "none" },
  sourceProvenance: null,
  declaredScripts: [],
  createdAt: "2026-10-13T05:00:00Z",
  keyId: RELEASE_FIXTURE_KEY_ID,
  signatureAlgorithm: "ed25519",
};

/** A deep, mutable copy of the full fixture with a placeholder signature. */
export function signedReleaseDraft(base: UnsignedReleaseManifest = RELEASE_MANIFEST_FIXTURE): MutableFixture {
  const copy = JSON.parse(JSON.stringify(base)) as SkillxReleaseManifest;
  copy.signature = RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE;
  return copy as unknown as MutableFixture;
}

type Draft = MutableFixture & {
  files: Array<Record<string, unknown>>;
  publisher: Record<string, unknown>;
  sourceProvenance: Record<string, unknown>;
};

function release(mutate: (draft: Draft) => void): MutableFixture {
  const draft = signedReleaseDraft() as Draft;
  mutate(draft);
  return draft;
}

function rejected(name: string, expectedIssueCode: string, mutate: (draft: Draft) => void): FixtureCase {
  return { name, group: "release-manifest", value: release(mutate), expectedValid: false, expectedIssueCode };
}

/** Structure-only cases for `validateReleaseManifest`; signatures are placeholders. */
export const RELEASE_MANIFEST_FIXTURES: FixtureCase[] = [
  { name: "valid multi-file release", group: "release-manifest", value: signedReleaseDraft(), expectedValid: true },
  {
    name: "valid minimal release",
    group: "release-manifest",
    value: signedReleaseDraft(RELEASE_MANIFEST_MINIMAL_FIXTURE),
    expectedValid: true,
  },
  rejected("rejects an unknown top-level field", "unknown_field", (d) => {
    d.price = 0;
  }),
  rejected("rejects an unknown file field", "unknown_field", (d) => {
    d.files[0]!.executable = false;
  }),
  rejected("rejects a missing signature", "required", (d) => {
    delete d.signature;
  }),
  rejected("rejects an uppercase releaseDigest", "pattern", (d) => {
    d.releaseDigest = String(d.releaseDigest).toUpperCase().replace("SHA256", "sha256");
  }),
  rejected("rejects a bare-hex artifactDigest", "pattern", (d) => {
    d.artifactDigest = "c".repeat(64);
  }),
  rejected("rejects a parent-directory path", "tree.unsafe_path", (d) => {
    d.files[0]!.path = "../x";
  }),
  rejected("rejects a duplicate path", "duplicate", (d) => {
    d.files[1]!.path = "SKILL.md";
  }),
  rejected("rejects unsorted files", "order", (d) => {
    d.files.reverse();
  }),
  rejected("rejects a case-colliding path", "tree.case_collision", (d) => {
    d.files[0]!.path = "Scripts/check.sh";
    d.files.sort((a, b) => (String(a.path) < String(b.path) ? -1 : 1));
  }),
  rejected("rejects a non-NFC path", "tree.non_nfc_path", (d) => {
    // "e" followed by U+0301 COMBINING ACUTE ACCENT, the NFD form of U+00E9.
    d.files[1]!.path = `references/cafe${String.fromCodePoint(0x301)}.md`;
  }),
  rejected("rejects excluded noise", "tree.unsafe_path", (d) => {
    d.files[1]!.path = "references/.DS_Store";
  }),
  rejected("rejects an unknown file mode", "unsupported_value", (d) => {
    d.files[0]!.mode = "120000";
  }),
  rejected("rejects an uppercase file hash", "pattern", (d) => {
    d.files[0]!.sha256 = String(d.files[0]!.sha256).toUpperCase();
  }),
  rejected("rejects a release state outside the enum", "unsupported_value", (d) => {
    d.state = "blocked";
  }),
  rejected("rejects the reserved @agentkit publisher", "identity.reserved_publisher", (d) => {
    d.identity = "@agentkit/review-guardrails";
    d.publisher.handle = "agentkit";
  }),
  rejected("rejects an identity with a reserved device-name slug", "identity.invalid", (d) => {
    d.identity = "@publisher/con";
  }),
  rejected("rejects a publisher handle that differs from the identity", "mismatch", (d) => {
    d.publisher.handle = "someone-else";
  }),
  rejected("rejects an unknown publisher verification", "unsupported_value", (d) => {
    d.publisher.verifiedBy = "self";
  }),
  rejected("rejects a wrong fileCount", "mismatch", (d) => {
    d.fileCount = 4;
  }),
  rejected("rejects a wrong treeSize", "mismatch", (d) => {
    d.treeSize = 155;
  }),
  rejected("rejects a declared script missing from files", "not_found", (d) => {
    d.declaredScripts = ["scripts/missing.sh"];
  }),
  rejected("rejects a non-https source repo", "format", (d) => {
    d.sourceProvenance.repo = "http://github.com/publisher/review-guardrails";
  }),
  rejected("rejects an abbreviated source commit", "pattern", (d) => {
    d.sourceProvenance.commit = "0123456";
  }),
  rejected("rejects a timestamp with fractional seconds", "format", (d) => {
    d.createdAt = "2026-10-13T04:30:00.000Z";
  }),
  rejected("rejects an impossible calendar date", "format", (d) => {
    d.createdAt = "2026-02-30T00:00:00Z";
  }),
  rejected("rejects a key ID outside the registry pattern", "pattern", (d) => {
    d.keyId = "Key ID";
  }),
  rejected("rejects another signature algorithm", "unsupported_value", (d) => {
    d.signatureAlgorithm = "rsa-pss";
  }),
  rejected("rejects an unpadded signature", "pattern", (d) => {
    d.signature = "A".repeat(86);
  }),
];
