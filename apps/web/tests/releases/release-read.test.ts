import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";
import { verifyReleaseManifest } from "@skillx/contracts";
import { RELEASE_READ_RATE_LIMIT, rateLimitKey } from "~/lib/releases/release-rate-limit";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { loader as keysLoader } from "~/routes/api.v1.signing-keys";
import { FakeKV } from "./fake-kv";
import { GET_CHUNK_BYTES } from "./fake-r2";
import { createHarness, file, tarOf, TEST_KEY_ID } from "./release-harness";

/** The web session is the only part of authentication that is faked; API keys run the real lookup. */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

type Harness = Awaited<ReturnType<typeof createHarness>>;
type Loader = (args: never) => Promise<Response>;
interface CallOptions {
  key?: string;
  headers?: Record<string, string>;
  env?: Record<string, unknown>;
  /** Query string appended to the URL, e.g. `?version=1.0.0`. */
  query?: string;
}

const enc = new TextEncoder();
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const bytesOf = async (res: Response) => new Uint8Array(await res.arrayBuffer());

/** Bytes a sanitizer would strip: a zero-width space and an ANSI colour escape. */
const RAW_SCRIPT = enc.encode("#!/bin/sh\necho ​hidden \u001b[31mred\u001b[0m\n");
const skillFiles = () => [
  file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n"),
  file("scripts/run.sh", RAW_SCRIPT, "100755"),
  file("references/notes.md", "Plain notes.\n"),
];

let h: Harness;
let kv: FakeKV;
let readerKey: string;

beforeEach(async () => {
  h = await createHarness();
  kv = new FakeKV();
  session.user = null;
  readerKey = await h.createKey("user-b", null);
});

afterEach(() => {
  vi.useRealTimers();
});

function call(loader: Loader, path: string, params: Record<string, string>, options: CallOptions = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  if (options.key !== undefined) headers.set("Authorization", `Bearer ${options.key}`);
  const env = {
    SKILLX_RELEASES_API: "1",
    DB: h.deps.db,
    R2: h.deps.bucket,
    KV: kv.asKV(),
    SKILLX_REGISTRY_SIGNING_KEY_ID: TEST_KEY_ID,
    ...options.env,
  };
  const request = new Request(`https://skillx.test${path}${options.query ?? ""}`, { headers });
  return loader({ request, params, context: { cloudflare: { env } } } as never);
}

const api = {
  list: (name: string, o?: CallOptions) => {
    const [scope, slug] = name.split("/") as [string, string];
    return call(listLoader, `/api/v1/packages/${name}/releases`, { scope, slug }, o);
  },
  version: (name: string, version: string, o?: CallOptions) => {
    const [scope, slug] = name.split("/") as [string, string];
    return call(manifestLoader, `/api/v1/packages/${name}/releases/${version}`, { scope, slug, version }, o);
  },
  manifest: (digest: string, o?: CallOptions) => call(manifestLoader, `/api/v1/releases/${digest}/manifest`, { digest }, o),
  file: (digest: string, rawPath: string, o?: CallOptions) =>
    call(fileLoader, `/api/v1/releases/${digest}/files/${rawPath}`, { digest, "*": rawPath }, o),
  artifact: (digest: string, o?: CallOptions) => call(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }, o),
  keys: (o?: CallOptions) => call(keysLoader, "/api/v1/keys", {}, o),
};

async function publish(name = "@alpha/demo", files = skillFiles(), version = "1.0.0") {
  const tar = tarOf(files);
  const res = await h.upload(name, tar, { version });
  expect(res.status).toBe(200);
  return { tar, digest: res.body.releaseDigest as string, state: res.body.state as string };
}

const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);
const setState = (version: string, state: string) =>
  sql("UPDATE package_releases SET release_state = ?, yanked_at = ? WHERE version = ?", state, state === "yanked" ? 2 : null, version);

