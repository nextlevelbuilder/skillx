/**
 * `skillx.release/v2` manifest fixtures: v1 members plus `provenance`.
 *
 * They reuse the v1 file trees (`RELEASE_FIXTURE_CONTENTS`), so the per-file
 * hashes and `releaseDigest` match the v1 fixtures and only the identity,
 * publisher and provenance differ. The signed cross-language vectors in
 * `release-manifest-v2.json` are built from these manifests.
 */

import type { SkillxReleaseManifest, UnsignedReleaseManifestV2 } from "../release-manifest";
import {
  RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
} from "./release-fixtures";
import type { FixtureCase, MutableFixture } from "./types";

/** An AgentKit foundation skill released from a signed kit: `@agentkit/*` with provider `kit`. */
export const RELEASE_MANIFEST_V2_KIT_FIXTURE: UnsignedReleaseManifestV2 = {
  ...RELEASE_MANIFEST_FIXTURE,
  schemaVersion: "skillx.release/v2",
  identity: "@agentkit/review-guardrails",
  publisher: { handle: "agentkit", verifiedBy: "admin" },
  sourceProvenance: {
    repo: "https://github.com/bestagentkits/agentkit",
    commit: "0123456789abcdef0123456789abcdef01234567",
    path: "kits/core/skills/ak-review-guardrails",
  },
  provenance: { provider: "kit", origin: "remote-signed" },
};

/** A kit release packed from a development build of the kit. */
export const RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE: UnsignedReleaseManifestV2 = {
  ...RELEASE_MANIFEST_MINIMAL_FIXTURE,
  schemaVersion: "skillx.release/v2",
  identity: "@agentkit/tiny_skill",
  publisher: { handle: "agentkit", verifiedBy: "admin" },
  provenance: { provider: "kit", origin: "local-dev" },
};

/** An ordinary SkillX release written as v2: provider `skillx`, no origin. */
export const RELEASE_MANIFEST_V2_SKILLX_FIXTURE: UnsignedReleaseManifestV2 = {
  ...RELEASE_MANIFEST_MINIMAL_FIXTURE,
  schemaVersion: "skillx.release/v2",
  provenance: { provider: "skillx" },
};

type Draft = MutableFixture & {
  publisher: Record<string, unknown>;
  provenance?: unknown;
};

/** The draft's provenance as a mutable record; every base fixture carries one. */
const provenanceOf = (draft: Draft) => draft.provenance as Record<string, unknown>;

/** A deep, mutable copy of a v2 fixture with a placeholder signature. */
export function signedReleaseV2Draft(base: UnsignedReleaseManifestV2 = RELEASE_MANIFEST_V2_KIT_FIXTURE): MutableFixture {
  const copy = JSON.parse(JSON.stringify(base)) as SkillxReleaseManifest;
  copy.signature = RELEASE_FIXTURE_PLACEHOLDER_SIGNATURE;
  return copy as unknown as MutableFixture;
}

function rejected(name: string, expectedIssueCode: string, mutate: (draft: Draft) => void, base?: UnsignedReleaseManifestV2): FixtureCase {
  const draft = signedReleaseV2Draft(base) as Draft;
  mutate(draft);
  return { name, group: "release-manifest", value: draft, expectedValid: false, expectedIssueCode };
}

const valid = (name: string, base: UnsignedReleaseManifestV2): FixtureCase => ({
  name,
  group: "release-manifest",
  value: signedReleaseV2Draft(base),
  expectedValid: true,
});

/** Structure-only cases for `validateReleaseManifest` on v2; signatures are placeholders. */
export const RELEASE_MANIFEST_V2_FIXTURES: FixtureCase[] = [
  valid("valid v2 remote-signed kit release", RELEASE_MANIFEST_V2_KIT_FIXTURE),
  valid("valid v2 local-dev kit release", RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE),
  valid("valid v2 skillx release", RELEASE_MANIFEST_V2_SKILLX_FIXTURE),
  rejected("rejects a v2 manifest without provenance", "required", (d) => {
    delete d.provenance;
  }),
  rejected("rejects a v1 manifest that carries provenance", "unknown_field", (d) => {
    d.schemaVersion = "skillx.release/v1";
  }),
  rejected("rejects an unknown schema version", "unsupported_value", (d) => {
    d.schemaVersion = "skillx.release/v3";
  }),
  rejected("rejects a provenance that is not an object", "type", (d) => {
    d.provenance = "kit";
  }),
  rejected("rejects a provider other than skillx or kit", "unsupported_value", (d) => {
    d.provenance = { provider: "git" };
  }),
  rejected("rejects a kit provenance without origin", "required", (d) => {
    delete provenanceOf(d).origin;
  }),
  rejected("rejects an unknown kit origin", "unsupported_value", (d) => {
    provenanceOf(d).origin = "registry-signed";
  }),
  rejected("rejects an origin on a skillx provenance", "unknown_field", (d) => {
    d.provenance = { provider: "skillx", origin: "remote-signed" };
  }),
  rejected("rejects an unknown provenance member", "unknown_field", (d) => {
    provenanceOf(d).verified = true;
  }),
  rejected("rejects a kit release outside the @agentkit publisher", "identity.invalid", (d) => {
    d.identity = "@bestagentkits/review-guardrails";
    d.publisher.handle = "bestagentkits";
  }),
  rejected("rejects the @agentkit publisher with provider skillx", "identity.reserved_publisher", (d) => {
    d.provenance = { provider: "skillx" };
  }),
  rejected(
    "rejects an ak- slug with provider skillx",
    "identity.reserved_alias",
    (d) => {
      d.identity = "@solo.dev/ak-plan";
    },
    RELEASE_MANIFEST_V2_SKILLX_FIXTURE,
  ),
  rejected("rejects a kit publisher handle that differs from the identity", "mismatch", (d) => {
    d.publisher.handle = "bestagentkits";
  }),
];
