import { describe, expect, it } from "vitest";
import { UNICODE_VERSION } from "@skillx/skill-tree/rules";
import { canonicalJson } from "./canonical-json";
import { RELEASE_FIXTURE_KEY_ID, RELEASE_MANIFEST_FIXTURE, RELEASE_MANIFEST_MINIMAL_FIXTURE } from "./fixtures/release-fixtures";
import {
  RELEASE_FIXTURE_MANIFEST_DIGEST,
  RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
  RELEASE_STATUS_PUBLISHED_FIXTURE,
  RELEASE_STATUS_YANKED_FIXTURE,
} from "./fixtures/release-status-fixtures";
import { RELEASE_SIGNATURE_CODES, ReleaseManifestError, releaseManifestDigest, signReleaseManifest } from "./release-manifest";
import type { SkillxReleaseManifest } from "./release-manifest";
import {
  RELEASE_STATE_TRANSITIONS,
  RELEASE_STATUS_CODES,
  RELEASE_STATUS_REASON_MAX_BYTES,
  isReachableState,
  releaseStatusSigningPayload,
  signReleaseStatus,
  validateReleaseStatus,
  validateUnsignedReleaseStatus,
  verifyReleaseStatus,
} from "./release-status";
import type { ReleaseStatusVerifyOptions, SkillxReleaseStatus, UnsignedReleaseStatus } from "./release-status";

const decoder = new TextDecoder();
const DIGEST = RELEASE_MANIFEST_FIXTURE.releaseDigest;
/** Inside the lifetime of the published fixture (issued 2026-10-13T04:31:00Z). */
const DAY_ONE = new Date("2026-10-13T12:00:00Z");
/** Inside the lifetime of the yanked fixture (issued 2026-10-14T09:00:00Z). */
const DAY_TWO = new Date("2026-10-14T12:00:00Z");

async function generateKey(): Promise<{ privateKey: CryptoKey; publicKey: Uint8Array }> {
  const pair = (await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"])) as CryptoKeyPair;
  return { privateKey: pair.privateKey, publicKey: new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey)) };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const doc = (value: unknown): string => canonicalJson(value);

async function setup() {
  const { privateKey, publicKey } = await generateKey();
  const keys = new Map([[RELEASE_FIXTURE_KEY_ID, publicKey]]);
  const manifest = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, privateKey);
  const published = await signReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE, privateKey);
  const yanked = await signReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE, privateKey);
  const sign = (over: Partial<UnsignedReleaseStatus>) => signReleaseStatus({ ...RELEASE_STATUS_YANKED_FIXTURE, ...over }, privateKey);
  const at = (now: Date, extra: Partial<ReleaseStatusVerifyOptions> = {}): ReleaseStatusVerifyOptions => ({ manifest, now, ...extra });
  return { privateKey, keys, manifest, published, yanked, sign, at };
}

/** A later status of the fixture release, `days` after the yanked one. */
function laterTimes(days: number): Pick<UnsignedReleaseStatus, "issuedAt" | "expiresAt"> {
  const issued = Date.parse(RELEASE_STATUS_YANKED_FIXTURE.issuedAt) + days * 86_400_000;
  const iso = (ms: number) => new Date(ms).toISOString().replace(".000Z", "Z");
  return { issuedAt: iso(issued), expiresAt: iso(issued + 86_400_000) };
}

const codes = (result: { issues: { code: string }[] }) => result.issues.map((i) => i.code);
const OK = { valid: true, issues: [] };

