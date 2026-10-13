/**
 * `skillx.release-status/v1` fixtures. Statuses describe the releases of
 * `release-fixtures.ts`; the signed cross-language vectors in
 * `release-status-v1.json` are built from them.
 */

import type { SkillxReleaseStatus, UnsignedReleaseStatus } from "../release-status";
import { RELEASE_FIXTURE_KEY_ID, RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE, RELEASE_MANIFEST_FIXTURE } from "./release-fixtures";
import type { FixtureCase, MutableFixture } from "./types";

/**
 * A reason with non-ASCII, `&`, `<` and `>`, which the canonical JSON emits
 * raw. Built from code points so no editor can normalize it.
 */
export const RELEASE_STATUS_FIXTURE_REASON = `Yanked: unsafe script <scripts/check.sh> & caf${String.fromCodePoint(0xe9)} notes`;

/** `releaseManifestDigest(RELEASE_MANIFEST_FIXTURE)`; recomputed by a test. */
export const RELEASE_FIXTURE_MANIFEST_DIGEST = "sha256:64de9b194abf1627ca00c09be146106c3c044637eeba2c27fb031d5b171312bc";
/** `releaseManifestDigest(RELEASE_MANIFEST_MINIMAL_FIXTURE)`; recomputed by a test. */
export const RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST = "sha256:5979df5f8e7c400ac422183440040742bb34274bca37c9347d100948871e3596";

/** The first status of the full fixture release. */
export const RELEASE_STATUS_PUBLISHED_FIXTURE: UnsignedReleaseStatus = {
  schemaVersion: "skillx.release-status/v1",
  releaseDigest: RELEASE_MANIFEST_FIXTURE.releaseDigest,
  manifestDigest: RELEASE_FIXTURE_MANIFEST_DIGEST,
  state: "published",
  issuedAt: "2026-10-13T04:31:00Z",
  sequence: 1,
  keyId: RELEASE_FIXTURE_KEY_ID,
  signatureAlgorithm: "ed25519",
};

/** A later status of the same release, with a reason. */
export const RELEASE_STATUS_YANKED_FIXTURE: UnsignedReleaseStatus = {
  schemaVersion: "skillx.release-status/v1",
  releaseDigest: RELEASE_MANIFEST_FIXTURE.releaseDigest,
  manifestDigest: RELEASE_FIXTURE_MANIFEST_DIGEST,
  state: "yanked",
  reason: RELEASE_STATUS_FIXTURE_REASON,
  issuedAt: "2026-10-14T09:00:00Z",
  sequence: 2,
  keyId: RELEASE_FIXTURE_KEY_ID,
  signatureAlgorithm: "ed25519",
};

function signedStatusDraft(base: UnsignedReleaseStatus): MutableFixture {
  const copy = JSON.parse(JSON.stringify(base)) as SkillxReleaseStatus;
  copy.signature = RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE;
  return copy as unknown as MutableFixture;
}

function rejected(name: string, expectedIssueCode: string, mutate: (draft: MutableFixture) => void): FixtureCase {
  const draft = signedStatusDraft(RELEASE_STATUS_YANKED_FIXTURE);
  mutate(draft);
  return { name, group: "release-status", value: draft, expectedValid: false, expectedIssueCode };
}

/** Structure-only cases for `validateReleaseStatus`; signatures are placeholders. */
export const RELEASE_STATUS_FIXTURES: FixtureCase[] = [
  { name: "valid status without a reason", group: "release-status", value: signedStatusDraft(RELEASE_STATUS_PUBLISHED_FIXTURE), expectedValid: true },
  { name: "valid status with a reason", group: "release-status", value: signedStatusDraft(RELEASE_STATUS_YANKED_FIXTURE), expectedValid: true },
  rejected("rejects an unknown state", "status.unknown_state", (d) => {
    d.state = "revoked";
  }),
  rejected("rejects a missing state", "required", (d) => {
    delete d.state;
  }),
  rejected("rejects an unknown member", "unknown_field", (d) => {
    d.expiresAt = "2027-01-01T00:00:00Z";
  }),
  rejected("rejects a missing signature", "required", (d) => {
    delete d.signature;
  }),
  rejected("rejects a zero sequence", "type", (d) => {
    d.sequence = 0;
  }),
  rejected("rejects a fractional sequence", "type", (d) => {
    d.sequence = 1.5;
  }),
  rejected("rejects a numeric-string sequence", "type", (d) => {
    d.sequence = "2";
  }),
  rejected("rejects an empty reason", "length", (d) => {
    d.reason = "";
  }),
  rejected("rejects a null reason", "type", (d) => {
    d.reason = null;
  }),
  rejected("rejects a control character in the reason", "format", (d) => {
    d.reason = `line one${String.fromCodePoint(0x0a)}line two`;
  }),
  rejected("rejects a bare-hex releaseDigest", "pattern", (d) => {
    d.releaseDigest = "c".repeat(64);
  }),
  rejected("rejects a missing manifestDigest", "required", (d) => {
    delete d.manifestDigest;
  }),
  rejected("rejects an uppercase manifestDigest", "pattern", (d) => {
    d.manifestDigest = String(d.manifestDigest).toUpperCase();
  }),
  rejected("rejects a timestamp with an offset", "format", (d) => {
    d.issuedAt = "2026-10-14T16:00:00+07:00";
  }),
  rejected("rejects the release manifest schema version", "unsupported_value", (d) => {
    d.schemaVersion = "skillx.release/v1";
  }),
  rejected("rejects a key ID outside the registry pattern", "pattern", (d) => {
    d.keyId = "Key ID";
  }),
  rejected("rejects another signature algorithm", "unsupported_value", (d) => {
    d.signatureAlgorithm = "rsa-pss";
  }),
];
