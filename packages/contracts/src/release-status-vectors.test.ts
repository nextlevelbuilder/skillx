import { describe, expect, it } from "vitest";
import {
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_FIXTURE_MANIFEST_DIGEST,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
  RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
  RELEASE_STATUS_FIXTURE_REASON,
  RELEASE_STATUS_PUBLISHED_FIXTURE,
  RELEASE_STATUS_YANKED_FIXTURE,
} from "./fixtures";
import vectorFile from "./fixtures/release-status-v1.json";
import { RELEASE_SIGNATURE_CODES, releaseManifestDigest, signReleaseManifest, verifyReleaseManifest } from "./release-manifest";
import type { SkillxReleaseManifest } from "./release-manifest";
import { signPayload } from "./release-signature";
import { RELEASE_STATUS_CODES, releaseStatusSigningPayload, signReleaseStatus, verifyReleaseStatus } from "./release-status";
import type { SkillxReleaseStatus, UnsignedReleaseStatus } from "./release-status";
import {
  OTHER_VECTOR_KEY_SEED_TEXT,
  VECTOR_KEY_SEED_TEXT,
  base64,
  clone,
  decoder,
  describeVectorKey,
  fromBase64,
  goJsonStyle,
  hex,
  sha256,
  vectorKey,
  writeVectorFile,
  writeVectorsRequested,
} from "./test-support/vector-key";
import type { VectorKey, VectorKeyDescription } from "./test-support/vector-key";

/**
 * Golden cross-language vectors for `skillx.release-status/v1`, exported for
 * AgentKit (`fixtures/release-status-v1.json`). Same public test key as the
 * manifest vectors. `manifests` lists the signed manifests the statuses refer
 * to with their manifest digests; each vector names the release and manifest
 * digests the consumer expects and the status it accepted before for that
 * manifest (`previous`, or `null`).
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface StatusVector {
  name: string;
  expectedReleaseDigest: string;
  expectedManifestDigest: string;
  previous: SkillxReleaseStatus | null;
  status: SkillxReleaseStatus;
}

interface StatusVectors {
  description: string;
  canonicalization: string;
  manifestDigestRule: string;
  consumerRules: string[];
  testKey: VectorKeyDescription;
  manifests: Array<{ name: string; manifest: SkillxReleaseManifest; manifestDigest: string }>;
  valid: Array<StatusVector & { signingPayload: string; signingPayloadSha256: string }>;
  invalid: Array<StatusVector & { expectedCode: string }>;
}

/** Signs any status bytes, including ones `signReleaseStatus` refuses (e.g. an unknown state). */
async function signRaw(status: Record<string, unknown>, key: VectorKey): Promise<SkillxReleaseStatus> {
  const signature = await signPayload(releaseStatusSigningPayload(status as unknown as UnsignedReleaseStatus), key.privateKey);
  return { ...(status as unknown as UnsignedReleaseStatus), signature };
}

