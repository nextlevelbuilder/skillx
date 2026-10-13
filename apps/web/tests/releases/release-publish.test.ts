import { beforeEach, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readTarTree } from "@skillx/skill-tree";
import { verifyReleaseManifest } from "@skillx/contracts";
import { action } from "~/routes/api.v1.release-publish";
import { createHarness, file, tarOf, TEST_KEY_ID } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
const enc = new TextEncoder();
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Bytes a sanitizer would strip: a zero-width space and an ANSI colour escape. */
const RAW_SCRIPT = enc.encode("#!/bin/sh\necho ​hidden \u001b[31mred\u001b[0m $(date)\n");
const skillFiles = () => [
  file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n"),
  file("scripts/run.sh", RAW_SCRIPT, "100755"),
  file("references/notes.md", "Plain notes.\n"),
];

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});

describe("release publish: happy path", () => {
  it("stores artifact, raw blobs and a verifiable signed manifest, then writes the row", async () => {
    const tar = tarOf(skillFiles());
    const expected = await readTarTree(tar);
    const res = await h.upload("@alpha/demo", tar, {
      metadata: {
        version: "1.0.0",
        sourceProvenance: { repo: "https://github.com/alpha/skills", commit: "a".repeat(40), path: "demo" },
        declaredScripts: ["scripts/run.sh"],
      },
    });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ created: true, state: "published", releaseDigest: expected.digest, keyId: TEST_KEY_ID });

    expect(h.r2.keys("artifacts/")).toEqual([`artifacts/sha256/${sha(tar)}.tar`]);
    expect(h.r2.objects.get(`artifacts/sha256/${sha(tar)}.tar`)!.bytes).toEqual(tar);
    // Byte equality: the blob keeps the zero-width space and ANSI escape (no sanitizer).
    expect(h.r2.objects.get(`blobs/sha256/${sha(RAW_SCRIPT)}`)!.bytes).toEqual(RAW_SCRIPT);
    expect(h.r2.keys("blobs/")).toHaveLength(3);

    const [manifestKey] = h.r2.keys("manifests/");
    const manifestBytes = h.r2.objects.get(manifestKey!)!.bytes;
    expect(manifestKey).toBe(`manifests/sha256/${sha(manifestBytes)}.json`);
    const verified = await verifyReleaseManifest(manifestBytes, new Map([[TEST_KEY_ID, h.signingKey.publicKey]]));
    expect(verified).toEqual({ valid: true, issues: [] });
    const manifest = JSON.parse(new TextDecoder().decode(manifestBytes));
    expect(manifest).toMatchObject({
      identity: "@alpha/demo",
      releaseDigest: expected.digest,
      artifactDigest: `sha256:${sha(tar)}`,
      publisher: { handle: "alpha", verifiedBy: "admin" },
      declaredScripts: ["scripts/run.sh"],
      createdAt: "2026-10-13T12:00:00Z",
    });

    expect(h.releaseRows()).toEqual([
      expect.objectContaining({
        name: "@alpha/demo",
        version: "1.0.0",
        release_state: "published",
        release_digest: expected.digest,
        signed_manifest_key: manifestKey,
        file_count: 3,
      }),
    ]);
  });

  it("accepts @bestagentkits as an ordinary publisher handle", async () => {
    const res = await h.upload("@bestagentkits/plan-helper", tarOf(skillFiles()));
    expect(res.status).toBe(200);
  });

  it("quarantines a release that contains a secret, without echoing it", async () => {
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    const res = await h.upload("@alpha/leaky", tarOf([...skillFiles(), file("config.env", `AWS_KEY=${secret}\n`)]));
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("quarantined");
    expect(res.body.findings).toEqual(["danger:secret-aws-access-key-id:config.env"]);
    expect(JSON.stringify(res.body)).not.toContain(secret);
    expect(h.releaseRows()[0]).toMatchObject({ release_state: "quarantined" });
  });
});

