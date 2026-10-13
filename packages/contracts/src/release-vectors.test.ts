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
import type { SkillxReleaseManifest, UnsignedReleaseManifest } from "./release-manifest";

/**
 * Golden cross-language vectors for `skillx.release/v1`, exported for
 * AgentKit (`fixtures/release-manifest-v1.json`). The signing key is derived
 * from a public seed text, so the vectors are reproducible and the key is
 * worthless outside tests.
 *
 * Regenerate after an intentional contract change with
 * `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src/release-vectors.test.ts`.
 */

const KEY_SEED_TEXT = "skillx.release/v1 test vector key; public, never trusted";
const OTHER_KEY_SEED_TEXT = "skillx.release/v1 other test vector key; public, never trusted";
const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

interface VectorKey {
  privateKey: CryptoKey;
  seed: Uint8Array;
  publicKey: Uint8Array;
}

interface ReleaseVectors {
  description: string;
  canonicalization: string;
  testKey: { keyId: string; seedText: string; seedHex: string; publicKeyHex: string; publicKeyBase64: string };
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

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
const base64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const fromBase64Url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));

async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

async function vectorKey(seedText: string): Promise<VectorKey> {
  const seed = await sha256(encoder.encode(seedText));
  const pkcs8 = new Uint8Array([...PKCS8_ED25519_PREFIX, ...seed]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  return { privateKey, seed, publicKey: fromBase64Url(jwk.x ?? "") };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function contentsBase64(name: keyof typeof RELEASE_FIXTURE_CONTENTS): Record<string, string> {
  return Object.fromEntries(Object.entries(RELEASE_FIXTURE_CONTENTS[name]).map(([path, text]) => [path, base64(encoder.encode(text))]));
}

/** The payload a Go implementation would get from encoding/json.Marshal-style escaping. */
function goJsonStylePayload(manifest: UnsignedReleaseManifest): Uint8Array<ArrayBuffer> {
  const text = decoder.decode(releaseSigningPayload(manifest)).replace(/&/g, "\\u0026").replace(/\u2028/g, "\\u2028");
  return encoder.encode(text);
}

async function buildVectors(): Promise<ReleaseVectors> {
  const key = await vectorKey(KEY_SEED_TEXT);
  const other = await vectorKey(OTHER_KEY_SEED_TEXT);

  const valid: ReleaseVectors["valid"] = [];
  const signedFull = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, key.privateKey);
  for (const [name, base, tree] of [
    ["published multi-file release", RELEASE_MANIFEST_FIXTURE, "full"],
    ["quarantined minimal prerelease", RELEASE_MANIFEST_MINIMAL_FIXTURE, "minimal"],
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
  const stateChanged = clone(signedFull);
  stateChanged.state = "yanked";
  const flipped = clone(signedFull);
  const signatureBytes = fromBase64(flipped.signature);
  signatureBytes[0] = signatureBytes[0]! ^ 0x01;
  flipped.signature = base64(signatureBytes);
  const otherKey = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, other.privateKey);
  const unknownKey = clone(signedFull);
  unknownKey.keyId = "skillx-unknown-key";
  const goStyle = clone(signedFull);
  goStyle.signature = base64(
    new Uint8Array(await crypto.subtle.sign({ name: "Ed25519" }, key.privateKey, goJsonStylePayload(RELEASE_MANIFEST_FIXTURE))),
  );

  return {
    description:
      "skillx.release/v1 signed manifest vectors. The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    canonicalization:
      "signature = padded base64 Ed25519 over UTF-8 canonical JSON (RFC 8785 subset: members sorted by UTF-16 code units, no whitespace, non-negative safe integers only, only quote/backslash/C0 controls escaped, everything else raw UTF-8) of the manifest without its signature member; see packages/contracts/src/canonical-json.ts",
    testKey: {
      keyId: RELEASE_FIXTURE_KEY_ID,
      seedText: KEY_SEED_TEXT,
      seedHex: hex(key.seed),
      publicKeyHex: hex(key.publicKey),
      publicKeyBase64: base64(key.publicKey),
    },
    valid,
    invalidSignature: [
      { name: "state changed after signing", manifest: stateChanged, expectedCode: mismatch },
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
const writeRequested = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env
  .SKILLX_WRITE_RELEASE_VECTORS === "1";

describe("skillx.release/v1 cross-language vectors", () => {
  it.runIf(writeRequested)("writes the vector file", async () => {
    // A computed specifier keeps Node typings out of the Worker typecheck that also covers this file.
    const fsModule = "node:fs";
    const fs = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync(path: URL, data: string): void };
    fs.writeFileSync(new URL("./fixtures/release-manifest-v1.json", import.meta.url), `${JSON.stringify(await buildVectors(), null, 2)}\n`);
  });

  it.skipIf(writeRequested)("match the committed vector file byte for byte in content", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeRequested)("verify every valid vector with the published test key", async () => {
    const keys = new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
    expect(committed.valid.length).toBe(2);
    for (const vector of committed.valid) {
      expect(await verifyReleaseManifest(vector.manifest, keys), vector.name).toEqual({ valid: true, issues: [] });
      expect(decoder.decode(releaseSigningPayload(vector.manifest))).toBe(vector.signingPayload);
      expect(Object.keys(vector.fileContentsBase64)).toEqual(vector.manifest.files.map((f) => f.path));
    }
  });

  it.skipIf(writeRequested)("hash every vector file to its manifest entry", async () => {
    for (const vector of committed.valid) {
      for (const file of vector.manifest.files) {
        const bytes = fromBase64(vector.fileContentsBase64[file.path]!);
        expect(bytes.length, file.path).toBe(file.size);
        expect(hex(await sha256(bytes)), file.path).toBe(file.sha256);
      }
    }
  });

  it.skipIf(writeRequested)("reject every invalid-signature vector with its code", async () => {
    const keys = new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);
    for (const vector of committed.invalidSignature) {
      expect(validateReleaseManifest(vector.manifest).valid, vector.name).toBe(true);
      const result = await verifyReleaseManifest(vector.manifest, keys);
      expect(result.issues.map((i) => i.code), vector.name).toEqual([vector.expectedCode]);
    }
  });

  it.skipIf(writeRequested)("reject every invalid-manifest vector with its code", () => {
    expect(committed.invalidManifest.length).toBeGreaterThan(10);
    for (const vector of committed.invalidManifest) {
      const result = validateReleaseManifest(vector.manifest);
      expect(result.valid, vector.name).toBe(false);
      expect(result.issues.map((i) => i.code), vector.name).toContain(vector.expectedCode);
    }
  });
});