async function expectError(res: Promise<Response> | Response, status: number, code: string) {
  const response = await res;
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

describe("release read: happy path over real HTTP bodies", () => {
  it("lists releases with digest and state, with a short cache", async () => {
    const { digest } = await publish();
    const res = await api.list("@alpha/demo");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, no-transform");
    expect(await res.json()).toEqual({
      identity: "@alpha/demo",
      releases: [
        expect.objectContaining({ version: "1.0.0", channel: "stable", state: "published", releaseDigest: digest, createdAt: "2026-10-13T12:00:00.000Z" }),
      ],
    });
  });

  it("serves the stored signed manifest by version and by digest, and its signature verifies", async () => {
    const { digest } = await publish();
    const [manifestKey] = h.r2.keys("manifests/");
    const stored = h.r2.objects.get(manifestKey!)!.bytes;
    for (const res of [await api.version("@alpha/demo", "1.0.0"), await api.manifest(digest)]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toBe("application/json");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=60, no-transform");
      expect(res.headers.get("X-SkillX-Release-State")).toBe("published");
      expect(res.headers.get("X-SkillX-Release-Digest")).toBe(digest);
      const body = await bytesOf(res);
      expect(body).toEqual(stored);
      expect(await verifyReleaseManifest(body, new Map([[TEST_KEY_ID, h.signingKey.publicKey]]))).toEqual({ valid: true, issues: [] });
    }
  });

  it("serves each manifest file's raw bytes, hashing to the manifest sha256, with an immutable cache", async () => {
    const { digest } = await publish();
    const manifest = JSON.parse(new TextDecoder().decode(await bytesOf(await api.manifest(digest))));
    expect(manifest.files).toHaveLength(3);
    for (const entry of manifest.files as Array<{ path: string; sha256: string; size: number }>) {
      const res = await api.file(digest, entry.path.split("/").map(encodeURIComponent).join("/"));
      expect(res.status).toBe(200);
      expect(res.headers.get("ETag")).toBe(`"${entry.sha256}"`);
      expect(res.headers.get("Content-Type")).toBe("application/octet-stream");
      expect(res.headers.get("Cache-Control")).toBe("public, max-age=31536000, immutable, no-transform");
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      const body = await bytesOf(res);
      expect(body.length).toBe(entry.size);
      expect(sha(body)).toBe(entry.sha256);
    }
    // Byte equality: the zero-width space and ANSI escape are served untouched.
    expect(await bytesOf(await api.file(digest, "scripts/run.sh"))).toEqual(RAW_SCRIPT);
  });

  it("answers 304 to a matching If-None-Match", async () => {
    const { digest } = await publish();
    const res = await api.file(digest, "SKILL.md", { headers: { "If-None-Match": `"${sha(skillFiles()[0]!.bytes)}"` } });
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("streams the artifact tar same-origin, byte-identical to the upload", async () => {
    const { tar, digest } = await publish();
    const res = await api.artifact(digest);
    expect(res.status).toBe(200);
    expect(res.headers.get("Location")).toBeNull();
    expect(res.headers.get("Content-Type")).toBe("application/x-tar");
    expect(res.headers.get("Content-Length")).toBe(String(tar.length));
    expect(res.headers.get("ETag")).toBe(`"${sha(tar)}"`);
    expect(res.headers.get("X-SkillX-Artifact-Digest")).toBe(`sha256:${sha(tar)}`);
    expect(await bytesOf(res)).toEqual(tar);
  });

  it("lists active and revoked key IDs without any key material", async () => {
    const secret = "MC4CAQAwBQYDK2VwBCIEIPrivateKeyMaterialNeverServed";
    const res = await api.keys({
      env: {
        SKILLX_REGISTRY_SIGNING_KEY: secret,
        SKILLX_REGISTRY_SIGNING_KEY_ID: "skillx-reg-new",
        SKILLX_REGISTRY_REVOKED_KEY_IDS: "skillx-reg-old, Bad Id,skillx-reg-older",
      },
    });
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ algorithm: "ed25519", active: ["skillx-reg-new"], revoked: ["skillx-reg-old", "skillx-reg-older"] });
    expect(text).not.toContain(secret);
  });
});

describe("release read: path and digest validation", () => {
  it.each([
    ["a path not in the manifest", "references/missing.md", 404],
    ["an encoded traversal ..%2f", "references/..%2fSKILL.md", 400],
    ["an encoded dot-dot %2e%2e%2f", "%2e%2e%2fSKILL.md", 400],
    ["a double-encoded traversal", "references/..%252fSKILL.md", 404],
    ["a double-encoded dot-dot", "%252e%252e%252fSKILL.md", 404],
    ["a NUL byte", "SKILL.md%00", 400],
    ["an encoded backslash", "references%5Cnotes.md", 400],
    ["an absolute path", "%2FSKILL.md", 400],
    ["a malformed percent escape", "SKILL.md%E0%A4%A", 400],
  ])("refuses %s", async (_label, rawPath, status) => {
    const { digest } = await publish();
    await expectError(api.file(digest, rawPath), status, status === 404 ? "not_found" : "invalid_path");
  });

  it.each([
    ["uppercase hex", `sha256:${"A".repeat(64)}`],
    ["short hex", `sha256:${"a".repeat(63)}`],
    ["another algorithm", `sha1:${"a".repeat(40)}`],
    ["no prefix", "a".repeat(64)],
  ])("answers 400 to a digest with %s on every digest endpoint", async (_label, digest) => {
    await expectError(api.manifest(digest), 400, "invalid_digest");
    await expectError(api.file(digest, "SKILL.md"), 400, "invalid_digest");
    await expectError(api.artifact(digest), 400, "invalid_digest");
  });

  it("answers 404 to an unknown well-formed digest, version or package", async () => {
    await publish();
    const unknown = `sha256:${"0".repeat(64)}`;
    await expectError(api.manifest(unknown), 404, "not_found");
    await expectError(api.artifact(unknown), 404, "not_found");
    await expectError(api.version("@alpha/demo", "9.9.9"), 404, "not_found");
    await expectError(api.list("@alpha/nope"), 404, "not_found");
    await expectError(api.version("@alpha/demo", "not-semver"), 400, "invalid_version");
    await expectError(api.list("@Alpha/Demo"), 400, "identity.invalid");
  });
});

describe("release read: private packages", () => {
  const makePrivate = () => sql("UPDATE packages SET visibility = 'private' WHERE name = '@alpha/demo'");
  const grant = (subject: string, revokedAt: number | null = null, releaseId: string | null = null) =>
    sql(
      `INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at)
       SELECT ?, ?, id, ?, 'grant', 1, ? FROM packages WHERE name = '@alpha/demo'`,
      `ent-${subject}-${revokedAt ?? "live"}`,
      subject,
      releaseId,
      revokedAt,
    );

  async function everyEndpoint(digest: string, options?: CallOptions) {
    return Promise.all([
      api.list("@alpha/demo", options),
      api.version("@alpha/demo", "1.0.0", options),
      api.manifest(digest, options),
      api.file(digest, "SKILL.md", options),
      api.artifact(digest, options),
    ]);
  }

  async function expectAllNotFound(responses: Response[], unknownBody: string) {
    for (const res of responses) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(unknownBody);
    }
  }

  it("answers unentitled callers exactly like an unknown package (anonymous, session, API key, scoped key)", async () => {
    const { digest } = await publish();
    makePrivate();
    const unknownBody = await (await api.list("@alpha/nope")).text();
    await expectAllNotFound(await everyEndpoint(digest), unknownBody);
    await expectAllNotFound(await everyEndpoint(digest, { key: readerKey }), unknownBody);
    // A scoped publish key never authenticates a read; even the owner's reads as anonymous.
    await expectAllNotFound(await everyEndpoint(digest, { key: h.alphaKey }), unknownBody);
    session.user = { id: "user-session" };
    await expectAllNotFound(await everyEndpoint(digest), unknownBody);
  });

  it("serves an entitled API key and session with a private cache, and stops on revocation", async () => {
    const { digest } = await publish();
    makePrivate();
    grant("user-b");
    for (const res of await everyEndpoint(digest, { key: readerKey })) {
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toMatch(/^private, /);
    }
    grant("user-session");
    session.user = { id: "user-session" };
    for (const res of await everyEndpoint(digest)) expect(res.status).toBe(200);

    session.user = null;
    sql("UPDATE entitlements SET revoked_at = 5 WHERE subject_id = 'user-b'");
    const unknownBody = await (await api.list("@alpha/nope")).text();
    await expectAllNotFound(await everyEndpoint(digest, { key: readerKey }), unknownBody);
  });

  it("treats a revoked publisher of a private package as unknown to unentitled callers", async () => {
    const { digest } = await publish();
    makePrivate();
    sql("UPDATE publishers SET state = 'revoked' WHERE handle = 'alpha'");
    const unknownBody = await (await api.list("@alpha/nope")).text();
    await expectAllNotFound(await everyEndpoint(digest), unknownBody);
  });
});

