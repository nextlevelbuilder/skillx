import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";
import { RELEASE_FIXTURE_KEY_ID, RELEASE_MANIFEST_FIXTURE, RELEASE_MANIFEST_MINIMAL_FIXTURE } from "./fixtures/release-fixtures";
import {
  RELEASE_FIXTURE_MANIFEST_DIGEST,
  RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
  RELEASE_STATUS_FIXTURE_REASON,
  RELEASE_STATUS_PUBLISHED_FIXTURE,
  RELEASE_STATUS_YANKED_FIXTURE,
} from "./fixtures/release-status-fixtures";
import vectorFile from "./fixtures/release-status-v1.json";
import { RELEASE_SIGNATURE_CODES, releaseManifestDigest, signReleaseManifest, verifyReleaseManifest } from "./release-manifest";
import type { SkillxReleaseManifest } from "./release-manifest";
import { signPayload } from "./release-signature";
import {
  RELEASE_STATUS_CODES,
  RELEASE_STATUS_MAX_LIFETIME_SECONDS,
  RELEASE_STATUS_REASON_MAX_BYTES,
  releaseStatusSigningPayload,
  verifyReleaseStatus,
} from "./release-status";
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
  withNonZeroPaddingBits,
  writeVectorFile,
  writeVectorsRequested,
} from "./test-support/vector-key";
import type { VectorKey, VectorKeyDescription } from "./test-support/vector-key";

/**
 * Golden cross-language vectors for `skillx.release-status/v1`, exported for
 * AgentKit (`fixtures/release-status-v1.json`). Same public test key as the
 * manifest vectors. `manifests` lists the signed manifest documents the
 * statuses refer to with their manifest digests. Each vector names the
 * verified manifest it is checked against (`manifest`), the consumer's clock
 * (`now`), the status document it accepted before for that manifest
 * (`previous`, or `null`) and the received `document`.
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface StatusVector {
  name: string;
  manifest: string;
  now: string;
  previous: string | null;
  document: string;
}

interface StatusVectors {
  description: string;
  canonicalization: string;
  manifestDigestRule: string;
  consumerRules: string[];
  testKey: VectorKeyDescription;
  manifests: Array<{ name: string; document: string; manifestDigest: string }>;
  valid: Array<StatusVector & { signingPayload: string; signingPayloadSha256: string }>;
  invalid: Array<StatusVector & { expectedCode: string }>;
}

const V120 = "1.2.0 of the multi-file tree";
const V121 = "1.2.1 of the same tree";
const MINIMAL = "minimal release";
const DAY_ONE = "2026-10-13T12:00:00Z";
const DAY_TWO = "2026-10-14T12:00:00Z";
const DAY_THREE = "2026-10-15T12:00:00Z";
/** 300 seconds before the published fixture's issuedAt (2026-10-13T04:31:00Z). */
const SKEW_EDGE = "2026-10-13T04:26:00Z";
/** One day after the yanked fixture: the next daily re-sign. */
const NEXT_DAY = { issuedAt: "2026-10-15T09:00:00Z", expiresAt: "2026-10-16T09:00:00Z" };

/** Signs any status payload, including ones `signReleaseStatus` refuses (e.g. an unknown state). */
async function signRaw(status: Record<string, unknown>, key: VectorKey): Promise<SkillxReleaseStatus> {
  const signature = await signPayload(releaseStatusSigningPayload(status as unknown as UnsignedReleaseStatus), key.privateKey);
  return { ...(status as unknown as UnsignedReleaseStatus), signature };
}

