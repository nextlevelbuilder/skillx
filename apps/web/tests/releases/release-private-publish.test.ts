import { beforeEach, describe, expect, it, vi } from "vitest";
import { requestFingerprint, publishRelease } from "~/lib/releases/release-idempotency";
import { parseReleaseMetadata } from "~/lib/releases/release-request";
import { RELEASE_READ_RATE_LIMIT } from "~/lib/releases/release-rate-limit";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { NOW, TEST_KEY_ID, createHarness, file, tarOf } from "./release-harness";
import type { UploadOptions } from "./release-harness";

/** Publish visibility: the metadata `visibility` member, the new-package default and the never-change rule. */

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

beforeEach(async () => {
  h = await createHarness();
  session.user = null;
});

/** A nested tree: SKILL.md plus references and scripts below it. */
const nestedFiles = (extra = "") => [
  file("SKILL.md", `---\nname: notes\ndescription: Private notes\n---\n# Notes${extra}\n`),
  file("references/deep/guide.md", "Guide.\n"),
  file("scripts/run.sh", "#!/bin/sh\necho ok\n", "100755"),
];

const OMITTED = { visibility: null } as const;
const publish = (name: string, options: UploadOptions = {}, extra = "") => h.upload(name, tarOf(nestedFiles(extra)), options);
const storedVisibility = (name: string) =>
  (h.d1.raw.prepare("SELECT visibility FROM packages WHERE name = ?").get(name) as { visibility: string } | undefined)?.visibility;

function read(loader: (args: never) => Promise<Response>, path: string, params: Record<string, string>, key?: string): Promise<Response> {
  const headers = new Headers();
  if (key !== undefined) headers.set("Authorization", `Bearer ${key}`);
  const env = {
    SKILLX_RELEASES_API: "1",
    DB: h.deps.db,
    R2: h.deps.bucket,
    RELEASE_READ_LIMITER: new FakeRateLimiter(RELEASE_READ_RATE_LIMIT),
    SKILLX_REGISTRY_SIGNING_KEY_ID: TEST_KEY_ID,
  };
  return loader({ request: new Request(`https://skillx.test${path}`, { headers }), params, context: { cloudflare: { env } } } as never);
}

const reads = (name: string, digest: string, key?: string) => {
  const [scope, slug] = name.split("/") as [string, string];
  return Promise.all([
    read(listLoader, `/api/v1/packages/${name}/releases`, { scope, slug }, key),
    read(manifestLoader, `/api/v1/packages/${name}/releases/1.0.0`, { scope, slug, version: "1.0.0" }, key),
    read(manifestLoader, `/api/v1/releases/${digest}/manifest`, { digest }, key),
    read(fileLoader, `/api/v1/releases/${digest}/files/references/deep/guide.md`, { digest, "*": "references/deep/guide.md" }, key),
    read(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }, key),
  ]);
};

describe("publish visibility: defaults", () => {
  it("creates a new package as private when the metadata names no visibility", async () => {
    const res = await publish("@alpha/notes", OMITTED);
    expect(res).toMatchObject({ status: 200, body: { created: true, visibility: "private", state: "published" } });
    expect(storedVisibility("@alpha/notes")).toBe("private");
    expect(h.releaseRows()).toEqual([expect.objectContaining({ name: "@alpha/notes", file_count: 3 })]);
  });

  it("keeps a private package private when the next version names no visibility", async () => {
    await publish("@alpha/notes", { visibility: "private" });
    const next = await publish("@alpha/notes", { ...OMITTED, version: "1.1.0" }, " v2");
    expect(next).toMatchObject({ status: 200, body: { created: true, visibility: "private" } });
    expect(storedVisibility("@alpha/notes")).toBe("private");
  });

  it("keeps a public package public when the next version names no visibility", async () => {
    await publish("@alpha/notes", { visibility: "public" });
    const next = await publish("@alpha/notes", { ...OMITTED, version: "1.1.0" }, " v2");
    expect(next).toMatchObject({ status: 200, body: { created: true, visibility: "public" } });
    expect(storedVisibility("@alpha/notes")).toBe("public");
  });

  it("creates a public package when asked explicitly, readable anonymously", async () => {
    const res = await publish("@alpha/notes", { visibility: "public" });
    expect(res).toMatchObject({ status: 200, body: { visibility: "public" } });
    for (const answer of await reads("@alpha/notes", res.body.releaseDigest as string)) expect(answer.status).toBe(200);
  });

  it("keeps a new @agentkit kit release public when it names no visibility", async () => {
    const key = await h.createKey("user-a", ["releases:publish:@agentkit"]);
    const res = await publish("@agentkit/review", { key, ...OMITTED, metadata: { version: "1.0.0", provenance: { provider: "kit", origin: "remote-signed" } } });
    expect(res).toMatchObject({ status: 200, body: { created: true, visibility: "public" } });
    expect(storedVisibility("@agentkit/review")).toBe("public");
  });

  it("does not create a skills row for a private release", async () => {
    await publish("@alpha/notes", OMITTED);
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM skills").get()).toEqual({ n: 0 });
  });
});