describe("release manifest digest", () => {
  it("is the sha256 of the manifest signing payload and matches the fixture constants", async () => {
    expect(await releaseManifestDigest(RELEASE_MANIFEST_FIXTURE)).toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
    expect(await releaseManifestDigest(RELEASE_MANIFEST_MINIMAL_FIXTURE)).toBe(RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST);
  });

  it("ignores the signature but distinguishes two versions of the same tree", async () => {
    const { manifest } = await setup();
    expect(await releaseManifestDigest(manifest)).toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
    const nextVersion = { ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" };
    expect(nextVersion.releaseDigest).toBe(RELEASE_MANIFEST_FIXTURE.releaseDigest);
    expect(await releaseManifestDigest(nextVersion)).not.toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
  });
});

describe("skillx.release-status/v1 validation", () => {
  it("accepts both unsigned fixtures before signing", () => {
    expect(validateUnsignedReleaseStatus(RELEASE_STATUS_PUBLISHED_FIXTURE)).toEqual(OK);
    expect(validateUnsignedReleaseStatus(RELEASE_STATUS_YANKED_FIXTURE)).toEqual(OK);
  });

  it("rejects any non-document input without throwing", () => {
    class Status {
      state = "published";
    }
    // eslint-disable-next-line no-sparse-arrays
    const sparse = [, 1];
    const inputs: unknown[] = [
      null,
      undefined,
      "published",
      [],
      1,
      new Date(0),
      new Map([["state", "published"]]),
      new Status(),
      Object.create(null),
      { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: 1n },
      { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: Number.NaN },
      { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: -0 },
      { ...RELEASE_STATUS_PUBLISHED_FIXTURE, extra: sparse },
      { ...RELEASE_STATUS_PUBLISHED_FIXTURE, extra: () => 1 },
    ];
    for (const input of inputs) {
      expect(() => validateReleaseStatus(input)).not.toThrow();
      expect(validateReleaseStatus(input).valid).toBe(false);
    }
  });

  it("reports every required member of an empty object, but not the optional reason", () => {
    const result = validateReleaseStatus({});
    const paths = result.issues.filter((i) => i.code === "required").map((i) => i.path);
    expect(paths.sort()).toEqual(
      [
        "expiresAt",
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

  it("bounds the reason in UTF-8 bytes, not UTF-16 code units", () => {
    const at = (reason: string) => ({ ...RELEASE_STATUS_YANKED_FIXTURE, reason });
    expect(validateUnsignedReleaseStatus(at("x".repeat(RELEASE_STATUS_REASON_MAX_BYTES))).valid).toBe(true);
    expect(codes(validateUnsignedReleaseStatus(at("x".repeat(RELEASE_STATUS_REASON_MAX_BYTES + 1))))).toEqual(["length"]);
    // 171 code points of 3 UTF-8 bytes each: 513 bytes in 171 UTF-16 units.
    expect(codes(validateUnsignedReleaseStatus(at(String.fromCodePoint(0x20ac).repeat(171))))).toEqual(["length"]);
  });

  it.each([
    ["a tab", 0x09],
    ["DEL", 0x7f],
    ["a C1 control", 0x85],
    ["a right-to-left override", 0x202e],
    ["a left-to-right isolate", 0x2066],
    ["an Arabic letter mark", 0x061c],
    ["a byte order mark", 0xfeff],
    ["a paragraph separator", 0x2029],
  ])("rejects %s in the reason", (_name, codePoint) => {
    const status = { ...RELEASE_STATUS_YANKED_FIXTURE, reason: `bad ${String.fromCodePoint(codePoint)} reason` };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["format"]);
  });

  it("classifies format characters with the pinned Unicode 15.0 tables", () => {
    expect(UNICODE_VERSION).toBe("15.0.0");
    // U+13430 EGYPTIAN HIEROGLYPH VERTICAL JOINER is Cf in Unicode 15.0.
    const status = { ...RELEASE_STATUS_YANKED_FIXTURE, reason: `x${String.fromCodePoint(0x13430)}y` };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["format"]);
  });

  it("accepts non-ASCII letters and emoji in the reason", () => {
    const status = { ...RELEASE_STATUS_YANKED_FIXTURE, reason: `caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x1f600)}` };
    expect(validateUnsignedReleaseStatus(status)).toEqual(OK);
  });

  it("rejects a lone surrogate in the reason", () => {
    const status = { ...RELEASE_STATUS_YANKED_FIXTURE, reason: `bad ${String.fromCharCode(0xd800)}` };
    expect(validateUnsignedReleaseStatus(status).valid).toBe(false);
  });

  it("rejects an unsafe sequence", () => {
    const status = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, sequence: Number.MAX_SAFE_INTEGER + 1 };
    expect(codes(validateUnsignedReleaseStatus(status))).toEqual(["type"]);
  });

  it("allows only draft or published as the first status", () => {
    for (const state of ["draft", "published"] as const) {
      expect(validateUnsignedReleaseStatus({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, state }).valid).toBe(true);
    }
    for (const state of ["yanked", "quarantined"] as const) {
      expect(codes(validateUnsignedReleaseStatus({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, state }))).toEqual([
        RELEASE_STATUS_CODES.invalidTransition,
      ]);
    }
  });

  it("bounds the lifetime to more than zero and at most 7 days", () => {
    const at = (expiresAt: string) => ({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, expiresAt });
    expect(validateUnsignedReleaseStatus(at("2026-10-13T04:31:01Z")).valid).toBe(true);
    expect(validateUnsignedReleaseStatus(at("2026-10-20T04:31:00Z")).valid).toBe(true);
    for (const expiresAt of ["2026-10-13T04:31:00Z", "2026-10-13T04:30:59Z", "2026-10-20T04:31:01Z"]) {
      expect(codes(validateUnsignedReleaseStatus(at(expiresAt)))).toEqual([RELEASE_STATUS_CODES.invalidLifetime]);
    }
    expect(codes(validateUnsignedReleaseStatus(at("2026-10-14")))).toEqual(["format"]);
  });
});

describe("release state transitions", () => {
  it("matches the documented graph", () => {
    expect(RELEASE_STATE_TRANSITIONS).toEqual({
      draft: ["draft", "published"],
      published: ["published", "yanked", "quarantined"],
      yanked: ["yanked", "published"],
      quarantined: ["quarantined", "yanked"],
    });
  });

  it("never returns to draft and reaches states through skipped sequences", () => {
    for (const from of ["published", "yanked", "quarantined"] as const) expect(isReachableState(from, "draft", 100)).toBe(false);
    expect(isReachableState("quarantined", "published", 1)).toBe(false);
    expect(isReachableState("quarantined", "published", 2)).toBe(true);
    expect(isReachableState("draft", "quarantined", 1)).toBe(false);
    expect(isReachableState("draft", "quarantined", 2)).toBe(true);
    expect(isReachableState("published", "published", 1)).toBe(true);
  });
});

describe("skillx.release-status/v1 signing payload", () => {
  it("is byte-stable across member order and omits an absent reason", () => {
    const reordered = Object.fromEntries(Object.entries(RELEASE_STATUS_PUBLISHED_FIXTURE).reverse()) as unknown as UnsignedReleaseStatus;
    expect(releaseStatusSigningPayload(reordered)).toEqual(releaseStatusSigningPayload(RELEASE_STATUS_PUBLISHED_FIXTURE));
    const text = decoder.decode(releaseStatusSigningPayload(RELEASE_STATUS_PUBLISHED_FIXTURE));
    expect(text).toBe(
      `{"expiresAt":"2026-10-14T04:31:00Z","issuedAt":"2026-10-13T04:31:00Z","keyId":"skillx-test-vector-1","manifestDigest":"${RELEASE_FIXTURE_MANIFEST_DIGEST}","releaseDigest":"${DIGEST}","schemaVersion":"skillx.release-status/v1","sequence":1,"signatureAlgorithm":"ed25519","state":"published"}`,
    );
  });
});

describe("skillx.release-status/v1 verification", () => {
  it("verifies a first status and a later one against the accepted status, from text or bytes", async () => {
    const { keys, published, yanked, at } = await setup();
    expect(await verifyReleaseStatus(doc(published), keys, at(DAY_ONE))).toEqual(OK);
    expect(await verifyReleaseStatus(new TextEncoder().encode(doc(published)), keys, at(DAY_ONE))).toEqual(OK);
    expect(await verifyReleaseStatus(doc(yanked), keys, at(DAY_TWO, { previous: published }))).toEqual(OK);
    expect(await verifyReleaseStatus(doc(yanked), keys, at(DAY_TWO, { previous: yanked }))).toEqual(OK);
  });

  describe("received bytes", () => {
    it.each<[string, (text: string) => string | Uint8Array]>([
      ["pretty-printed", (t) => JSON.stringify(JSON.parse(t), null, 2)],
      ["a trailing newline", (t) => `${t}\n`],
      ["a byte order mark", (t) => `${String.fromCodePoint(0xfeff)}${t}`],
      ["reordered members", (t) => JSON.stringify(Object.fromEntries(Object.entries(JSON.parse(t) as object).reverse()))],
      ["a duplicate member", (t) => t.replace("{", '{"state":"published",')],
      ["an exponent number form", (t) => t.replace('"sequence":2', '"sequence":2e0')],
      ["an escaped ASCII character", (t) => t.replace("ed25519", "ed2551\\u0039")],
      ["invalid UTF-8", (t) => new Uint8Array([...new TextEncoder().encode(t).slice(0, -1), 0xff, 0x7d])],
      ["not JSON", () => "{"],
    ])("rejects %s as non-canonical", async (_name, mangle) => {
      const { keys, yanked, at } = await setup();
      expect(codes(await verifyReleaseStatus(mangle(doc(yanked)), keys, at(DAY_TWO)))).toEqual([RELEASE_STATUS_CODES.nonCanonical]);
    });

    it("rejects a canonical member that differs from a known one only by case", async () => {
      const { keys, yanked, at } = await setup();
      const text = doc({ ...yanked, State: "published" });
      expect(codes(await verifyReleaseStatus(text, keys, at(DAY_TWO)))).toEqual(["unknown_field"]);
    });

    it.each([
      ["an empty", ""],
      ["a null", null],
    ])("rejects %s optional reason injected into a status without one", async (_name, reason) => {
      const { keys, published, at } = await setup();
      const result = await verifyReleaseStatus(doc({ ...published, reason }), keys, at(DAY_ONE));
      expect(result.valid).toBe(false);
      expect(result.issues.map((i) => i.path)).toEqual(["reason"]);
    });
  });

  it.each<[string, (s: SkillxReleaseStatus) => void]>([
    ["a changed state", (s) => void (s.state = "published")],
    ["a changed reason", (s) => void (s.reason = "other")],
    ["a removed reason", (s) => void delete s.reason],
    ["a raised sequence", (s) => void (s.sequence = 9)],
    ["a changed issue time", (s) => void (s.issuedAt = "2026-10-14T10:00:00Z")],
    ["an extended expiry", (s) => void (s.expiresAt = "2026-10-21T09:00:00Z")],
  ])("rejects %s", async (_name, tamper) => {
    const { keys, yanked, at } = await setup();
    const tampered = clone(yanked);
    tamper(tampered);
    expect(codes(await verifyReleaseStatus(doc(tampered), keys, at(DAY_TWO)))).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects a manifestDigest changed after signing", async () => {
    const { privateKey, keys, yanked, at } = await setup();
    const otherManifest = await signReleaseManifest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" }, privateKey);
    const tampered = { ...clone(yanked), manifestDigest: await releaseManifestDigest(otherManifest) };
    expect(codes(await verifyReleaseStatus(doc(tampered), keys, at(DAY_TWO, { manifest: otherManifest })))).toEqual([
      RELEASE_SIGNATURE_CODES.mismatch,
    ]);
  });

  it("rejects a status signed by another key under the trusted key ID", async () => {
    const { yanked, at } = await setup();
    const trusted = await generateKey();
    const result = await verifyReleaseStatus(doc(yanked), new Map([[RELEASE_FIXTURE_KEY_ID, trusted.publicKey]]), at(DAY_TWO));
    expect(codes(result)).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
  });

  it("rejects an unknown key ID", async () => {
    const { yanked, keys, at } = await setup();
    const result = await verifyReleaseStatus(doc(yanked), new Map([["skillx-other-key", keys.get(RELEASE_FIXTURE_KEY_ID)!]]), at(DAY_TWO));
    expect(codes(result)).toEqual([RELEASE_SIGNATURE_CODES.unknownKey]);
  });

  describe("expiry", () => {
    it("accepts a status up to and including expiresAt", async () => {
      const { keys, published, at } = await setup();
      expect(await verifyReleaseStatus(doc(published), keys, at(new Date("2026-10-14T04:31:00Z")))).toEqual(OK);
    });

    it("rejects a status after expiresAt, but only once the signature verifies", async () => {
      const { keys, published, at } = await setup();
      const late = at(new Date("2026-10-14T04:31:01Z"));
      expect(codes(await verifyReleaseStatus(doc(published), keys, late))).toEqual([RELEASE_STATUS_CODES.expired]);
      const forged = { ...clone(published), state: "draft" };
      expect(codes(await verifyReleaseStatus(doc(forged), keys, late))).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
    });
  });

  describe("clock skew", () => {
    it("accepts an issuedAt up to 300 seconds ahead of now", async () => {
      const { keys, published, at } = await setup();
      expect(await verifyReleaseStatus(doc(published), keys, at(new Date("2026-10-13T04:26:00Z")))).toEqual(OK);
    });

    it("rejects an issuedAt further ahead, but only once the signature verifies", async () => {
      const { keys, published, at } = await setup();
      const early = at(new Date("2026-10-13T04:25:59Z"));
      expect(codes(await verifyReleaseStatus(doc(published), keys, early))).toEqual([RELEASE_STATUS_CODES.notYetValid]);
      const forged = { ...clone(published), state: "draft" };
      expect(codes(await verifyReleaseStatus(doc(forged), keys, early))).toEqual([RELEASE_SIGNATURE_CODES.mismatch]);
    });
  });

  it("rejects a status issued before the release manifest was created", async () => {
    const { keys, sign, at } = await setup();
    const early = await sign({ state: "published", sequence: 1, issuedAt: "2026-10-13T04:29:59Z", expiresAt: "2026-10-14T04:29:59Z" });
    expect(codes(await verifyReleaseStatus(doc(early), keys, at(DAY_ONE)))).toEqual([RELEASE_STATUS_CODES.issuedBeforeRelease]);
  });

  describe("against the previous accepted status", () => {
    it("rejects a lower sequence", async () => {
      const { keys, published, yanked, at } = await setup();
      expect(codes(await verifyReleaseStatus(doc(published), keys, at(DAY_ONE, { previous: yanked })))).toEqual([
        RELEASE_STATUS_CODES.rollback,
      ]);
    });

    it("rejects a different status with the accepted sequence", async () => {
      const { keys, yanked, sign, at } = await setup();
      const rival = await sign({ state: "published" });
      expect(codes(await verifyReleaseStatus(doc(rival), keys, at(DAY_TWO, { previous: yanked })))).toEqual([
        RELEASE_STATUS_CODES.conflict,
      ]);
    });

    it("rejects a higher sequence that is not issued later", async () => {
      const { keys, yanked, sign, at } = await setup();
      const stale = await sign({ sequence: 3 });
      expect(codes(await verifyReleaseStatus(doc(stale), keys, at(DAY_TWO, { previous: yanked })))).toEqual([
        RELEASE_STATUS_CODES.issuedAtRegression,
      ]);
    });

    it("accepts a daily re-sign of the same state", async () => {
      const { keys, yanked, sign, at } = await setup();
      const refreshed = await sign({ sequence: 3, ...laterTimes(1) });
      expect(await verifyReleaseStatus(doc(refreshed), keys, at(new Date("2026-10-15T12:00:00Z"), { previous: yanked }))).toEqual(OK);
    });

    it.each<[string, "draft" | "published" | "yanked" | "quarantined", "draft" | "published" | "yanked" | "quarantined", number, boolean]>([
      ["yanked to draft", "yanked", "draft", 1, false],
      ["yanked to quarantined", "yanked", "quarantined", 1, false],
      ["yanked to published", "yanked", "published", 1, true],
      ["yanked to quarantined across a skipped sequence", "yanked", "quarantined", 2, true],
      ["quarantined to published", "quarantined", "published", 1, false],
      ["quarantined to published across a skipped sequence", "quarantined", "published", 2, true],
      ["quarantined to draft across many skipped sequences", "quarantined", "draft", 50, false],
    ])("%s", async (_name, from, to, gap, allowed) => {
      const { keys, sign, at } = await setup();
      const previous = await sign({ state: from });
      const next = await sign({ state: to, sequence: 2 + gap, ...laterTimes(1) });
      const result = await verifyReleaseStatus(doc(next), keys, at(new Date("2026-10-15T12:00:00Z"), { previous }));
      expect(result).toEqual(allowed ? OK : { valid: false, issues: [expect.objectContaining({ code: RELEASE_STATUS_CODES.invalidTransition })] });
    });
  });

  it("rejects a status of another release tree", async () => {
    const { privateKey, keys, published } = await setup();
    const minimal = await signReleaseManifest(RELEASE_MANIFEST_MINIMAL_FIXTURE, privateKey);
    const result = await verifyReleaseStatus(doc(published), keys, { manifest: minimal, now: DAY_ONE });
    expect(codes(result)).toEqual([RELEASE_STATUS_CODES.digestMismatch]);
  });

  it("rejects a status of another version of the same tree", async () => {
    const { privateKey, keys, published, at, sign } = await setup();
    const otherManifest = await signReleaseManifest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" }, privateKey);
    const otherVersion = await releaseManifestDigest(otherManifest);
    // A status for 1.2.1 does not apply to 1.2.0, although both share the tree digest.
    const forOther = await sign({ manifestDigest: otherVersion });
    expect(codes(await verifyReleaseStatus(doc(forOther), keys, at(DAY_TWO)))).toEqual([RELEASE_STATUS_CODES.manifestMismatch]);
    // Sequences are tracked per manifest: 1.2.1's status at sequence 1 is not a rollback of 1.2.0's sequence 2.
    const firstForOther = await sign({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: otherVersion });
    expect(await verifyReleaseStatus(doc(firstForOther), keys, at(DAY_ONE, { manifest: otherManifest }))).toEqual(OK);
    expect(published.manifestDigest).not.toBe(otherVersion);
  });

  it("fails closed on an unknown state before checking the signature", async () => {
    const { keys, published, at } = await setup();
    const unknown = { ...clone(published), state: "revoked" };
    expect(codes(await verifyReleaseStatus(doc(unknown), keys, at(DAY_ONE)))).toEqual([RELEASE_STATUS_CODES.unknownState]);
  });

  it("throws on invalid caller options", async () => {
    const { privateKey, keys, yanked, at, sign, manifest } = await setup();
    const otherManifest = await signReleaseManifest({ ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" }, privateKey);
    const foreign = await sign({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, manifestDigest: await releaseManifestDigest(otherManifest) });
    await expect(verifyReleaseStatus(doc(yanked), keys, at(DAY_TWO, { previous: foreign }))).rejects.toBeInstanceOf(ReleaseManifestError);
    await expect(verifyReleaseStatus(doc(yanked), keys, at(new Date(Number.NaN)))).rejects.toBeInstanceOf(ReleaseManifestError);
    const broken = { ...manifest, fileCount: 9 } as SkillxReleaseManifest;
    await expect(verifyReleaseStatus(doc(yanked), keys, at(DAY_TWO, { manifest: broken }))).rejects.toBeInstanceOf(ReleaseManifestError);
  });

  it("refuses to sign an unknown state or an invalid lifetime", async () => {
    const { privateKey } = await generateKey();
    const unknown = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, state: "revoked" } as unknown as UnsignedReleaseStatus;
    await expect(signReleaseStatus(unknown, privateKey)).rejects.toBeInstanceOf(ReleaseManifestError);
    const forever = { ...RELEASE_STATUS_PUBLISHED_FIXTURE, expiresAt: "2027-10-13T04:31:00Z" };
    await expect(signReleaseStatus(forever, privateKey)).rejects.toBeInstanceOf(ReleaseManifestError);
  });
});