async function buildVectors(): Promise<StatusVectors> {
  const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
  const other = await vectorKey(OTHER_VECTOR_KEY_SEED_TEXT);
  const digest = RELEASE_MANIFEST_FIXTURE.releaseDigest;

  // The same tree released as 1.2.0 and 1.2.1: one releaseDigest, two manifest digests.
  const manifests: StatusVectors["manifests"] = [];
  for (const [name, base] of [
    ["1.2.0 of the multi-file tree", RELEASE_MANIFEST_FIXTURE],
    ["1.2.1 of the same tree", { ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" }],
    ["minimal release", RELEASE_MANIFEST_MINIMAL_FIXTURE],
  ] as const) {
    const manifest = await signReleaseManifest(base, key.privateKey);
    manifests.push({ name, manifest, manifestDigest: await releaseManifestDigest(manifest) });
  }
  const nextVersionDigest = manifests[1]!.manifestDigest;

  const published = await signReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE, key.privateKey);
  const yanked = await signReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE, key.privateKey);
  const nextVersionPublished = await signReleaseStatus(
    { ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: nextVersionDigest },
    key.privateKey,
  );

  const valid: StatusVectors["valid"] = [];
  for (const [name, status, previous, manifestDigest] of [
    ["first status of a release", published, null, RELEASE_FIXTURE_MANIFEST_DIGEST],
    ["yanked with a reason after the published status", yanked, published, RELEASE_FIXTURE_MANIFEST_DIGEST],
    ["identical re-fetch of the accepted status", yanked, yanked, RELEASE_FIXTURE_MANIFEST_DIGEST],
    ["first status of another version of the same tree, tracked separately", nextVersionPublished, null, nextVersionDigest],
  ] as const) {
    const payload = releaseStatusSigningPayload(status);
    valid.push({
      name,
      expectedReleaseDigest: digest,
      expectedManifestDigest: manifestDigest,
      previous,
      status,
      signingPayload: decoder.decode(payload),
      signingPayloadSha256: hex(await sha256(payload)),
    });
  }

  const stateChanged = clone(yanked);
  stateChanged.state = "published";
  const reasonChanged = clone(yanked);
  reasonChanged.reason = `${RELEASE_STATUS_FIXTURE_REASON}.`;
  const sequenceRaised = clone(yanked);
  sequenceRaised.sequence = 3;
  const otherKey = await signReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE, other.privateKey);
  const unknownKey = clone(yanked);
  unknownKey.keyId = "skillx-unknown-key";
  const goStyle = clone(yanked);
  goStyle.signature = base64(
    new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, goJsonStyle(releaseStatusSigningPayload(RELEASE_STATUS_YANKED_FIXTURE))),
    ),
  );
  const conflicting = await signReleaseStatus(
    { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: 2, issuedAt: "2026-10-14T09:00:00Z" },
    key.privateKey,
  );
  const unknownState = await signRaw({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, state: "revoked", sequence: 3 }, key);
  const otherRelease = await signReleaseStatus(
    {
      ...RELEASE_STATUS_PUBLISHED_FIXTURE,
      releaseDigest: RELEASE_MANIFEST_MINIMAL_FIXTURE.releaseDigest,
      manifestDigest: RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
    },
    key.privateKey,
  );
  const nextVersionYanked = await signReleaseStatus({ ...RELEASE_STATUS_YANKED_FIXTURE, manifestDigest: nextVersionDigest }, key.privateKey);
  const { manifestDigest: _omitted, ...withoutManifestDigest } = RELEASE_STATUS_PUBLISHED_FIXTURE;
  const missingManifestDigest = await signRaw(withoutManifestDigest, key);
  const wrongManifestDigest = await signReleaseStatus(
    { ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: `sha256:${"e".repeat(64)}` },
    key.privateKey,
  );

  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const invalid = (name: string, status: SkillxReleaseStatus, previous: SkillxReleaseStatus | null, expectedCode: string) => ({
    name,
    expectedReleaseDigest: digest,
    expectedManifestDigest: RELEASE_FIXTURE_MANIFEST_DIGEST,
    previous,
    status,
    expectedCode,
  });

  return {
    description:
      "skillx.release-status/v1 signed status vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "same as skillx.release/v1: padded base64 Ed25519 over the UTF-8 canonical JSON of the status without its signature member; an absent reason is omitted, never null",
    manifestDigestRule:
      "manifestDigest = 'sha256:' + lowercase hex SHA-256 of the manifest signing payload: the UTF-8 canonical JSON of the skillx.release/v1 manifest without its signature member (the exact bytes its signature covers)",
    consumerRules: [
      "validate the structure; a state outside draft|quarantined|published|yanked is status.unknown_state even when signed; a missing member is required",
      "require releaseDigest to equal the verified manifest's releaseDigest, else status.digest_mismatch",
      "require manifestDigest to equal the verified manifest's manifest digest, else status.manifest_mismatch",
      "verify the signature with the trusted key for keyId: signature.unknown_key, signature.invalid_key or signature.mismatch",
      "per manifestDigest, against the last accepted status: a lower sequence is status.rollback; the same sequence with different signed bytes is status.conflict; identical bytes are accepted",
    ],
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
    manifests,
    valid,
    invalid: [
      invalid("state changed after signing", stateChanged, published, mismatch),
      invalid("reason changed after signing", reasonChanged, published, mismatch),
      invalid("sequence raised after signing", sequenceRaised, yanked, mismatch),
      invalid("signed by another key under the trusted key ID", otherKey, published, mismatch),
      invalid("unknown key ID", unknownKey, published, RELEASE_SIGNATURE_CODES.unknownKey),
      invalid("signature over an encoding/json-escaped payload", goStyle, published, mismatch),
      invalid("lower sequence than the accepted status (rollback)", published, yanked, RELEASE_STATUS_CODES.rollback),
      invalid("same sequence with different content (conflict)", conflicting, yanked, RELEASE_STATUS_CODES.conflict),
      invalid("unknown state, correctly signed", unknownState, yanked, RELEASE_STATUS_CODES.unknownState),
      invalid("status of another release tree", otherRelease, null, RELEASE_STATUS_CODES.digestMismatch),
      invalid("status of another version of the same tree", nextVersionYanked, published, RELEASE_STATUS_CODES.manifestMismatch),
      invalid("missing manifestDigest, correctly signed", missingManifestDigest, null, "required"),
      invalid("wrong manifestDigest, correctly signed", wrongManifestDigest, null, RELEASE_STATUS_CODES.manifestMismatch),
    ],
  };
}