describe("release read: release and publisher state", () => {
  it("answers 403 release_quarantined everywhere and hides it from the listing", async () => {
    const secret = "AKIA" + "ABCDEFGHIJKLMNOP";
    await publish();
    const leaky = await publish("@alpha/demo", [...skillFiles(), file("config.env", `AWS_KEY=${secret}\n`)], "1.1.0");
    expect(leaky.state).toBe("quarantined");
    await expectError(api.version("@alpha/demo", "1.1.0"), 403, "release_quarantined");
    await expectError(api.manifest(leaky.digest), 403, "release_quarantined");
    await expectError(api.file(leaky.digest, "SKILL.md"), 403, "release_quarantined");
    await expectError(api.artifact(leaky.digest), 403, "release_quarantined");
    const list = await (await api.list("@alpha/demo")).json();
    expect(list.releases.map((r: { version: string }) => r.version)).toEqual(["1.0.0"]);
  });

  it("answers 410 release_yanked by version but serves by digest with state yanked", async () => {
    const { tar, digest } = await publish();
    setState("1.0.0", "yanked");
    await expectError(api.version("@alpha/demo", "1.0.0"), 410, "release_yanked");
    const manifest = await api.manifest(digest);
    expect(manifest.status).toBe(200);
    expect(manifest.headers.get("X-SkillX-Release-State")).toBe("yanked");
    const fileRes = await api.file(digest, "SKILL.md");
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("X-SkillX-Release-State")).toBe("yanked");
    const artifact = await api.artifact(digest);
    expect(artifact.headers.get("X-SkillX-Release-State")).toBe("yanked");
    expect(await bytesOf(artifact)).toEqual(tar);
    const list = await (await api.list("@alpha/demo")).json();
    expect(list.releases).toEqual([expect.objectContaining({ version: "1.0.0", state: "yanked" })]);
  });

  it("prefers the published row when one tree is published under a yanked and a live version", async () => {
    const first = await publish("@alpha/demo", skillFiles(), "1.0.0");
    const second = await publish("@alpha/demo", skillFiles(), "1.0.1");
    expect(second.digest).toBe(first.digest);
    setState("1.0.0", "yanked");
    const res = await api.manifest(first.digest);
    expect(res.headers.get("X-SkillX-Release-State")).toBe("published");
    expect(res.headers.get("X-SkillX-Version")).toBe("1.0.1");
  });

  it.each(["revoked", "suspended"])("answers 403 publisher_revoked for a %s publisher", async (state) => {
    const { digest } = await publish();
    sql("UPDATE publishers SET state = ? WHERE handle = 'alpha'", state);
    await expectError(api.list("@alpha/demo"), 403, "publisher_revoked");
    await expectError(api.version("@alpha/demo", "1.0.0"), 403, "publisher_revoked");
    await expectError(api.manifest(digest), 403, "publisher_revoked");
    await expectError(api.file(digest, "SKILL.md"), 403, "publisher_revoked");
    await expectError(api.artifact(digest), 403, "publisher_revoked");
  });

  it("completes an artifact stream with consistent bytes when the release is yanked mid-stream", async () => {
    const big = file("references/big.md", `${"Long reference text line.\n".repeat(8_000)}`);
    const { tar, digest } = await publish("@alpha/demo", [...skillFiles(), big]);
    expect(tar.length).toBeGreaterThan(GET_CHUNK_BYTES * 4);

    const res = await api.artifact(digest);
    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const chunks: Uint8Array[] = [];
    const first = await reader.read();
    chunks.push(first.value!);
    expect(first.value!.length).toBeLessThan(tar.length);

    setState("1.0.0", "yanked");
    for (let next = await reader.read(); !next.done; next = await reader.read()) chunks.push(next.value);
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(tar));

    await expectError(api.version("@alpha/demo", "1.0.0"), 410, "release_yanked");
    const again = await api.artifact(digest);
    expect(again.headers.get("X-SkillX-Release-State")).toBe("yanked");
    expect(await bytesOf(again)).toEqual(tar);
  });
});