describe("publish visibility: never changed by a publish", () => {
  it.each([
    ["private", "public"],
    ["public", "private"],
  ] as const)("refuses %s -> %s with 409 and writes nothing", async (stored, requested) => {
    await publish("@alpha/notes", { visibility: stored });
    const writes = h.r2.putLog.length;
    const res = await publish("@alpha/notes", { visibility: requested, version: "1.1.0" }, " v2");
    expect(res).toMatchObject({ status: 409, body: { error: { code: "release.visibility_mismatch" } } });
    expect(h.r2.putLog.length).toBe(writes);
    expect(h.releaseRows()).toHaveLength(1);
    expect(storedVisibility("@alpha/notes")).toBe(stored);
  });

  it("refuses a replay of an existing version that names another visibility", async () => {
    await publish("@alpha/notes", { visibility: "private" });
    const res = await publish("@alpha/notes", { visibility: "public" });
    expect(res).toMatchObject({ status: 409, body: { error: { code: "release.visibility_mismatch" } } });
  });

  it("lets only one of two concurrent first publishes with different visibilities create the package", async () => {
    h.r2.holdPuts("artifacts/", 2);
    const [pub, priv] = await Promise.all([publish("@alpha/notes", { visibility: "public" }), publish("@alpha/notes", { visibility: "private" })]);
    const results = [pub, priv].map((r) => r.status).sort();
    expect(results).toEqual([200, 409]);
    const loser = pub.status === 409 ? pub : priv;
    const winner = pub.status === 200 ? pub : priv;
    expect(loser.body.error.code).toBe("release.visibility_mismatch");
    expect(storedVisibility("@alpha/notes")).toBe(winner.body.visibility);
    expect(h.releaseRows()).toHaveLength(1);
  });

  it.each([["unlisted"], [true], [null]])("rejects visibility %j with 400 before any write", async (value) => {
    const res = await publish("@alpha/notes", { metadata: { version: "1.0.0", visibility: value } });
    expect(res).toMatchObject({ status: 400, body: { error: { code: "release.invalid_metadata" } } });
    expect(h.r2.putLog).toEqual([]);
  });
});

describe("publish visibility: idempotency", () => {
  async function send(key: string, options: UploadOptions) {
    const req = h.request("@alpha/notes", tarOf(nestedFiles()) as BodyInit, options);
    req.headers.set("Idempotency-Key", key);
    const res = await publishRelease(req, { scope: "@alpha", slug: "notes" }, h.deps);
    return { status: res.status, body: JSON.parse(await res.text()) };
  }

  it("refuses the same key with another visibility (422)", async () => {
    expect((await send("run-1", { visibility: "private" })).status).toBe(200);
    const other = await send("run-1", { visibility: "public" });
    expect(other).toMatchObject({ status: 422, body: { error: { code: "idempotency.key_reused" } } });
  });

  it("keeps the fingerprint of a request without visibility, and binds an explicit one", async () => {
    const header = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64");
    const body = tarOf(nestedFiles());
    const omitted = await requestFingerprint("@alpha/notes", parseReleaseMetadata(header({ version: "1.0.0" })), body);
    const priv = await requestFingerprint("@alpha/notes", parseReleaseMetadata(header({ version: "1.0.0", visibility: "private" })), body);
    expect(omitted).not.toBe(priv);
    // Same input as before the field existed: [identity, version, channel, kind, sourceProvenance, declaredScripts, sha256(body)].
    const { createHash } = await import("node:crypto");
    const sha = (bytes: Uint8Array | string) => createHash("sha256").update(bytes).digest("hex");
    expect(omitted).toBe(`sha256:${sha(JSON.stringify(["@alpha/notes", "1.0.0", "stable", "skill", null, [], sha(body)]))}`);
  });

  it("does not store a visibility mismatch, so the key stays usable", async () => {
    await publish("@alpha/notes", { visibility: "private" });
    const refused = await send("run-2", { visibility: "public", version: "1.1.0" });
    expect(refused.status).toBe(409);
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM release_publish_idempotency").get()).toEqual({ n: 0 });
  });
});

describe("publish visibility: reads of a new private package", () => {
  it("answers 404 to anonymous and non-owner readers on every read path", async () => {
    const res = await publish("@alpha/notes", OMITTED);
    const digest = res.body.releaseDigest as string;
    for (const answer of await reads("@alpha/notes", digest)) {
      expect(answer.status).toBe(404);
      expect(answer.headers.get("Cache-Control")).toBe("no-store");
    }
    const stranger = await h.createKey("user-b", null);
    for (const answer of await reads("@alpha/notes", digest, stranger)) expect(answer.status).toBe(404);
    session.user = { id: "user-b" };
    for (const answer of await reads("@alpha/notes", digest)) expect(answer.status).toBe(404);
  });

  it("serves the publisher owner every read path of their new private package with private, no-store", async () => {
    const res = await publish("@alpha/notes", OMITTED);
    expect(res.body.visibility).toBe("private");
    const digest = res.body.releaseDigest as string;
    const ownerKey = await h.createKey("user-a", null);
    for (const answer of await reads("@alpha/notes", digest, ownerKey)) {
      expect(answer.status).toBe(200);
      expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    }
    session.user = { id: "user-a" };
    for (const answer of await reads("@alpha/notes", digest)) {
      expect(answer.status).toBe(200);
      expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });

  it("serves an admitted reader every private answer with Cache-Control private, no-store", async () => {
    const res = await publish("@alpha/notes", OMITTED);
    h.d1.raw
      .prepare("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at) SELECT 'ent-1', 'user-b', id, NULL, 'manual', ?, NULL FROM packages")
      .run(NOW.getTime());
    const reader = await h.createKey("user-b", null);
    for (const answer of await reads("@alpha/notes", res.body.releaseDigest as string, reader)) {
      expect(answer.status).toBe(200);
      expect(answer.headers.get("Cache-Control")).toBe("private, no-store");
    }
  });
});
