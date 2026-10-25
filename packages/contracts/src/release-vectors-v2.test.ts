import { describe, expect, it } from "vitest";
import { canonicalJson } from "./canonical-json";
import { RELEASE_FIXTURE_CONTENTS, RELEASE_FIXTURE_KEY_ID, RELEASE_MANIFEST_FIXTURE } from "./fixtures/release-fixtures";
import {
  RELEASE_MANIFEST_V2_FIXTURES,
  RELEASE_MANIFEST_V2_KIT_FIXTURE,
  RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE,
  RELEASE_MANIFEST_V2_SKILLX_FIXTURE,
} from "./fixtures/release-v2-fixtures";
import vectorFile from "./fixtures/release-manifest-v2.json";
import {
  RELEASE_SIGNATURE_CODES,
  releaseSigningPayload,
  signReleaseManifest,
  validateReleaseManifest,
  verifyReleaseManifest,
} from "./release-manifest";
import type { SkillxReleaseManifest, UnsignedReleaseManifest } from "./release-manifest";
import { releaseTrust } from "./release-provenance";
import { signPayload } from "./release-signature";
import { serializeTree } from "@skillx/skill-tree/rules";
import {
  VECTOR_KEY_SEED_TEXT,
  base64,
  clone,
  decoder,
  describeVectorKey,
  encoder,
  fromBase64,
  hex,
  sha256,
  vectorKey,
  writeVectorFile,
  writeVectorsRequested,
} from "./test-support/vector-key";
import type { VectorKey, VectorKeyDescription } from "./test-support/vector-key";

/**
 * Golden cross-language vectors for `skillx.release/v2` (kit provenance),
 * exported for AgentKit (`fixtures/release-manifest-v2.json`). Same test key,
 * canonicalization and verification order as the v1 vectors; v2 adds the
 * required `provenance` member and the identity/provider pairing.
 * `expectedTrust` is the trust a verifier that has not verified an AgentKit
 * kit signature must assign: a registry signature never makes a release
 * `signed-kit`.
 *
 * Regenerate with `SKILLX_WRITE_RELEASE_VECTORS=1 pnpm vitest run packages/contracts/src`.
 */

interface ReleaseVectorsV2 {
  description: string;
  verifierRules: string[];
  testKey: VectorKeyDescription;
  valid: Array<{
    name: string;
    document: string;
    manifest: SkillxReleaseManifest;
    signingPayload: string;
    treeSerialization: string;
    fileContentsBase64: Record<string, string>;
    expectedTrust: string;
  }>;
  /** Trust after the verifier checked (or not) an AgentKit kit signature over `kitVerifiedReleaseDigest`. */
  trust: Array<{ name: string; vector: string; kitVerifiedReleaseDigest: string | null; expectedTrust: string }>;
  rejected: Array<{ name: string; document: string; expectedCode: string }>;
  invalidManifest: Array<{ name: string; manifest: unknown; expectedCode: string }>;
}

/** Signs any manifest payload, including one `signReleaseManifest` refuses. */
async function signRaw(manifest: Record<string, unknown>, key: VectorKey): Promise<SkillxReleaseManifest> {
  const signature = await signPayload(releaseSigningPayload(manifest as unknown as UnsignedReleaseManifest), key.privateKey);
  return { ...(manifest as unknown as UnsignedReleaseManifest), signature };
}

const contentsBase64 = (contents: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(contents).map(([path, text]) => [path, base64(encoder.encode(text))]));