describe("release read: version selector on digest endpoints", () => {
  async function twoVersionsOneTree() {
    const first = await publish("@alpha/demo", skillFiles(), "1.0.0");
    const second = await publish("@alpha/demo", skillFiles(), "1.0.1");
    expect(second.digest).toBe(first.digest);
    return first;
  }
  const at = (version: string): CallOptions => ({ query: `?version=${version}` });

  it("selects each of two versions sharing one tree on manifest, file and artifact", async () => {
    const { tar, digest } = await twoVersionsOneTree();
    for (const version of ["1.0.0", "1.0.1"]) {
      const byVersion = await bytesOf(await api.version("@alpha/demo", version));
      const manifest = await api.manifest(digest, at(version));
      expect(manifest.status).toBe(200);
      expect(manifest.headers.get("X-SkillX-Version")).toBe(version);
      const bytes = await bytesOf(manifest);
      expect(bytes).toEqual(byVersion);
      expect(JSON.parse(new TextDecoder().decode(bytes)).version).toBe(version);

      const fileRes = await api.file(digest, "SKILL.md", at(version));
      expect(fileRes.status).toBe(200);
      expect(fileRes.headers.get("X-SkillX-Version")).toBe(version);
      const artifact = await api.artifact(digest, at(version));
      expect(artifact.headers.get("X-SkillX-Version")).toBe(version);
      expect(await bytesOf(artifact)).toEqual(tar);
    }
  });

  it("answers the unknown-release 404 to a mismatched or unknown version, and 400 to a malformed one", async () => {
    const { digest } = await twoVersionsOneTree();
    await publish("@alpha/demo", [...skillFiles(), file("extra.md", "other tree\n")], "2.0.0");
    const unknownBody = await (await api.manifest(`sha256:${"0".repeat(64)}`)).text();
    for (const version of ["2.0.0", "9.9.9"]) {
      for (const res of [await api.manifest(digest, at(version)), await api.file(digest, "SKILL.md", at(version)), await api.artifact(digest, at(version))]) {
        expect(res.status).toBe(404);
        expect(await res.text()).toBe(unknownBody);
      }
    }
    await expectError(api.manifest(digest, at("not-semver")), 400, "invalid_version");
    await expectError(api.artifact(digest, { query: "?version=" }), 400, "invalid_version");
  });

  it("serves a selected yanked version with state yanked, while the unselected answer stays published", async () => {
    const { digest } = await twoVersionsOneTree();
    setState("1.0.0", "yanked");
    for (const res of [await api.manifest(digest, at("1.0.0")), await api.file(digest, "SKILL.md", at("1.0.0")), await api.artifact(digest, at("1.0.0"))]) {
      expect(res.status).toBe(200);
      expect(res.headers.get("X-SkillX-Release-State")).toBe("yanked");
      expect(res.headers.get("X-SkillX-Version")).toBe("1.0.0");
    }
    const unselected = await api.manifest(digest);
    expect(unselected.headers.get("X-SkillX-Release-State")).toBe("published");
    expect(unselected.headers.get("X-SkillX-Version")).toBe("1.0.1");
  });

  it("answers 403 to a selected quarantined version even when another version of the tree is published", async () => {
    const { digest } = await twoVersionsOneTree();
    setState("1.0.0", "quarantined");
    await expectError(api.manifest(digest, at("1.0.0")), 403, "release_quarantined");
    await expectError(api.file(digest, "SKILL.md", at("1.0.0")), 403, "release_quarantined");
    await expectError(api.artifact(digest, at("1.0.0")), 403, "release_quarantined");
    // Without a selector any readable quarantined release of the tree blocks the bytes.
    await expectError(api.manifest(digest), 403, "release_quarantined");
  });

  it("fails closed for a selected published version whose tree has a quarantined sibling", async () => {
    const { digest } = await twoVersionsOneTree();
    setState("1.0.0", "quarantined");
    await expectError(api.manifest(digest, at("1.0.1")), 403, "release_quarantined");
    await expectError(api.file(digest, "SKILL.md", at("1.0.1")), 403, "release_quarantined");
    await expectError(api.artifact(digest, at("1.0.1")), 403, "release_quarantined");
    // A new resolution by version of the published sibling is blocked too.
    await expectError(api.version("@alpha/demo", "1.0.1"), 403, "release_quarantined");
  });

  it("hides from the listing every release whose tree is quarantined anywhere", async () => {
    await twoVersionsOneTree();
    await publish("@alpha/demo", [...skillFiles(), file("extra.md", "other tree\n")], "2.0.0");
    setState("1.0.0", "quarantined");
    const list = await api.list("@alpha/demo");
    expect(list.status).toBe(200);
    const body = await list.json();
    // 1.0.0 is quarantined and 1.0.1 shares its tree; only the other tree remains.
    expect(body.releases.map((r: { version: string }) => r.version)).toEqual(["2.0.0"]);
  });

  it("blocks a tree quarantined in another package, and keeps yanked per release", async () => {
    const { digest } = await twoVersionsOneTree();
    await publish("@alpha/other", skillFiles(), "1.0.0");
    sql(
      "UPDATE package_releases SET release_state = 'quarantined' WHERE package_id = (SELECT id FROM packages WHERE name = '@alpha/other')",
    );
    await expectError(api.version("@alpha/demo", "1.0.1"), 403, "release_quarantined");
    await expectError(api.artifact(digest, at("1.0.1")), 403, "release_quarantined");

    sql("UPDATE package_releases SET release_state = 'published'");
    setState("1.0.0", "yanked");
    expect((await api.version("@alpha/demo", "1.0.1")).status).toBe(200);
    await expectError(api.version("@alpha/demo", "1.0.0"), 410, "release_yanked");
  });
});

