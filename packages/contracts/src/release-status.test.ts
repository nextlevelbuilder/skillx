import { describe, expect, it } from "vitest";
import {
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_FIXTURE_MANIFEST_DIGEST,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
  RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
  RELEASE_STATUS_PUBLISHED_FIXTURE,
  RELEASE_STATUS_YANKED_FIXTURE,
} from "./fixtures";
import { RELEASE_SIGNATURE_CODES, ReleaseManifestError, releaseManifestDigest, signReleaseManifest } from "./release-manifest";
import {
  RELEASE_STATUS_CODES,
  RELEASE_STATUS_REASON_MAX_LENGTH,
  releaseStatusSigningPayload,
  signReleaseStatus,
  validateReleaseStatus,
  validateUnsignedReleaseStatus,
  verifyReleaseStatus,
} from "./release-status";
import type { ReleaseStatusVerifyOptions, SkillxReleaseStatus, UnsignedReleaseStatus } from "./release-status";

const decoder = new TextDecoder();
const DIGEST = RELEASE_MANIFEST_FIXTURE.releaseDigest;
const BOUND: ReleaseStatusVerifyOptions = { releaseDigest: DIGEST, manifestDigest: RELEASE_FIXTURE_MANIFEST_DIGEST };

async function generateKey(): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

async function signedPair() {
  const { privateKey, publicKey } = await generateKey();
  const keys = new Map([[RELEASE_FIXTURE_KEY_ID, publicKey]]);
  const published = await signReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE, privateKey);
  const yanked = await signReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE, privateKey);
  return { privateKey, keys, published, yanked };
}

const codes = (result: { issues: { code: string }[] }) => result.issues.map((i) => i.code);

describe("release manifest digest", () => {
  it("is the sha256 of the manifest signing payload and matches the fixture constants", async () => {
    expect(await releaseManifestDigest(RELEASE_MANIFEST_FIXTURE)).toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
    expect(await releaseManifestDigest(RELEASE_MANIFEST_MINIMAL_FIXTURE)).toBe(RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST);
  });

  it("ignores the signature but distinguishes two versions of the same tree", async () => {
    const { privateKey } = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
    expect(await releaseManifestDigest(signed)).toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
    const nextVersion = { ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" };
    expect(nextVersion.releaseDigest).toBe(RELEASE_MANIFEST_FIXTURE.releaseDigest);
    expect(await releaseManifestDigest(nextVersion)).not.toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
  });
});

describe("skillx.release-status/v1 validation", () => {
  it("accepts both unsigned fixtures before signing", () => {
    expect(validateUnsignedReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE)).toEqual({ valid: true, issues: [] });
    expect(validateUnsignedReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE)).toEqual({ valid: true, issues: [] });
  });

  it("rejects non-object input without throwing", () => {
    for (const input of [null, undefined, "published", [], 1]) expect(validateReleaseStatus(input).valid).toBe(false);
  });

  it("reports every required member of an empty object, but not the optional reason", () => {
    const result = validateReleaseStatus({});
    const paths = result.issues.filter((i) => i.code === "required").map((i) => i.path);
    expect(paths.sort()).toEqual(
      [
        "issuedAt",
        "keyId",
        "manifestDigest",
        "releaseDigest",
        "schemaVersion",
        "sequence",
        "signature",
        "signatureAlgorithm",
        "state",
      ].sort(),
    );
    expect(result.issues.filter((i) => i.path === "manifestDigest").map((i) => i.code)).toEqual(["required"]);
  });

  it("rejects an undefined reason member instead of failing to canonicalize", () => {
    const status = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, reason: undefined };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["type"]);
  });

  it("bounds the reason length", () => {
    const at = (length: number) => ({ ...RELEASE_STATUS_YANKED_FIXTURE, reason: "x".repeat(length) });
    expect(validateUnsignedReleaseStatus(at(RELEASE_STATUS_REASON_MAX_LENGTH)).valid).toBe(true);
    expect(codes(validateUnsignedReleaseStatus(at(RELEASE_STATUS_REASON_MAX_LENGTH + 1)))).toEqual(["length"]);
  });

  it("rejects a lone surrogate in the reason", () => {
    const status = { ...RELEASE_STATUS_YANKED_FIXTURE, reason: `bad ${String.fromCharCode(0xd800)}` };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["format"]);
  });

  it("rejects an unsafe sequence", () => {
    const status = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: Number.MAX_SAFE_INTEGER + 1 };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["type"]);
  });
});

describe("skillx.release-status/v1 signing payload", () => {
  it("is byte-stable across member order and omits an absent reason", () => {
    const reordered = Object.fromEntries(Object.entries(RELEASE_STATUS_PUBLISHED_FIXTURE).reverse()) as unknown as UnsignedReleaseStatus;
    expect(releaseStatusSigningPayload(reordered)).toEqual(releaseStatusSigningPayload(RELEASE_STATUS_PUBLISHED_FIXTURE));
    const text = decoder.decode(releaseStatusSigningPayload(RELEASE_STATUS_PUBLISHED_FIXTURE));
    expect(text).toBe(
      `{"issuedAt":"2026-10-13T04:31:00Z","keyId":"skillx-test-vector-1","manifestDigest":"${RELEASE_FIXTURE_MANIFEST_DIGEST}","releaseDigest":"${DIGEST}","schemaVersion":"skillx.release-status/v1","sequence":1,"signatureAlgorithm":"ed25519","state":"published"}`,
    );
  });
});