describe("release publish: flag and authorization", () => {
  const routeCall = (env: Record<string, unknown>) =>
    action({
      request: h.request("@alpha/demo", tarOf(skillFiles())),
      params: { scope: "@alpha", slug: "demo" },
      context: { cloudflare: { env } },
    } as never);

  it("answers 404 while SKILLX_RELEASES_API is off, before any work", async () => {
    for (const flag of [undefined, "0", "false", "off"]) {
      const res = await routeCall({ SKILLX_RELEASES_API: flag, DB: h.deps.db, R2: h.deps.bucket });
      expect(res.status).toBe(404);
    }
    expect(h.r2.putLog).toEqual([]);
  });

  it("answers 503 without key detail when the signing secret is missing or malformed", async () => {
    const secretLike = "not-a-real-key-material";
    const res = await routeCall({ SKILLX_RELEASES_API: "1", DB: h.deps.db, R2: h.deps.bucket, SKILLX_REGISTRY_SIGNING_KEY: secretLike, SKILLX_REGISTRY_SIGNING_KEY_ID: "skillx-reg-test" });
    expect(res.status).toBe(503);
    expect(await res.text()).not.toContain(secretLike);
    expect(h.r2.putLog).toEqual([]);
  });

  it.each([
    ["missing key", null, 401],
    ["malformed key", "sx_nothex", 401],
  ])("rejects a %s with 401", async (_label, key, status) => {
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { key })).status).toBe(status);
  });

  it("rejects a revoked key (401), a legacy unscoped key (403) and a key for another handle (403)", async () => {
    const revoked = await h.createKey("user-a", ["releases:publish:@alpha"], true);
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { key: revoked })).status).toBe(401);
    const legacy = await h.createKey("user-a", null);
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { key: legacy })).body.error.code).toBe("auth.scope_missing");
    // Publisher A's key uploading to publisher B's handle.
    const res = await h.upload("@beta/demo", tarOf(skillFiles()));
    expect(res).toMatchObject({ status: 403, body: { error: { code: "auth.scope_missing" } } });
    // A scope for a handle the key owner does not own grants nothing.
    const stolen = await h.createKey("user-a", ["releases:publish:@beta"]);
    expect((await h.upload("@beta/demo", tarOf(skillFiles()), { key: stolen })).body.error.code).toBe("publisher.not_owner");
    expect((await h.upload("@gone/demo", tarOf(skillFiles()))).body.error.code).toBe("publisher.inactive");
    expect(h.r2.putLog).toEqual([]);
    expect(h.releaseRows()).toEqual([]);
  });

  it.each([
    ["@agentkit/x", "identity.reserved_publisher"],
    ["@AgentKit/x", "identity.reserved_publisher"],
    ["@bestagentkits/ak-plan", "identity.reserved_alias"],
    ["@bestagentkits/AK:plan", "identity.reserved_alias"],
  ])("reserves %s with 403", async (name, code) => {
    const res = await h.upload(name, tarOf(skillFiles()));
    expect(res).toMatchObject({ status: 403, body: { error: { code } } });
    expect(h.r2.putLog).toEqual([]);
  });
});

describe("release publish: immutability and races", () => {
  it("is idempotent for the same bytes (200) and refuses other bytes for the version (409)", async () => {
    const tar = tarOf(skillFiles());
    expect((await h.upload("@alpha/demo", tar)).body.created).toBe(true);
    const again = await h.upload("@alpha/demo", tar);
    expect(again).toMatchObject({ status: 200, body: { created: false } });
    const writes = h.r2.putLog.length;
    const other = await h.upload("@alpha/demo", tarOf([...skillFiles(), file("extra.md", "x")]));
    expect(other).toMatchObject({ status: 409, body: { error: { code: "release.version_exists" } } });
    expect(h.r2.putLog.length).toBe(writes);
    expect(h.releaseRows()).toHaveLength(1);
  });

  it("lets exactly one of two concurrent different uploads win, with no orphaned row", async () => {
    h.r2.holdPuts("artifacts/", 2);
    const [a, b] = await Promise.all([
      h.upload("@alpha/demo", tarOf(skillFiles())),
      h.upload("@alpha/demo", tarOf([...skillFiles(), file("extra.md", "x")])),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const winner = a.status === 200 ? a : b;
    expect(h.releaseRows()).toEqual([expect.objectContaining({ release_digest: winner.body.releaseDigest })]);
  });

  it("answers 200 to both of two concurrent identical uploads and stores one artifact", async () => {
    h.r2.holdPuts("artifacts/", 2);
    const tar = tarOf(skillFiles());
    const [a, b] = await Promise.all([h.upload("@alpha/demo", tar), h.upload("@alpha/demo", tar)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.created, b.body.created].sort()).toEqual([false, true]);
    expect(h.r2.keys("artifacts/")).toHaveLength(1);
    expect(h.releaseRows()).toHaveLength(1);
  });

  it("refuses a second kind for an existing package (409)", async () => {
    await h.upload("@alpha/demo", tarOf(skillFiles()));
    const res = await h.upload("@alpha/demo", tarOf(skillFiles()), { metadata: { version: "2.0.0", kind: "bundle" } });
    expect(res).toMatchObject({ status: 409, body: { error: { code: "release.kind_conflict" } } });
  });
});