async function buildVectors(): Promise<StatusVectors> {
  const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
  const other = await vectorKey(OTHER_VECTOR_KEY_SEED_TEXT);
  const sign = (status: Record<string, unknown>) => signRaw(status, key);
  const yankedWith = (over: Record<string, unknown>) => sign({ ...RELEASE_STATUS_YANKED_FIXTURE, ...over });
  const publishedWith = (over: Record<string, unknown>) => sign({ ...RELEASE_STATUS_PUBLISHED_FIXTURE, ...over });

  // The same tree released as 1.2.0 and 1.2.1: one releaseDigest, two manifest digests.
  const manifests: StatusVectors["manifests"] = [];
  for (const [name, base] of [
    [V120, RELEASE_MANIFEST_FIXTURE],
    [V121, { ...RELEASE_MANIFEST_FIXTURE, version: "1.2.1" }],
    [MINIMAL, RELEASE_MANIFEST_MINIMAL_FIXTURE],
  ] as const) {
    const manifest = await signReleaseManifest(base, key.privateKey);
    manifests.push({ name, document: canonicalJson(manifest), manifestDigest: await releaseManifestDigest(manifest) });
  }
  const nextVersionDigest = manifests[1]!.manifestDigest;

  const published = await sign({ ...RELEASE_STATUS_PUBLISHED_FIXTURE });
  const yanked = await sign({ ...RELEASE_STATUS_YANKED_FIXTURE });
  const quarantined = await yankedWith({ state: "quarantined" });
  const doc = (status: SkillxReleaseStatus) => canonicalJson(status);
  const yankedDoc = doc(yanked);

  const valid: StatusVectors["valid"] = [];
  const validCases: Array<[string, SkillxReleaseStatus, SkillxReleaseStatus | null, string, string]> = [
    ["first status of a release", published, null, V120, DAY_ONE],
    ["yanked with a reason after the published status", yanked, published, V120, DAY_TWO],
    ["identical re-fetch of the accepted status", yanked, yanked, V120, DAY_TWO],
    [
      "first status of another version of the same tree, tracked separately",
      await publishedWith({ manifestDigest: nextVersionDigest }),
      null,
      V121,
      DAY_ONE,
    ],
    ["daily re-sign of the same state", await yankedWith({ sequence: 3, ...NEXT_DAY }), yanked, V120, DAY_THREE],
    ["yanked release published again", await yankedWith({ state: "published", sequence: 3, ...NEXT_DAY }), yanked, V120, DAY_THREE],
    [
      "quarantined to published across a skipped sequence (via yanked)",
      await yankedWith({ state: "published", sequence: 4, ...NEXT_DAY }),
      quarantined,
      V120,
      DAY_THREE,
    ],
    ["checked exactly at expiresAt", published, null, V120, RELEASE_STATUS_PUBLISHED_FIXTURE.expiresAt],
    ["issuedAt exactly at the 300 second clock-skew limit", published, null, V120, SKEW_EDGE],
  ];
  for (const [name, status, previous, manifest, now] of validCases) {
    const payload = releaseStatusSigningPayload(status);
    valid.push({
      name,
      manifest,
      now,
      previous: previous === null ? null : doc(previous),
      document: doc(status),
      signingPayload: decoder.decode(payload),
      signingPayloadSha256: hex(await sha256(payload)),
    });
  }

  const tamper = (mutate: (s: SkillxReleaseStatus) => void): string => {
    const copy = clone(yanked);
    mutate(copy);
    return doc(copy);
  };
  const goStyleSignature = base64(
    new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, goJsonStyle(releaseStatusSigningPayload(RELEASE_STATUS_YANKED_FIXTURE))),
    ),
  );
  const { manifestDigest: _m, ...withoutManifestDigest } = RELEASE_STATUS_PUBLISHED_FIXTURE;
  const { expiresAt: _e, ...withoutExpiresAt } = RELEASE_STATUS_PUBLISHED_FIXTURE;
  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const C = RELEASE_STATUS_CODES;

  const invalid: StatusVectors["invalid"] = [];
  const add = (
    name: string,
    document: string,
    expectedCode: string,
    options: { previous?: SkillxReleaseStatus | null; manifest?: string; now?: string } = {},
  ) =>
    invalid.push({
      name,
      manifest: options.manifest ?? V120,
      now: options.now ?? DAY_TWO,
      previous: options.previous ? doc(options.previous) : null,
      document,
      expectedCode,
    });

  // Signature.
  add("state changed after signing", tamper((s) => void (s.state = "published")), mismatch, { previous: published });
  add("reason changed after signing", tamper((s) => void (s.reason = `${RELEASE_STATUS_FIXTURE_REASON}.`)), mismatch, { previous: published });
  add("sequence raised after signing", tamper((s) => void (s.sequence = 3)), mismatch, { previous: yanked });
  add("expiry extended after signing", tamper((s) => void (s.expiresAt = "2026-10-21T09:00:00Z")), mismatch);
  add("signed by another key under the trusted key ID", doc(await signRaw({ ...RELEASE_STATUS_YANKED_FIXTURE }, other)), mismatch, {
    previous: published,
  });
  add("unknown key ID", tamper((s) => void (s.keyId = "skillx-unknown-key")), RELEASE_SIGNATURE_CODES.unknownKey, { previous: published });
  add("signature over an encoding/json-escaped payload", tamper((s) => void (s.signature = goStyleSignature)), mismatch, { previous: published });

  // Received bytes.
  add("pretty-printed", JSON.stringify(yanked, null, 2), C.nonCanonical);
  add("members in insertion order", JSON.stringify(yanked), C.nonCanonical);
  add("duplicate member", yankedDoc.replace("{", '{"state":"published",'), C.nonCanonical);
  add("exponent number form", yankedDoc.replace('"sequence":2', '"sequence":2e0'), C.nonCanonical);
  add("escaped ASCII character", yankedDoc.replace("ed25519", "ed2551\\u0039"), C.nonCanonical);
  add("byte order mark", `${String.fromCodePoint(0xfeff)}${yankedDoc}`, C.nonCanonical);
  add("member differing from a known one only by case, correctly signed", doc(await yankedWith({ State: "published" })), "unknown_field");
  add("empty reason injected, correctly signed", doc(await publishedWith({ reason: "" })), "length", { now: DAY_ONE });
  add("null reason injected, correctly signed", doc(await publishedWith({ reason: null })), "type", { now: DAY_ONE });

  // Structure.
  add("unknown state, correctly signed", doc(await publishedWith({ state: "revoked", sequence: 3 })), C.unknownState, { previous: yanked });
  add("missing manifestDigest, correctly signed", doc(await sign(withoutManifestDigest)), "required", { now: DAY_ONE });
  add("missing expiresAt, correctly signed", doc(await sign(withoutExpiresAt)), "required", { now: DAY_ONE });
  add("expiresAt before issuedAt, correctly signed", doc(await publishedWith({ expiresAt: "2026-10-13T04:30:59Z" })), C.invalidLifetime, {
    now: DAY_ONE,
  });
  add("lifetime longer than 7 days, correctly signed", doc(await publishedWith({ expiresAt: "2026-10-20T04:31:01Z" })), C.invalidLifetime, {
    now: DAY_ONE,
  });
  add("first status that is yanked, correctly signed", doc(await yankedWith({ sequence: 1 })), C.invalidTransition);
  add(
    "reason over 512 UTF-8 bytes, correctly signed",
    doc(await yankedWith({ reason: String.fromCodePoint(0xe9).repeat(RELEASE_STATUS_REASON_MAX_BYTES / 2) + "." })),
    "length",
  );
  add(
    "bidi override in the reason, correctly signed",
    doc(await yankedWith({ reason: `see ${String.fromCodePoint(0x202e)}hs.kcehc` })),
    "format",
  );

  // Binding and freshness.
  add(
    "status of another release tree",
    doc(
      await publishedWith({
        releaseDigest: RELEASE_MANIFEST_MINIMAL_FIXTURE.releaseDigest,
        manifestDigest: RELEASE_MINIMAL_FIXTURE_MANIFEST_DIGEST,
      }),
    ),
    C.digestMismatch,
    { now: DAY_ONE },
  );
  add("status of another version of the same tree", doc(await yankedWith({ manifestDigest: nextVersionDigest })), C.manifestMismatch, {
    previous: published,
  });
  add("wrong manifestDigest, correctly signed", doc(await publishedWith({ manifestDigest: `sha256:${"e".repeat(64)}` })), C.manifestMismatch, {
    now: DAY_ONE,
  });
  add(
    "issued before the manifest was created",
    doc(await publishedWith({ issuedAt: "2026-10-13T04:29:59Z", expiresAt: "2026-10-14T04:29:59Z" })),
    C.issuedBeforeRelease,
    { now: DAY_ONE },
  );
  add("expired one second after expiresAt", doc(published), C.expired, { now: "2026-10-14T04:31:01Z" });
  add("issuedAt 301 seconds ahead of the consumer's clock", doc(published), C.notYetValid, { now: "2026-10-13T04:25:59Z" });
  add(
    "signature with non-zero unused base64 bits (same bytes for a lenient decoder)",
    tamper((s) => void (s.signature = withNonZeroPaddingBits(s.signature))),
    "pattern",
  );

  // Against the previous accepted status.
  add("lower sequence than the accepted status (rollback)", doc(published), C.rollback, { previous: yanked, now: DAY_ONE });
  add("same sequence with different content (conflict)", doc(await yankedWith({ state: "published" })), C.conflict, { previous: yanked });
  add("higher sequence issued no later (issuedAt regression)", doc(await yankedWith({ sequence: 3 })), C.issuedAtRegression, {
    previous: yanked,
  });
  add("yanked back to draft", doc(await yankedWith({ state: "draft", sequence: 3, ...NEXT_DAY })), C.invalidTransition, {
    previous: yanked,
    now: DAY_THREE,
  });
  add(
    "quarantined straight to published",
    doc(await yankedWith({ state: "published", sequence: 3, ...NEXT_DAY })),
    C.invalidTransition,
    { previous: quarantined, now: DAY_THREE },
  );

  return {
    description:
      "skillx.release-status/v1 signed status vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "same as skillx.release/v1: padded base64 Ed25519 over the UTF-8 canonical JSON of the status without its signature member; an absent reason is omitted, never null or empty; a served document is exactly the canonical JSON including signature",
    manifestDigestRule:
      "manifestDigest = 'sha256:' + lowercase hex SHA-256 of the manifest signing payload: the UTF-8 canonical JSON of the skillx.release/v1 manifest without its signature member (the exact bytes its signature covers)",
    consumerRules: [
      "verify the manifest document first (skillx.release/v1 vectors); statuses are checked against that verified manifest",
      "re-encode the received document canonically; any byte difference is status.non_canonical",
      "validate the structure: unknown member unknown_field; missing member required; state outside draft|quarantined|published|yanked status.unknown_state even when signed; reason 1..512 UTF-8 bytes (length, null is type) without Cc, Cf (incl. bidi controls, Unicode 15.0 tables), Zl, Zp or Cs code points (format); signature matching ^[A-Za-z0-9+/]{85}[AQgw]==$ else pattern; issuedAt < expiresAt <= issuedAt + 7 days else status.invalid_lifetime; sequence 1 must be draft or published else status.invalid_transition",
      "require releaseDigest to equal the verified manifest's releaseDigest, else status.digest_mismatch",
      "require manifestDigest to equal the verified manifest's manifest digest, else status.manifest_mismatch",
      "require issuedAt >= the manifest createdAt, else status.issued_before_release",
      "verify the signature with the trusted key for keyId: signature.unknown_key, signature.invalid_key or signature.mismatch",
      "require issuedAt <= now + 300 s, else status.not_yet_valid",
      "require now <= expiresAt, else status.expired; an expired status may only keep already-installed content, never authorize a new resolution or install",
      "per manifestDigest, against the last accepted status: a lower sequence is status.rollback; the same sequence with different signed bytes is status.conflict (identical bytes are accepted); a higher sequence needs a later issuedAt (status.issued_at_regression) and a state reachable in at most (sequence gap) steps of draft->draft|published, published->published|yanked|quarantined, yanked->yanked|published, quarantined->quarantined|yanked (status.invalid_transition)",
    ],
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
    manifests,
    valid,
    invalid,
  };
}

