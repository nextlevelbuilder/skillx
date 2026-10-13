import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";
import {
  RELEASE_FIXTURE_CONTENTS,
  RELEASE_FIXTURE_KEY_ID,
  RELEASE_MANIFEST_FIXTURE,
  RELEASE_MANIFEST_FIXTURES,
  RELEASE_MANIFEST_MINIMAL_FIXTURE,
} from "./fixtures/release-fixtures";
import vectorFile from "./fixtures/release-manifest-v1.json";
import {
  RELEASE_MANIFEST_CODES,
  RELEASE_SIGNATURE_CODES,
  compareUtf8,
  releaseSigningPayload,
  releaseTreeDigest,
  signReleaseManifest,
  validateReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest";
import type { ReleaseFile, SkillxReleaseManifest, UnsignedReleaseManifest } from "./release-manifest";
import { signPayload } from "./release-signature";
import { serializeTree } from "@skillx/skill-tree/rules";
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
  withNonZeroPaddingBits,
  writeVectorFile,
  writeVectorsRequested,
} from "./test-support/vector-key";
import type { VectorKey, VectorKeyDescription } from "./test-support/vector-key";

/**
 * Golden cross-language vectors for `skillx.release/v1`, exported for
 * AgentKit (`fixtures/release-manifest-v1.json`). The signing key is derived
 * from a public seed text, so the vectors are reproducible and the key is
 * worthless outside tests. A verifier receives `document` (the exact served
 * text) and must reach the vector's result from those bytes alone.
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface ReleaseVectors {
  description: string;
  canonicalization: string;
  verifierRules: string[];
  testKey: VectorKeyDescription;
  valid: Array<{
    name: string;
    document: string;
    manifest: SkillxReleaseManifest;
    signingPayload: string;
    signingPayloadSha256: string;
    treeSerialization: string;
    fileContentsBase64: Record<string, string>;
  }>;
  rejected: Array<{ name: string; document: string; expectedCode: string }>;
  invalidManifest: Array<{ name: string; manifest: unknown; expectedCode: string }>;
}

/**
 * Paths whose UTF-8 byte order (U+FF61 before U+1F600) is the reverse of
 * their UTF-16 code unit order, where the surrogate pair 0xD83D sorts first.
 */
const ORDERING_CONTENTS: Readonly<Record<string, string>> = {
  "SKILL.md": "---\nname: path-order\ndescription: Path ordering vector.\n---\n",
  [`references/${String.fromCodePoint(0xff61)}.md`]: "Halfwidth ideographic full stop.\n",
  [`references/${String.fromCodePoint(0x1f600)}.md`]: "Astral-plane emoji.\n",
};

async function treeFiles(contents: Readonly<Record<string, string>>): Promise<ReleaseFile[]> {
  const files: ReleaseFile[] = [];
  for (const [path, text] of Object.entries(contents)) {
    const bytes = encoder.encode(text);
    files.push({ path, mode: "100644", sha256: hex(await sha256(bytes)), size: bytes.length });
  }
  return files.sort((a, b) => compareUtf8(a.path, b.path));
}

async function orderingManifest(): Promise<UnsignedReleaseManifest> {
  const files = await treeFiles(ORDERING_CONTENTS);
  return {
    ...RELEASE_MANIFEST_MINIMAL_FIXTURE,
    identity: "@solo.dev/path-order",
    version: "0.2.0",
    releaseDigest: await releaseTreeDigest(files),
    files,
    fileCount: files.length,
    treeSize: files.reduce((sum, f) => sum + f.size, 0),
  };
}

function contentsBase64(contents: Readonly<Record<string, string>>): Record<string, string> {
  return Object.fromEntries(Object.entries(contents).map(([path, text]) => [path, base64(encoder.encode(text))]));
}

/** Signs any manifest payload, including one `signReleaseManifest` refuses. */
async function signRaw(manifest: Record<string, unknown>, key: VectorKey): Promise<SkillxReleaseManifest> {
  const signature = await signPayload(releaseSigningPayload(manifest as unknown as UnsignedReleaseManifest), key.privateKey);
  return { ...(manifest as unknown as UnsignedReleaseManifest), signature };
}