describe("release read: rate limit and flag", () => {
  it("answers 429 with Retry-After once a caller exhausts its window, per IP and per user", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T12:00:15Z"));
    const { digest } = await publish();
    const ip = { "CF-Connecting-IP": "203.0.113.9" };

    expect((await api.manifest(digest, { headers: ip })).status).toBe(200);
    expect(kv.values.get(rateLimitKey("ip:203.0.113.9", Date.now()))).toBe("1");

    kv.values.set(rateLimitKey("ip:203.0.113.9", Date.now()), String(RELEASE_READ_RATE_LIMIT));
    const limited = await api.manifest(digest, { headers: ip });
    expect(limited.status).toBe(429);
    expect(limited.headers.get("Retry-After")).toBe("45");
    expect(await limited.json()).toEqual({ error: { code: "rate_limited", message: expect.any(String) } });
    // Another client is unaffected.
    expect((await api.manifest(digest, { headers: { "CF-Connecting-IP": "198.51.100.7" } })).status).toBe(200);

    // An authenticated caller is counted per user, not per IP.
    kv.values.set(rateLimitKey("user:user-b", Date.now()), String(RELEASE_READ_RATE_LIMIT));
    expect((await api.artifact(digest, { key: readerKey, headers: { "CF-Connecting-IP": "198.51.100.7" } })).status).toBe(429);
  });

  it("lets requests through when KV fails (fail open)", async () => {
    const { digest } = await publish();
    kv.failing = true;
    expect((await api.manifest(digest)).status).toBe(200);
  });

  it("answers 404 on every endpoint while SKILLX_RELEASES_API is off, before any work", async () => {
    const { digest } = await publish();
    for (const flag of [undefined, "0", "false", "off"]) {
      const env = { SKILLX_RELEASES_API: flag };
      for (const res of [
        await api.list("@alpha/demo", { env }),
        await api.version("@alpha/demo", "1.0.0", { env }),
        await api.manifest(digest, { env }),
        await api.file(digest, "SKILL.md", { env }),
        await api.artifact(digest, { env }),
        await api.keys({ env }),
      ]) {
        expect(res.status).toBe(404);
        expect(await res.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
      }
    }
    expect(kv.values.size).toBe(0);
  });
});