const committed = vectorFile as unknown as StatusVectors;

function trustedKeys(): Map<string, Uint8Array> {
  return new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
}

function verifyVector(vector: StatusVector) {
  return verifyReleaseStatus(vector.status, trustedKeys(), {
    releaseDigest: vector.expectedReleaseDigest,
    manifestDigest: vector.expectedManifestDigest,
    previous: vector.previous,
  });
}

describe("skillx.release-status/v1 cross-language vectors", () => {
  it.runIf(writeVectorsRequested)("writes the vector file", async () => {
    await writeVectorFile("release-status-v1.json", await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("match the committed vector file byte for byte in content", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("list verified manifests with their manifest digests", async () => {
    expect(committed.manifests.length).toBe(3);
    expect(committed.manifests[0]!.manifest.releaseDigest).toBe(committed.manifests[1]!.manifest.releaseDigest);
    expect(committed.manifests[0]!.manifestDigest).not.toBe(committed.manifests[1]!.manifestDigest);
    for (const entry of committed.manifests) {
      expect(await verifyReleaseManifest(entry.manifest, trustedKeys()), entry.name).toEqual({ valid: true, issues: [] });
      expect(await releaseManifestDigest(entry.manifest), entry.name).toBe(entry.manifestDigest);
    }
  });

  it.skipIf(writeVectorsRequested)("accept every valid vector", async () => {
    expect(committed.valid.length).toBe(4);
    for (const vector of committed.valid) {
      expect(await verifyVector(vector), vector.name).toEqual({ valid: true, issues: [] });
      expect(decoder.decode(releaseStatusSigningPayload(vector.status))).toBe(vector.signingPayload);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every invalid vector with its code", async () => {
    const codes = new Set<string>();
    for (const vector of committed.invalid) {
      expect((await verifyVector(vector)).issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
      codes.add(vector.expectedCode);
    }
    expect([...codes].sort()).toEqual(
      [...Object.values(RELEASE_STATUS_CODES), RELEASE_SIGNATURE_CODES.mismatch, RELEASE_SIGNATURE_CODES.unknownKey, "required"].sort(),
    );
  });

  it.skipIf(writeVectorsRequested)("signs the reason with raw non-ASCII and HTML characters", () => {
    const yanked = committed.valid[1]!;
    expect(yanked.signingPayload).toContain(RELEASE_STATUS_FIXTURE_REASON);
    expect(yanked.signingPayload).not.toContain("\\u00");
  });
});