async function buildVectors(): Promise<ReleaseVectors> {
  const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
  const other = await vectorKey(OTHER_VECTOR_KEY_SEED_TEXT);

  const valid: ReleaseVectors["valid"] = [];
  const signedFull = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, key.privateKey);
  for (const [name, base, contents] of [
    ["publisher-verified multi-file release", RELEASE_MANIFEST_FIXTURE, RELEASE_FIXTURE_CONTENTS.full],
    ["unverified minimal prerelease with unknown provenance", RELEASE_MANIFEST_MINIMAL_FIXTURE, RELEASE_FIXTURE_CONTENTS.minimal],
    ["paths ordered by UTF-8 bytes, not UTF-16 code units", await orderingManifest(), ORDERING_CONTENTS],
  ] as const) {
    const manifest = await signReleaseManifest(base, key.privateKey);
    const payload = releaseSigningPayload(manifest);
    valid.push({
      name,
      document: canonicalJson(manifest),
      manifest,
      signingPayload: decoder.decode(payload),
      signingPayloadSha256: hex(await sha256(payload)),
      treeSerialization: serializeTree(manifest.files),
      fileContentsBase64: contentsBase64(contents),
    });
  }

  const full = canonicalJson(signedFull);
  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const tamper = (mutate: (m: SkillxReleaseManifest) => void): string => {
    const copy = clone(signedFull);
    mutate(copy);
    return canonicalJson(copy);
  };
  const flipped = tamper((m) => {
    const bytes = fromBase64(m.signature);
    bytes[0] = bytes[0]! ^ 0x01;
    m.signature = base64(bytes);
  });
  const goStyleSignature = base64(
    new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, goJsonStyle(releaseSigningPayload(RELEASE_MANIFEST_FIXTURE)))),
  );
  const wrongTree = await signRaw({ ...RELEASE_MANIFEST_FIXTURE, releaseDigest: RELEASE_MANIFEST_MINIMAL_FIXTURE.releaseDigest }, key);
  const fileHashChanged = clone(RELEASE_MANIFEST_FIXTURE);
  fileHashChanged.files[0]!.sha256 = `${fileHashChanged.files[0]!.sha256.slice(0, 63)}0`;
  const signedFileHashChanged = await signRaw(fileHashChanged as unknown as Record<string, unknown>, key);
  const nonCanonical = RELEASE_MANIFEST_CODES.nonCanonical;

  return {
    description:
      "skillx.release/v1 signed manifest vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "signature = padded base64 Ed25519 over UTF-8 canonical JSON (RFC 8785 subset: members sorted by UTF-16 code units, no whitespace, non-negative safe integers only, only quote/backslash/C0 controls escaped, everything else raw UTF-8) of the manifest without its signature member; see packages/contracts/src/canonical-json.ts",
    verifierRules: [
      "parse document and re-encode it canonically; any byte difference (whitespace, member order, duplicate member, escapes, number form, BOM, trailing bytes, invalid UTF-8) is release.non_canonical",
      "validate the structure; an unknown member, including one differing from a known member only by case, is unknown_field; a signature not matching ^[A-Za-z0-9+/]{85}[AQgw]==$ (non-zero unused base64 bits included) is pattern",
      "require releaseDigest == 'sha256:' + hex SHA-256 of treeSerialization (agentkit.skill-tree/v1 of files), else release.tree_digest_mismatch",
      "verify the signature with the trusted key for keyId over the canonical JSON without signature: signature.unknown_key, signature.invalid_key or signature.mismatch",
    ],
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
    valid,
    rejected: [
      { name: "version changed after signing", document: tamper((m) => void (m.version = "1.2.1")), expectedCode: mismatch },
      { name: "flipped signature byte", document: flipped, expectedCode: mismatch },
      {
        name: "signed by another key under the trusted key ID",
        document: canonicalJson(await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, other.privateKey)),
        expectedCode: mismatch,
      },
      {
        name: "unknown key ID",
        document: tamper((m) => void (m.keyId = "skillx-unknown-key")),
        expectedCode: RELEASE_SIGNATURE_CODES.unknownKey,
      },
      {
        name: "signature over an encoding/json-escaped payload",
        document: tamper((m) => void (m.signature = goStyleSignature)),
        expectedCode: mismatch,
      },
      {
        name: "signature with non-zero unused base64 bits (same bytes for a lenient decoder)",
        document: tamper((m) => void (m.signature = withNonZeroPaddingBits(m.signature))),
        expectedCode: "pattern",
      },
      {
        name: "releaseDigest is not the tree digest of files, correctly signed",
        document: canonicalJson(wrongTree),
        expectedCode: RELEASE_MANIFEST_CODES.treeDigestMismatch,
      },
      {
        name: "file hash changed, correctly signed",
        document: canonicalJson(signedFileHashChanged),
        expectedCode: RELEASE_MANIFEST_CODES.treeDigestMismatch,
      },
      {
        name: "member differing from a known one only by case",
        document: canonicalJson({ ...signedFull, Version: "1.2.0" }),
        expectedCode: "unknown_field",
      },
      { name: "pretty-printed", document: JSON.stringify(signedFull, null, 2), expectedCode: nonCanonical },
      {
        name: "members in insertion order",
        document: JSON.stringify(signedFull),
        expectedCode: nonCanonical,
      },
      { name: "duplicate member", document: full.replace("{", '{"version":"9.9.9",'), expectedCode: nonCanonical },
      { name: "exponent number form", document: full.replace('"artifactSize":10240', '"artifactSize":1.024e4'), expectedCode: nonCanonical },
      { name: "escaped solidus", document: full.replace("scripts/check.sh", "scripts\\/check.sh"), expectedCode: nonCanonical },
      { name: "byte order mark", document: `${String.fromCodePoint(0xfeff)}${full}`, expectedCode: nonCanonical },
      { name: "trailing newline", document: `${full}\n`, expectedCode: nonCanonical },
    ],
    invalidManifest: RELEASE_MANIFEST_FIXTURES.filter((c) => !c.expectedValid).map((c) => ({
      name: c.name,
      manifest: c.value,
      expectedCode: c.expectedIssueCode ?? "",
    })),
  };
}