const committed = vectorFile as unknown as StatusVectors;

function trustedKeys(): Map<string, Uint8Array> {
  return new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
}

function verifyVector(vector: StatusVector) {
  const entry = committed.manifests.find((m) => m.name === vector.manifest);
  if (entry === undefined) throw new Error(`unknown manifest ${vector.manifest}`);
  return verifyReleaseStatus(vector.document, trustedKeys(), {
    manifest: JSON.parse(entry.document) as SkillxReleaseManifest,
    now: new Date(vector.now),
    previous: vector.previous === null ? null : (JSON.parse(vector.previous) as SkillxReleaseStatus),
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
    const [v120, v121] = committed.manifests.map((m) => JSON.parse(m.document) as SkillxReleaseManifest);
    expect(v120!.releaseDigest).toBe(v121!.releaseDigest);
    expect(committed.manifests[0]!.manifestDigest).toBe(RELEASE_FIXTURE_MANIFEST_DIGEST);
    expect(committed.manifests[0]!.manifestDigest).not.toBe(committed.manifests[1]!.manifestDigest);
    for (const entry of committed.manifests) {
      expect(await verifyReleaseManifest(entry.document, trustedKeys()), entry.name).toEqual({ valid: true, issues: [] });
      expect(await releaseManifestDigest(JSON.parse(entry.document) as SkillxReleaseManifest), entry.name).toBe(entry.manifestDigest);
    }
  });

  it.skipIf(writeVectorsRequested)("accept every valid vector", async () => {
    expect(committed.valid.length).toBe(9);
    for (const vector of committed.valid) {
      expect(await verifyVector(vector), vector.name).toEqual({ valid: true, issues: [] });
      const status = JSON.parse(vector.document) as SkillxReleaseStatus;
      expect(decoder.decode(releaseStatusSigningPayload(status))).toBe(vector.signingPayload);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every invalid vector with exactly its code", async () => {
    const codes = new Set<string>();
    for (const vector of committed.invalid) {
      expect((await verifyVector(vector)).issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
      codes.add(vector.expectedCode);
    }
    expect([...codes].sort()).toEqual(
      [
        ...Object.values(RELEASE_STATUS_CODES),
        RELEASE_SIGNATURE_CODES.mismatch,
        RELEASE_SIGNATURE_CODES.unknownKey,
        "required",
        "unknown_field",
        "length",
        "type",
        "format",
        "pattern",
      ].sort(),
    );
  });

  it.skipIf(writeVectorsRequested)("bounds every status lifetime by 7 days", () => {
    for (const vector of committed.valid) {
      const status = JSON.parse(vector.document) as SkillxReleaseStatus;
      const lifetime = (Date.parse(status.expiresAt) - Date.parse(status.issuedAt)) / 1000;
      expect(lifetime).toBeGreaterThan(0);
      expect(lifetime).toBeLessThanOrEqual(RELEASE_STATUS_MAX_LIFETIME_SECONDS);
    }
  });

  it.skipIf(writeVectorsRequested)("signs the reason with raw non-ASCII and HTML characters", () => {
    const yanked = committed.valid[1]!;
    expect(yanked.signingPayload).toContain(RELEASE_STATUS_FIXTURE_REASON);
    expect(yanked.signingPayload).not.toContain("\\u00");
  });
});