async function buildVectors(): Promise<ReleaseVectorsV2> {
  const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
  const valid: ReleaseVectorsV2["valid"] = [];
  for (const [name, base, contents] of [
    ["remote-signed kit release of an @agentkit foundation", RELEASE_MANIFEST_V2_KIT_FIXTURE, RELEASE_FIXTURE_CONTENTS.full],
    ["local-dev kit release", RELEASE_MANIFEST_V2_LOCAL_KIT_FIXTURE, RELEASE_FIXTURE_CONTENTS.minimal],
    ["skillx release written as v2", RELEASE_MANIFEST_V2_SKILLX_FIXTURE, RELEASE_FIXTURE_CONTENTS.minimal],
  ] as const) {
    const manifest = await signReleaseManifest(base, key.privateKey);
    valid.push({
      name,
      document: canonicalJson(manifest),
      manifest,
      signingPayload: decoder.decode(releaseSigningPayload(manifest)),
      treeSerialization: serializeTree(manifest.files),
      fileContentsBase64: contentsBase64(contents),
      expectedTrust: releaseTrust(manifest),
    });
  }

  const signedKit = valid[0]!.manifest;
  const signedLocal = valid[1]!.manifest;
  const trust: ReleaseVectorsV2["trust"] = [];
  for (const [name, index, digest] of [
    ["remote-signed kit release whose kit signature verified over its own tree", 0, signedKit.releaseDigest],
    ["remote-signed kit release whose kit signature verified over another tree", 0, signedLocal.releaseDigest],
    ["remote-signed kit release without a verified kit signature", 0, null],
    ["local-dev kit release even with a kit signature verified over its own tree", 1, signedLocal.releaseDigest],
    ["skillx release even with a kit signature verified over its own tree", 2, valid[2]!.manifest.releaseDigest],
  ] as const) {
    const vector = valid[index]!;
    const options = digest === null ? {} : { kitVerifiedReleaseDigest: digest };
    trust.push({ name, vector: vector.name, kitVerifiedReleaseDigest: digest, expectedTrust: releaseTrust(vector.manifest, options) });
  }
  const tamper = (base: SkillxReleaseManifest, mutate: (m: Record<string, unknown>) => void): string => {
    const copy = clone(base) as unknown as Record<string, unknown>;
    mutate(copy);
    return canonicalJson(copy);
  };
  const mismatch = RELEASE_SIGNATURE_CODES.mismatch;
  const { provenance: _dropped, ...kitMembers } = clone(RELEASE_MANIFEST_V2_KIT_FIXTURE);
  const signedV1Agentkit = await signRaw({ ...kitMembers, schemaVersion: "skillx.release/v1" }, key);
  const signedV1 = await signReleaseManifest(RELEASE_MANIFEST_FIXTURE, key.privateKey);

  return {
    description:
      "skillx.release/v2 signed manifest vectors (kit provenance). The test key is derived from a public seed text and MUST NOT be trusted outside tests.",
    verifierRules: [
      "canonicalization, tree digest and signature rules are those of skillx.release/v1 (release-manifest-v1.json)",
      "schemaVersion selects the closed member set: v1 has no provenance member (unknown_field), v2 requires it (required); any other schemaVersion is unsupported_value",
      "provenance is {provider: 'skillx'} or {provider: 'kit', origin: 'remote-signed' | 'local-dev'}; other providers or origins are unsupported_value, extra members unknown_field",
      "@agentkit/* requires provider kit (identity.reserved_publisher); provider kit requires @agentkit/* (identity.invalid); a provider skillx slug must not start with ak- (identity.reserved_alias)",
      "trust is local-unverified unless the verifier itself verified the AgentKit kit signature of a remote-signed kit release; the registry signature alone never yields signed-kit",
      "trust vectors name a valid vector and the releaseDigest whose AgentKit kit signature the verifier checked (null: none); signed-kit requires origin remote-signed and that digest equal to the manifest releaseDigest",
    ],
    testKey: describeVectorKey(RELEASE_FIXTURE_KEY_ID, VECTOR_KEY_SEED_TEXT, key),
    valid,
    trust,
    rejected: [
      {
        name: "origin upgraded from local-dev to remote-signed after signing",
        document: tamper(signedLocal, (m) => void (m.provenance = { provider: "kit", origin: "remote-signed" })),
        expectedCode: mismatch,
      },
      {
        name: "provenance changed from kit to skillx with a non-agentkit identity after signing",
        document: tamper(signedKit, (m) => {
          m.identity = "@bestagentkits/review-guardrails";
          m.publisher = { handle: "bestagentkits", verifiedBy: "admin" };
          m.provenance = { provider: "skillx" };
        }),
        expectedCode: mismatch,
      },
      {
        name: "v1 manifest relabelled v2 with provenance after signing",
        document: tamper(signedV1, (m) => {
          m.schemaVersion = "skillx.release/v2";
          m.provenance = { provider: "skillx" };
        }),
        expectedCode: mismatch,
      },
      {
        name: "@agentkit release signed as v1 without provenance",
        document: canonicalJson(signedV1Agentkit),
        expectedCode: "identity.reserved_publisher",
      },
      {
        name: "kit provenance with members out of canonical order",
        document: canonicalJson(signedKit).replace('{"origin":"remote-signed","provider":"kit"}', '{"provider":"kit","origin":"remote-signed"}'),
        expectedCode: "release.non_canonical",
      },
    ],
    invalidManifest: RELEASE_MANIFEST_V2_FIXTURES.filter((c) => !c.expectedValid).map((c) => ({
      name: c.name,
      manifest: c.value,
      expectedCode: c.expectedIssueCode ?? "",
    })),
  };
}

const committed = vectorFile as unknown as ReleaseVectorsV2;
const trustedKeys = () => new Map([[committed.testKey.keyId, fromBase64(committed.testKey.publicKeyBase64)]]);

describe("skillx.release/v2 cross-language vectors", () => {
  it.runIf(writeVectorsRequested)("writes the vector file", async () => {
    await writeVectorFile("release-manifest-v2.json", await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("match the committed vector file", async () => {
    expect(committed).toEqual(await buildVectors());
  });

  it.skipIf(writeVectorsRequested)("verify every valid vector and never grant signed-kit from the registry signature", async () => {
    expect(committed.valid.length).toBe(3);
    for (const vector of committed.valid) {
      expect(await verifyReleaseManifest(vector.document, trustedKeys()), vector.name).toEqual({ valid: true, issues: [] });
      expect(vector.manifest.schemaVersion).toBe("skillx.release/v2");
      expect(vector.expectedTrust, vector.name).toBe("local-unverified");
      expect(`sha256:${hex(await sha256(encoder.encode(vector.treeSerialization)))}`).toBe(vector.manifest.releaseDigest);
    }
  });

  it.skipIf(writeVectorsRequested)("grant signed-kit only for a remote-signed kit verified over its own tree", () => {
    expect(committed.trust.map((t) => t.expectedTrust)).toEqual(["signed-kit", "local-unverified", "local-unverified", "local-unverified", "local-unverified"]);
    for (const vector of committed.trust) {
      const target = committed.valid.find((v) => v.name === vector.vector);
      expect(target, vector.name).toBeDefined();
      const options = vector.kitVerifiedReleaseDigest === null ? {} : { kitVerifiedReleaseDigest: vector.kitVerifiedReleaseDigest };
      expect(releaseTrust(target!.manifest, options), vector.name).toBe(vector.expectedTrust);
    }
  });

  it.skipIf(writeVectorsRequested)("reject every rejected document with exactly its code", async () => {
    for (const vector of committed.rejected) {
      const result = await verifyReleaseManifest(vector.document, trustedKeys());
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
