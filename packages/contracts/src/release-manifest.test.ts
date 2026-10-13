import { describe, expect, it } from "vitest";
import {
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_FIXTURE_UNICODE_PATH,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
  signedReleaseDraft,
} from "./fixtures";
import {
  RELEASE_SIGNATURE_CODES,
  ReleaseManifestError,
  compareUtf8,
  releaseSigningPayload,
  signReleaseManifest,
  validateReleaseManifest,
  validateUnsignedReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest";
import type { SkillxReleaseManifest, UnsignedReleaseManifest } from "./release-manifest";

const decoder = new TextDecoder();

async function generateKey(): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const publicKey = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  return { privateKey: pair.privateKey, publicKey };
}

/** Rebuilds `value` with every object's keys inserted in reverse order. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)]),
    );
  }
  return value;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function flipBase64Byte(signature: string): string {
  const bytes = Uint8Array.from(atob(signature), (c) => c.charCodeAt(0));
  bytes[0] = bytes[0]! ^ 0x01;
  return btoa(String.fromCharCode(...bytes));
}

describe("skillx.release/v1 validation", () => {
  it("accepts both unsigned fixtures before signing", () => {
    expect(validateUnsignedReleaseManifest(RELEASE_MANIFEST_FIXTURE)).toEqual({ valid: true, issues: [] });
    expect(validateUnsignedReleaseManifest(RELEASE_MANIFEST_MINIMAL_FIXTURE)).toEqual({ valid: true, issues: [] });
  });

  it("rejects a signature on an unsigned manifest", () => {
    const result = validateUnsignedReleaseManifest(signedReleaseDraft());
    expect(result.issues).toContainEqual(expect.objectContaining({ path: "signature", code: "unknown_field" }));
  });

  it("rejects non-object input without throwing", () => {
    for (const input of [null, undefined, "skillx.release/v1", [], 7]) {
      expect(validateReleaseManifest(input).valid).toBe(false);
    }
  });

  it("reports every missing field of an empty object", () => {
    const paths = validateReleaseManifest({}).issues.filter((i) => i.code === "required").map((i) => i.path);
    expect(paths).toContain("releaseDigest");
    expect(paths).toContain("signature");
    expect(paths).toHaveLength(19);
  });

  it("rejects unknown nested publisher and provenance fields", () => {
    const draft = signedReleaseDraft() as Record<string, Record<string, unknown>>;
    draft.publisher!.email = "x@example.com";
    draft.sourceProvenance!.ref = "main";
    const paths = validateReleaseManifest(draft).issues.map((i) => `${i.path}:${i.code}`);
    expect(paths).toContain("publisher.email:unknown_field");
    expect(paths).toContain("sourceProvenance.ref:unknown_field");
  });

  it("accepts a release at the repository root", () => {
    const draft = signedReleaseDraft() as Record<string, Record<string, unknown>>;
    draft.sourceProvenance!.path = "";
    expect(validateReleaseManifest(draft).valid).toBe(true);
  });

  it("rejects unsorted declared scripts", () => {
    const draft = signedReleaseDraft();
    draft.declaredScripts = ["scripts/check.sh", "SKILL.md"];
    expect(validateReleaseManifest(draft).issues.map((i) => i.code)).toContain("order");
  });

  it("orders paths by UTF-8 bytes, not UTF-16 code units", () => {
    // U+FF61 is one UTF-16 unit above the surrogates but sorts before U+1F600 in UTF-8.
    expect(compareUtf8(String.fromCodePoint(0xff61), String.fromCodePoint(0x1f600))).toBe(-1);
    expect(compareUtf8("a", "a/")).toBe(-1);
    expect(compareUtf8("b", "b")).toBe(0);
  });
});

describe("skillx.release/v1 signing payload", () => {
  it("is byte-stable across member order", async () => {
    const reordered = reverseKeys(RELEASE_MANIFEST_FIXTURE) as UnsignedReleaseManifest;
    expect(Object.keys(reordered)[0]).toBe("signatureAlgorithm");
    expect(releaseSigningPayload(reordered)).toEqual(releaseSigningPayload(RELEASE_MANIFEST_FIXTURE));
  });

  it("excludes only the signature member", async () => {
    const { privateKey } = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
    expect(releaseSigningPayload(signed)).toEqual(releaseSigningPayload(RELEASE_MANIFEST_FIXTURE));
    const text = decoder.decode(releaseSigningPayload(signed));
    expect(text).not.toContain('"signature"');
    expect(text).toContain('"keyId":"skillx-test-vector-1"');
    expect(text).toContain('"signatureAlgorithm":"ed25519"');
    expect(text.startsWith('{"artifactDigest":')).toBe(true);
    expect(text).toContain('"sourceProvenance":{"commit":');
    expect(text).toContain(RELEASE_FIXTURE_UNICODE_PATH);
    expect(text).not.toContain("\\u2028");
  });

  it("encodes null provenance and empty script lists literally", () => {
    const text = decoder.decode(releaseSigningPayload(RELEASE_MANIFEST_MINIMAL_FIXTURE));
    expect(text).toContain('"declaredScripts":[]');
    expect(text).toContain('"sourceProvenance":null');
  });
});

describe("skillx.release/v1 signatures", () => {
  it("verifies a manifest signed with the trusted key", async () => {
    const { privateKey, publicKey } = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
    const keys = new Map([[RELEASE_FIXTURE_KEY_ID, publicKey]]);
    expect(await verifyReleaseManifest(signed, keys)).toEqual({ valid: true, issues: [] });
    expect(await verifyReleaseManifest(reverseKeys(signed), keys)).toEqual({ valid: true, issues: [] });
  });

  it.each<[string, (m: SkillxReleaseManifest) => void]>([
    ["a changed state", (m) => void (m.state = "yanked")],
    ["a changed file hash", (m) => void (m.files[0]!.sha256 = `${m.files[0]!.sha256.slice(0, 63)}0`)],
    ["a changed release digest", (m) => void (m.releaseDigest = `sha256:${"e".repeat(64)}`)],
    ["a changed publisher verification", (m) => void (m.publisher.verifiedBy = "admin")],
    ["a flipped signature byte", (m) => void (m.signature = flipBase64Byte(m.signature))],
  ])("rejects %s", async (_name, tamper) => {
    const { privateKey, publicKey } = await generateKey();
    const signed = clone(await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey));
    tamper(signed);
    expect(validateReleaseManifest(signed).valid).toBe(true);
    const result = await verifyReleaseManifest(signed, new Map([[RELEASE_FIXTURE_KEY_ID, publicKey]]));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects a signature from another key under the trusted key ID", async () => {
    const signer = await generateKey();
    const trusted = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, signer.privateKey);
    const result = await verifyReleaseManifest(signed, new Map([[RELEASE_FIXTURE_KEY_ID, trusted.publicKey]]));
    expect(result.issues.map((i) => i.code)).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects a key ID swapped to another trusted key, because the key ID is signed", async () => {
    const a = await generateKey();
    const b = await generateKey();
    const signed = clone(await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, a.privateKey));
    signed.keyId = "skillx-other-key";
    const keys = new Map([
      [RELEASE_FIXTURE_KEY_ID, a.publicKey],
      ["skillx-other-key", a.publicKey],
      ["skillx-third-key", b.publicKey],
    ]);
    const result = await verifyReleaseManifest(signed, keys);
    expect(result.issues.map((i) => i.code)).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects an unknown key ID", async () => {
    const { privateKey, publicKey } = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
    const result = await verifyReleaseManifest(signed, new Map([["skillx-other-key", publicKey]]));
    expect(result.issues.map((i) => i.code)).toEqual([RELEASE_SIGNATURE_CODES.unknownKey]);
  });

  it("rejects a malformed public key without throwing", async () => {
    const { privateKey } = await generateKey();
    const signed = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
    const result = await verifyReleaseManifest(signed, new Map([[RELEASE_FIXTURE_KEY_ID, new Uint8Array(31)]]));
    expect(result.issues.map((i) => i.code)).toEqual([RELEASE_SIGNATURE_CODES.invalidKey]);
  });

  it("returns structural issues for an invalid manifest instead of verifying", async () => {
    const { publicKey } = await generateKey();
    const result = await verifyReleaseManifest({ schemaVersion: "skillx.release/v1" }, new Map([[RELEASE_FIXTURE_KEY_ID, publicKey]]));
    expect(result.valid).toBe(false);
    expect(result.issues.map((i) => i.code)).not.toContain(RELEASE_SIGNATURE_CODES.mismatch);
  });

  it("refuses to sign an invalid manifest", async () => {
    const { privateKey } = await generateKey();
    const invalid = { ...RELEASE_MANIFEST_FIXTURE, state: "blocked" } as unknown as UnsignedReleaseManifest;
    await expect(signReleaseManifest(invalid, privateKey)).rejects.toBeInstanceOf(ReleaseManifestError);
  });

  it("refuses to sign with a verify-only key", async () => {
    const { publicKey } = await generateKey();
    const verifyKey = await crypto.subtle.importKey("raw", new Uint8Array(publicKey), { name: "Ed25519" }, false, ["verify"]);
    await expect(signReleaseManifest(RELEASE_MANIFEST_FIXTURE, verifyKey)).rejects.toBeInstanceOf(ReleaseManifestError);
  });
});