const committed = vectorFile as unknown as ReleaseVectors;

function trustedKeys(): Map<string, Uint8Array> {
  return new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
}

describe("skillx.release/v1 cross-language vectors", () => {
  it.runIf(writeVectorsRequested)("writes the vector file", async () => {
    await writeVectorFile("release-manifest-v1.json", await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("match the committed vector file byte for byte in content", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("verify every valid vector from its document with the published test key", async () => {
    expect(committed.valid.length).toBe(3);
    for (const vector of committed.valid) {
      expect(await verifyReleaseManifest(vector.document, trustedKeys()), vector.name).toEqual({ valid: true, issues: [] });
      expect(vector.document).toBe(canonicalJson(vector.manifest));
      expect(decoder.decode(releaseSigningPayload(vector.manifest))).toBe(vector.signingPayload);
      expect(serializeTree(vector.manifest.files)).toBe(vector.treeSerialization);
      expect(Object.keys(vector.fileContentsBase64).sort(compareUtf8)).toEqual(vector.manifest.files.map((f) => f.path));
      expect(vector.manifest).not.toHaveProperty("state");
    }
  });

  it.skipIf(writeVectorsRequested)("order the ordering vector's paths differently from UTF-16 code units", () => {
    const paths = committed.valid[2]!.manifest.files.map((f) => f.path);
    expect([...paths].sort()).not.toEqual(paths);
    expect([...paths].sort(compareUtf8)).toEqual(paths);
  });

  it.skipIf(writeVectorsRequested)("hash every vector file to its manifest entry and the tree to releaseDigest", async () => {
    for (const vector of committed.valid) {
      for (const file of vector.manifest.files) {
        const bytes = fromBase64(vector.fileContentsBase64[file.path]!);
        expect(bytes.length, file.path).toBe(file.size);
        expect(hex(await sha256(bytes)), file.path).toBe(file.sha256);
      }
      expect(`sha256:${hex(await sha256(encoder.encode(vector.treeSerialization)))}`).toBe(vector.manifest.releaseDigest);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every rejected document with exactly its code", async () => {
    const codes = new Set<string>();
    for (const vector of committed.rejected) {
      const result = await verifyReleaseManifest(vector.document, trustedKeys());
      expect(result.issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
      codes.add(vector.expectedCode);
    }
    expect([...codes].sort()).toEqual(
      [
        ...Object.values(RELEASE_MANIFEST_CODES),
        RELEASE_SIGNATURE_CODES.mismatch,
        RELEASE_SIGNATURE_CODES.unknownKey,
        "unknown_field",
        "pattern",
      ].sort(),
    );
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
