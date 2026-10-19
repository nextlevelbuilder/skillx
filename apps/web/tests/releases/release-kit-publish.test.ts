import { beforeEach, describe, expect, it } from "vitest";
import { releaseTrust, validateReleaseManifest, verifyReleaseManifest, verifyReleaseStatus } from "@skillx/contracts";
import type { SkillxReleaseManifest } from "@skillx/contracts";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { RELEASE_READ_RATE_LIMIT } from "~/lib/releases/release-rate-limit";
import { readReleaseStatus } from "~/lib/releases/release-status-issue";
import { NOW, createHarness, file, tarOf, TEST_KEY_ID } from "./release-harness";

/** Kit releases: `@agentkit/*` content published with kit provenance and signed as `skillx.release/v2`. */

type Harness = Awaited<ReturnType<typeof createHarness>>;
const KIT = { provider: "kit", origin: "remote-signed" } as const;
const skillFiles = () => [file("SKILL.md", "---\nname: review\ndescription: Review guardrails\n---\n# Review\n")];
const kitMetadata = (provenance: unknown = KIT) => ({ version: "1.0.0", provenance });

let h: Harness;
let agentkitKey: string;
beforeEach(async () => {
  h = await createHarness();
  agentkitKey = await h.createKey("user-a", ["releases:publish:@agentkit"]);
});

const storedManifest = (): { bytes: Uint8Array<ArrayBuffer>; manifest: SkillxReleaseManifest } => {
  const [key] = h.r2.keys("manifests/");
  const bytes = h.r2.objects.get(key!)!.bytes as Uint8Array<ArrayBuffer>;
  return { bytes, manifest: JSON.parse(new TextDecoder().decode(bytes)) };
};

