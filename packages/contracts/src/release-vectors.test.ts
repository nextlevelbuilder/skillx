import { describe, expect, it } from "vitest";
import {
  RELEASE_FIXTURE_CONTENTS,
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_FIXTURES,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
} from "./fixtures";
import vectorFile from "./fixtures/release-manifest-v1.json";
import {
  RELEASE_SIGNATURE_CODES,
  releaseSigningPayload,
  signReleaseManifest,
  validateReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest";
import type { SkillxReleaseManifest } from "./release-manifest";
import {
  OTHER_VECTOR_KEY_SEED_TEXT,
  VECTOR_KEY_SEED_TEXT,
  base64,
  clone,
  decoder,
  describeVectorKey,
  encoder,
  fromBase64,
  goJsonStyle,
  hex,
  sha256,
  vectorKey,
  writeVectorFile,
  writeVectorsRequested,
} from "./test-support/vector-key";
import type { VectorKeyDescription } from "./test-support/vector-key";

/**
 * Golden cross-language vectors for `skillx.release/v1`, exported for
 * AgentKit (`fixtures/release-manifest-v1.json`). The signing key is derived
 * from a public seed text, so the vectors are reproducible and the key is
 * worthless outside tests.
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface ReleaseVectors {
  description: string;
  canonicalization: string;
  testKey: VectorKeyDescription;
  valid: Array<{
    name: string;
    manifest: SkillxReleaseManifest;
    signingPayload: string;
    signingPayloadSha256: string;
    fileContentsBase64: Record<string, string>;
  }>;
  invalidSignature: Array<{ name: string; manifest: SkillxReleaseManifest; expectedCode: string }>;
  invalidManifest: Array<{ name: string; manifest: unknown; expectedCode: string }>;
}

function contentsBase64(name: keyof typeof RELEASE_FIXTURE_CONTENTS): Record<string, string> {
  return Object.fromEntries(Object.entries(RELEASE_FIXTURE_CONTENTS[name]).map(([path, text]) => [path, base64(encoder.encode(text))]));
}

async function buildVectors(): Promise<ReleaseVectors> {
  const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
  const other = await vectorKey(OTHER_VECTOR_KEY_SEED_TEXT);

  const valid: ReleaseVectors["valid"] = [];
  const signedFull = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, key.privateKey);
  for (const [name, base, tree] of [
    ["publisher-verified multi-file release", RELEASE_MANIFEST_FIXTURE, "full"],
    ["unverified minimal prerelease with unknown provenance", RELEASE_MANIFEST_MINIMAL_FIXTURE, "minimal"],
  ] as const) {
    const manifest = await signReleaseManifest(base, key.privateKey);
    const payload = releaseSigningPayload(manifest);
    valid.push({
      name,
      manifest,
      signingPayload: decoder.decode(payload),
      signingPayloadSha256: hex(await sha256(payload)),
      fileContentsBase64: contentsBase64(tree),
    });
  }

  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const versionChanged = clone(signedFull);
  versionChanged.version = "1.2.1";
  const flipped = clone(signedFull);
  const signatureBytes = fromBase64(flipped.signature);
  signatureBytes[0] = signatureBytes[0]! ^ 0x01;
  flipped.signature = base64(signatureBytes);
  const otherKey = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, other.privateKey);
  const unknownKey = clone(signedFull);
  unknownKey.keyId = "skillx-unknown-key";
  const goStyle = clone(signedFull);
  goStyle.signature = base64(
    new Uint8Array(
      await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, goJsonStyle(releaseSigningPayload(RELEASE_MANIFEST_FIXTURE))),
    ),
  );

  return {
    description:
      "skillx.release/v1 signed manifest vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "signature = padded base64 Ed25519 over UTF-8 canonical JSON (RFC 8785 subset: members sorted by UTF-16 code units, no whitespace, non-negative safe integers only, only quote/backslash/C0 controls escaped, everything else raw UTF-8) of the manifest without its signature member; see packages/contracts/src/canonical-json.ts",
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
    valid,
    invalidSignature: [
      { name: "version changed after signing", manifest: versionChanged, expectedCode: mismatch },
      { name: "flipped signature byte", manifest: flipped, expectedCode: mismatch },
      { name: "signed by another key under the trusted key ID", manifest: otherKey, expectedCode: mismatch },
      { name: "unknown key ID", manifest: unknownKey, expectedCode: RELEASE_SIGNATURE_CODES.unknownKey },
      { name: "signature over an encoding/json-escaped payload", manifest: goStyle, expectedCode: mismatch },
    ],
    invalidManifest: RELEASE_MANIFEST_FIXTURES.filter((c) => !c.expectedValid).map((c) => ({
      name: c.name,
      manifest: c.value,
      expectedCode: c.expectedIssueCode ?? "",
    })),
  };
}

const committed = vectorFile as unknown as ReleaseVectors;

describe("skillx.release/v1 cross-language vectors", () => {
  it.runIf(writeVectorsRequested)("writes the vector file", async () => {
    await writeVectorFile("release-manifest-v1.json", await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("match the committed vector file byte for byte in content", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("verify every valid vector with the published test key", async () => {
    const keys = new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
    expect(committed.valid.length).toBe(2);
    for (const vector of committed.valid) {
      expect(await verifyReleaseManifest(vector.manifest, keys), vector.name).toEqual({ valid: true, issues: [] });
      expect(decoder.decode(releaseSigningPayload(vector.manifest))).toBe(vector.signingPayload);
      expect(Object.keys(vector.fileContentsBase64)).toEqual(vector.manifest.files.map((f) => f.path));
      expect(vector.manifest).not.toHaveProperty("state");
    }
  });

  it.skipIf(writeVectorsRequested)("hash every vector file to its manifest entry", async () => {
    for (const vector of committed.valid) {
      for (const file of vector.manifest.files) {
        const bytes = fromBase64(vector.fileContentsBase64[file.path]!);
        expect(bytes.length, file.path).toBe(file.size);
        expect(hex(await sha256(bytes)), file.path).toBe(file.sha256);
      }
    }
  });

  it.skipIf(writeVectorsRequested)("reject every invalid-signature vector with its code", async () => {
    const keys = new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
    for (const vector of committed.invalidSignature) {
      expect(validateReleaseManifest(vector.manifest).valid, vector.name).toBe(true);
      const result = await verifyReleaseManifest(vector.manifest, keys);
      expect(result.issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every invalid-manifest vector with its code", () => {
    expect(committed.invalidManifest.length).toBeGreaterThan(10);
    for (const vector of committed.invalidManifest) {
      const result = validateReleaseManifest(vector.manifest);
      expect(result.valid, vector.name).toBe(false);
      expect(result.issues.map((i) => i.code), vector.name).toContain(vector.expectedCode);
    }
  });
});