describe("skillx.release-status/v1 verification", () => {
  it("verifies a first status and a later one against the accepted status", async () => {
    const { keys, published, yanked } = await signedPair();
    expect(await verifyReleaseStatus(published, keys, BOUND)).toEqual({ valid: true, issues: [] });
    expect(await verifyReleaseStatus(yanked, keys, { ...BOUND, previous: published })).toEqual({ valid: true, issues: [] });
    expect(await verifyReleaseStatus(yanked, keys, { ...BOUND, previous: yanked })).toEqual({ valid: true, issues: [] });
  });

  it.each<[string, (s: SkillxReleaseStatus) => void]>([
    ["a changed state", (s) => void (s.state = "published")],
    ["a changed reason", (s) => void (s.reason = "other")],
    ["a removed reason", (s) => void delete s.reason],
    ["a raised sequence", (s) => void (s.sequence = 9)],
    ["a changed issue time", (s) => void (s.issuedAt = "2026-10-15T00:00:00Z")],
  ])("rejects %s", async (_name, tamper) => {
    const { keys, yanked } = await signedPair();
    const tampered = clone(yanked);
    tamper(tampered);
    expect(codes(await verifyReleaseStatus(tampered, keys, BOUND))).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects a manifestDigest changed after signing", async () => {
    const { keys, yanked } = await signedPair();
    const other = await releaseManifestDigest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" });
    const tampered = { ...clone(yanked), manifestDigest: other };
    expect(codes(await verifyReleaseStatus(tampered, keys, { ...BOUND, manifestDigest: other }))).toEqual([
      RELEASE_SIGNATURE_CODES.mismatch,
    ]);
  });

  it("rejects a status signed by another key under the trusted key ID", async () => {
    const { yanked } = await signedPair();
    const trusted = await generateKey();
    const result = await verifyReleaseStatus(yanked, new Map([[RELEASE_FIXTURE_KEY_ID, trusted.publicKey]]), BOUND);
    expect(codes(result)).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects an unknown key ID", async () => {
    const { yanked, keys } = await signedPair();
    const result = await verifyReleaseStatus(yanked, new Map([["skillx-other-key", keys.get(RELEASE_FIXTURE_KEY_ID)!]]), BOUND);
    expect(codes(result)).toEqual([RELEASE_SIGNATURE_CODES.unknownKey]);
  });

  it("rejects a lower sequence than the accepted status", async () => {
    const { keys, published, yanked } = await signedPair();
    expect(codes(await verifyReleaseStatus(published, keys, { ...BOUND, previous: yanked }))).toEqual([RELEASE_STATUS_CODES.rollback]);
  });

  it("rejects a different status with the accepted sequence", async () => {
    const { privateKey, keys, yanked } = await signedPair();
    const rival = await signReleaseStatus({ ...RELEASE_STATUS_YANKED_FIXTURE, state: "published" }, privateKey);
    expect(codes(await verifyReleaseStatus(rival, keys, { ...BOUND, previous: yanked }))).toEqual([RELEASE_STATUS_CODES.conflict]);
  });

  it("rejects a status of another release tree", async () => {
    const { keys, published } = await signedPair();
    const result = await verifyReleaseStatus(published, keys, {
      releaseDigest: RELEASE_MANIFEST_MINIMAL_FIXTURE.releaseDigest,
      manifestDigest: RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
    });
    expect(codes(result)).toEqual([RELEASE_STATUS_CODES.digestMismatch]);
  });

  it("rejects a status of another version of the same tree", async () => {
    const { privateKey, keys, published } = await signedPair();
    const otherVersion = await releaseManifestDigest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" });
    // A status for 1.2.1 does not apply to 1.2.0, although both share the tree digest.
    const forOther = await signReleaseStatus({ ...RELEASE_STATUS_YANKED_FIXTURE, manifestDigest: otherVersion }, privateKey);
    expect(codes(await verifyReleaseStatus(forOther, keys, BOUND))).toEqual([RELEASE_STATUS_CODES.manifestMismatch]);
    // Sequences are tracked per manifest: 1.2.1's status at sequence 1 is not a rollback of 1.2.0's sequence 2.
    const firstForOther = await signReleaseStatus({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: otherVersion }, privateKey);
    expect(await verifyReleaseStatus(firstForOther, keys, { releaseDigest: DIGEST, manifestDigest: otherVersion })).toEqual({
      valid: true,
      issues: [],
    });
    expect(published.manifestDigest).not.toBe(otherVersion);
  });

  it("fails closed on an unknown state before checking the signature", async () => {
    const { keys, published } = await signedPair();
    const unknown = { ...clone(published), state: "revoked" };
    expect(codes(await verifyReleaseStatus(unknown, keys, BOUND))).toEqual([RELEASE_STATUS_CODES.unknownState]);
  });

  it("throws when the caller passes a previous status of another manifest", async () => {
    const { privateKey, keys, yanked } = await signedPair();
    const otherVersion = await releaseManifestDigest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" });
    const foreign = await signReleaseStatus({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: otherVersion }, privateKey);
    await expect(verifyReleaseStatus(yanked, keys, { ...BOUND, previous: foreign })).rejects.toBeInstanceOf(ReleaseManifestError);
  });

  it("refuses to sign an unknown state", async () => {
    const { privateKey } = await generateKey();
    const invalid = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, state: "revoked" } as unknown as UnsignedReleaseStatus;
    await expect(signReleaseStatus(invalid, privateKey)).rejects.toBeInstanceOf(ReleaseManifestError);
  });
});