describe("kit release publish", () => {
  it("signs an @agentkit kit release as v2 with its provenance, and the trust stays local-unverified", async () => {
    const res = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata() });
    expect(res).toMatchObject({ status: 200, body: { created: true, state: "published" } });

    const { bytes, manifest } = storedManifest();
    expect(await verifyReleaseManifest(bytes, new Map([[TEST_KEY_ID, h.signingKey.publicKey]]))).toEqual({ valid: true, issues: [] });
    expect(manifest).toMatchObject({
      schemaVersion: "skillx.release/v2",
      identity: "@agentkit/review",
      publisher: { handle: "agentkit", verifiedBy: "admin" },
      provenance: KIT,
    });
    expect(releaseTrust(manifest)).toBe("local-unverified");
    const [row] = h.d1.raw.prepare("SELECT manifest_schema_version FROM package_releases").all() as Array<Record<string, unknown>>;
    expect(row).toEqual({ manifest_schema_version: "skillx.release/v2" });
  });

  it("keeps an ordinary release on v1, also when it names provider skillx", async () => {
    const res = await h.upload("@alpha/demo", tarOf(skillFiles()), { metadata: kitMetadata({ provider: "skillx" }) });
    expect(res.status).toBe(200);
    const { manifest } = storedManifest();
    expect(manifest.schemaVersion).toBe("skillx.release/v1");
    expect(manifest).not.toHaveProperty("provenance");
  });

  it("serves the stored v2 manifest from the read API unchanged", async () => {
    const res = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata() });
    const env = {
      SKILLX_RELEASES_API: "1",
      DB: h.deps.db,
      R2: h.deps.bucket,
      RELEASE_READ_LIMITER: new FakeRateLimiter(RELEASE_READ_RATE_LIMIT),
      SKILLX_REGISTRY_SIGNING_KEY_ID: TEST_KEY_ID,
    };
    const digest = res.body.releaseDigest as string;
    const request = new Request(`https://skillx.test/api/v1/releases/${digest}/manifest`);
    const served = await manifestLoader({ request, params: { digest }, context: { cloudflare: { env } } } as never);
    expect(served.status).toBe(200);
    const bytes = new Uint8Array(await served.arrayBuffer());
    expect(bytes).toEqual(storedManifest().bytes);
    expect(validateReleaseManifest(JSON.parse(new TextDecoder().decode(bytes))).valid).toBe(true);
  });

  it("still reserves @agentkit for a release without kit provenance", async () => {
    const res = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey });
    expect(res).toMatchObject({ status: 403, body: { error: { code: "identity.reserved_publisher" } } });
    expect(h.r2.putLog).toEqual([]);
  });

  it("refuses kit provenance outside the @agentkit publisher", async () => {
    const res = await h.upload("@bestagentkits/review", tarOf(skillFiles()), { metadata: kitMetadata() });
    expect(res).toMatchObject({ status: 400, body: { error: { code: "identity.invalid" } } });
    expect(h.r2.putLog).toEqual([]);
  });

  it("lets a kit release use the ak- alias form reserved for @agentkit", async () => {
    const res = await h.upload("@agentkit/ak-review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata() });
    expect(res.status).toBe(200);
  });

  it("requires the releases:publish:@agentkit scope of the agentkit publisher owner", async () => {
    const other = await h.createKey("user-a", ["releases:publish:@alpha"]);
    const scoped = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: other, metadata: kitMetadata() });
    expect(scoped).toMatchObject({ status: 403, body: { error: { code: "auth.scope_missing" } } });
    const stranger = await h.createKey("user-b", ["releases:publish:@agentkit"]);
    const notOwner = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: stranger, metadata: kitMetadata() });
    expect(notOwner.body.error.code).toBe("publisher.not_owner");
    h.d1.raw.prepare("UPDATE publishers SET state = 'suspended' WHERE handle = 'agentkit'").run();
    const inactive = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata() });
    expect(inactive.body.error.code).toBe("publisher.inactive");
    expect(h.r2.putLog).toEqual([]);
  });

  it("rejects an unknown kit origin with 400", async () => {
    const res = await h.upload("@agentkit/review", tarOf(skillFiles()), {
      key: agentkitKey,
      metadata: kitMetadata({ provider: "kit", origin: "registry-signed" }),
    });
    expect(res).toMatchObject({ status: 400, body: { error: { code: "release.invalid_metadata" } } });
  });

  it("answers an identical kit replay with 200 and a different origin with 409", async () => {
    const publish = (origin: string) =>
      h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata({ provider: "kit", origin }) });
    expect((await publish("local-dev")).body.created).toBe(true);
    expect(await publish("local-dev")).toMatchObject({ status: 200, body: { created: false } });
    const upgraded = await publish("remote-signed");
    expect(upgraded).toMatchObject({ status: 409, body: { error: { code: "release.version_exists" } } });
    expect(upgraded.body.error.message).toContain("kit origin local-dev");
  });

  it("rejects a kit provenance without origin after authorization", async () => {
    const res = await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata({ provider: "kit" }) });
    expect(res).toMatchObject({ status: 400, body: { error: { code: "release.invalid_metadata" } } });
    expect(h.r2.putLog).toEqual([]);
  });

  it("issues a signed release status that verifies against the v2 manifest", async () => {
    await h.upload("@agentkit/review", tarOf(skillFiles()), { key: agentkitKey, metadata: kitMetadata() });
    const request = new Request("https://skillx.test/api/v1/packages/@agentkit/review/releases/1.0.0/status");
    const ctx = { db: h.deps.db, bucket: h.deps.bucket, userId: null, request };
    const now = new Date(NOW.getTime() + 3600_000);
    const res = await readReleaseStatus(ctx, { scope: "@agentkit", slug: "review", version: "1.0.0" }, {
      loadSigner: h.deps.loadSigner,
      activeKeyId: TEST_KEY_ID,
      now: () => now,
    });
    expect(res.status).toBe(200);
    const keys = new Map([[TEST_KEY_ID, h.signingKey.publicKey]]);
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(await verifyReleaseStatus(bytes, keys, { manifest: storedManifest().manifest, now, previous: null })).toEqual({ valid: true, issues: [] });
  });
});
