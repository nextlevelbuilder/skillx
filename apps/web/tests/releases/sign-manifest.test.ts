import { describe, expect, it } from "vitest";
import { verifyReleaseManifest, releaseTreeDigest } from "@skillx/contracts";
import { VECTOR_KEY_SEED_TEXT, vectorKey } from "../../../../packages/contracts/src/test-support/vector-key";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import { loadRegistrySigner, signRelease } from "~/lib/releases/sign-manifest";
import { parseReleaseMetadata, parseReleaseName, requestedProvider } from "~/lib/releases/release-request";
import { normalizeRequestedScopes, parseStoredScopes } from "~/lib/auth/api-key-scopes";

const PKCS8_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

describe("registry signer", () => {
  it("imports the base64 PKCS #8 secret and signs a manifest the public key verifies", async () => {
    const key = await vectorKey(VECTOR_KEY_SEED_TEXT);
    const signer = await loadRegistrySigner({
      SKILLX_REGISTRY_SIGNING_KEY: b64(new Uint8Array([...PKCS8_PREFIX, ...key.seed])),
      SKILLX_REGISTRY_SIGNING_KEY_ID: "skillx-reg-993cd14a011f7b76",
    });
    expect(signer.privateKey.extractable).toBe(false);
    const files = [{ path: "SKILL.md", mode: "100644" as const, sha256: "a".repeat(64), size: 3 }];
    const { bytes } = await signRelease(
      {
        identity: "@alpha/demo",
        version: "1.0.0",
        channel: "stable",
        kind: "skill",
        releaseDigest: await releaseTreeDigest(files),
        artifactDigest: `sha256:${"b".repeat(64)}`,
        artifactSize: 2048,
        files,
        fileCount: 1,
        treeSize: 3,
        publisher: { handle: "alpha", verifiedBy: "admin" },
        sourceProvenance: null,
        declaredScripts: [],
        provenance: null,
      },
      signer,
      new Date("2026-10-13T12:34:56.789Z"),
    );
    const verified = await verifyReleaseManifest(bytes, new Map([["skillx-reg-993cd14a011f7b76", key.publicKey]]));
    expect(verified.valid).toBe(true);
    expect(new TextDecoder().decode(bytes)).toContain('"createdAt":"2026-10-13T12:34:56Z"');
  });

  it.each([
    [{}],
    [{ SKILLX_REGISTRY_SIGNING_KEY: "AAAA", SKILLX_REGISTRY_SIGNING_KEY_ID: "skillx-reg-x" }],
    [{ SKILLX_REGISTRY_SIGNING_KEY: "!!!", SKILLX_REGISTRY_SIGNING_KEY_ID: "skillx-reg-x" }],
    [{ SKILLX_REGISTRY_SIGNING_KEY: "AAAA", SKILLX_REGISTRY_SIGNING_KEY_ID: "Bad Id" }],
  ])("fails closed with 503 and no key material: %j", async (env) => {
    const error = await loadRegistrySigner(env).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ReleaseHttpError);
    expect((error as ReleaseHttpError).status).toBe(503);
    expect((error as ReleaseHttpError).message).toBe("release signing is not configured");
  });
});

describe("request boundary", () => {
  it("parses names and reserves AgentKit forms", () => {
    expect(parseReleaseName("@alpha", "demo")).toEqual({ identity: "@alpha/demo", handle: "alpha", slug: "demo" });
    expect(() => parseReleaseName("alpha", "demo")).toThrow(/@publisher\/slug/);
    expect(() => parseReleaseName("@Alpha", "demo")).toThrow(/lowercase/);
    for (const [scope, slug] of [["@agentkit", "x"], ["@alpha", "ak-x"], ["@alpha", "Ak:x"]] as const) {
      expect(() => parseReleaseName(scope, slug)).toThrow(/reserved/);
    }
  });

  it("decodes metadata with defaults and rejects unknown fields", () => {
    const header = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");
    expect(parseReleaseMetadata(header({ version: "1.2.3-beta.1" }))).toEqual({
      version: "1.2.3-beta.1",
      channel: "stable",
      kind: "skill",
      sourceProvenance: null,
      declaredScripts: [],
      provenance: null,
    });
    expect(() => parseReleaseMetadata(null)).toThrow(/required/);
    expect(() => parseReleaseMetadata("%%%")).toThrow(/base64/);
    expect(() => parseReleaseMetadata(header({ version: "1.0.0+build" }))).toThrow(/SemVer/);
    expect(() => parseReleaseMetadata(header({ version: "1.0.0", channel: "nightly" }))).toThrow(/channel/);
    expect(() => parseReleaseMetadata(header({ version: "1.0.0", owner: "x" }))).toThrow(/unknown/);
  });

  it("decodes kit provenance and treats provider skillx as a v1 release", () => {
    const header = (provenance: unknown) => Buffer.from(JSON.stringify({ version: "1.0.0", provenance })).toString("base64");
    const kit = { provider: "kit", origin: "remote-signed" };
    expect(parseReleaseMetadata(header(kit)).provenance).toEqual(kit);
    expect(parseReleaseMetadata(header({ provider: "skillx" })).provenance).toBeNull();
    expect(requestedProvider(header(kit))).toBe("kit");
    expect(requestedProvider("%%%")).toBe("skillx");
    expect(requestedProvider(header({ provider: "kit", origin: "signed" }))).toBe("kit");
    expect(() => parseReleaseMetadata(header({ provider: "kit" }))).toThrow(/origin/);
    expect(() => parseReleaseMetadata(header({ provider: "kit", origin: "signed" }))).toThrow(/origin/);
    expect(() => parseReleaseMetadata(header({ provider: "git" }))).toThrow(/provider/);
    expect(() => parseReleaseMetadata(header({ provider: "skillx", origin: "local-dev" }))).toThrow(/unknown provenance/);
    expect(() => parseReleaseMetadata(header("kit"))).toThrow(/object/);
  });

  it("accepts only @agentkit names for kit releases", () => {
    expect(parseReleaseName("@agentkit", "review", "kit")).toEqual({ identity: "@agentkit/review", handle: "agentkit", slug: "review" });
    expect(() => parseReleaseName("@alpha", "review", "kit")).toThrow(/kit/);
    expect(() => parseReleaseName("@AgentKit", "review", "kit")).toThrow(/lowercase/);
  });
});

describe("api key scopes", () => {
  it("normalizes requested scopes and fails closed on stored garbage", () => {
    expect(normalizeRequestedScopes(["releases:publish:@b", "releases:publish:@a", "releases:publish:@a"])).toEqual({
      scopes: ["releases:publish:@a", "releases:publish:@b"],
      handles: ["a", "b"],
    });
    expect(() => normalizeRequestedScopes(["admin"])).toThrow(/unsupported scope/);
    expect(() => normalizeRequestedScopes([])).toThrow(/non-empty/);
    expect(parseStoredScopes(null)).toBeNull();
    expect(parseStoredScopes("not json")).toEqual([]);
    expect(parseStoredScopes('{"a":1}')).toEqual([]);
  });
});
