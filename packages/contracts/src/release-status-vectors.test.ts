import { describe, expect, it } from "vitest";
import {
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
  RELEASE_STATUS_FIXTURE_REASON,
  RELEASE_STATUS_PUBLISHED_FIXTURE,
  RELEASE_STATUS_YANKED_FIXTURE,
} from "./fixtures";
import vectorFile from "./fixtures/release-status-v1.json";
import { RELEASE_SIGNATURE_CODES } from "./release-manifest";
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
 * manifest vectors. Each vector names the release digest the consumer expects
 * and the status it accepted before (`previous`, or `null`).
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface StatusVector {
  name: string;
  expectedReleaseDigest: string;
  previous: SkillxReleaseStatus | null;
  status: SkillxReleaseStatus;
}

interface StatusVectors {
  description: string;
  canonicalization: string;
  consumerRules: string[];
  testKey: VectorKeyDescription;
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

  const published = await signReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE, key.privateKey);
  const yanked = await signReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE, key.privateKey);

  const valid: StatusVectors["valid"] = [];
  for (const [name, status, previous] of [
    ["first status of a release", published, null],
    ["yanked with a reason after the published status", yanked, published],
    ["identical re-fetch of the accepted status", yanked, yanked],
  ] as const) {
    const payload = releaseStatusSigningPayload(status);
    valid.push({
      name,
      expectedReleaseDigest: digest,
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
    { ...RELEASE_STATUS_PUBLISHED_FIXTURE, releaseDigest: RELEASE_MANIFEST_MINIMAL_FIXTURE.releaseDigest },
    key.privateKey,
  );

  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const invalid = (name: string, status: SkillxReleaseStatus, previous: SkillxReleaseStatus | null, expectedCode: string) => ({
    name,
    expectedReleaseDigest: digest,
    previous,
    status,
    expectedCode,
  });

  return {
    description:
      "skillx.release-status/v1 signed status vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "same as skillx.release/v1: padded base64 Ed25519 over the UTF-8 canonical JSON of the status without its signature member; an absent reason is omitted, never null",
    consumerRules: [
      "validate the structure; a state outside draft|quarantined|published|yanked is status.unknown_state even when signed",
      "require releaseDigest to equal the verified manifest's releaseDigest, else status.digest_mismatch",
      "verify the signature with the trusted key for keyId: signature.unknown_key, signature.invalid_key or signature.mismatch",
      "with a previously accepted status: a lower sequence is status.rollback; the same sequence with different signed bytes is status.conflict; identical bytes are accepted",
    ],
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
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
      invalid("status of another release", otherRelease, null, RELEASE_STATUS_CODES.digestMismatch),
    ],
  };
}

const committed = vectorFile as unknown as StatusVectors;

function trustedKeys(): Map<string, Uint8Array> {
  return new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
}

describe("skillx.release-status/v1 cross-language vectors", () => {
  it.runIf(writeVectorsRequested)("writes the vector file", async () => {
    await writeVectorFile("release-status-v1.json", await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("match the committed vector file byte for byte in content", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("accept every valid vector", async () => {
    expect(committed.valid.length).toBe(3);
    for (const vector of committed.valid) {
      const result = await verifyReleaseStatus(vector.status, trustedKeys(), {
        releaseDigest: vector.expectedReleaseDigest,
        previous: vector.previous,
      });
      expect(result, vector.name).toEqual({ valid: true, issues: [] });
      expect(decoder.decode(releaseStatusSigningPayload(vector.status))).toBe(vector.signingPayload);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every invalid vector with its code", async () => {
    const codes = new Set<string>();
    for (const vector of committed.invalid) {
      const result = await verifyReleaseStatus(vector.status, trustedKeys(), {
        releaseDigest: vector.expectedReleaseDigest,
        previous: vector.previous,
      });
      expect(result.issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
      codes.add(vector.expectedCode);
    }
    expect([...codes].sort()).toEqual(
      [...Object.values(RELEASE_STATUS_CODES), RELEASE_SIGNATURE_CODES.mismatch, RELEASE_SIGNATURE_CODES.unknownKey].sort(),
    );
  });

  it.skipIf(writeVectorsRequested)("signs the reason with raw non-ASCII and HTML characters", () => {
    const yanked = committed.valid[1]!;
    expect(yanked.signingPayload).toContain(RELEASE_STATUS_FIXTURE_REASON);
    expect(yanked.signingPayload).not.toContain("\\u00");
  });
});
