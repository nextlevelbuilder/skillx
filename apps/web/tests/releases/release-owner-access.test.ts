import { BEARER_CHALLENGE } from "~/lib/agentkit/agentkit-config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { MAX_DIGEST_ROWS } from "~/lib/releases/release-access";
import { DOWNLOAD_URL_TTL_MS, serveDownloadRedeem } from "~/lib/releases/release-download-url";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { action as mintAction } from "~/routes/api.v1.release-download-url";
import { envOf, publish, sql, useStateHarness } from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";
import { file, tarOf } from "./release-harness";
import { at, statusHelpers } from "./release-status-helpers";

/**
 * The owner of a package's publisher reads its private package without an
 * entitlement. Everyone else (another account, anonymous, a bad key) keeps
 * the unknown-package answer, and publisher standing, quarantine and yank
 * apply to the owner exactly as to an entitled reader.
 *
 * Fixture accounts: `user-a` owns `@alpha`, `user-b` owns `@beta`, `user-c`
 * owns nothing.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "test-token-secret-0123456789abcdef";
const PRIVATE = "@alpha/secret";
const UNKNOWN = "@alpha/nope";

let h: Harness;
let ownerKey: string;
let otherKey: string;
let strangerKey: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  otherKey = await h.createKey("user-b", null);
  strangerKey = await h.createKey("user-c", null);
});

interface CallOptions {
  key?: string;
  query?: string;
  env?: Record<string, unknown>;
}

type Loader = (args: never) => Promise<Response>;

function call(loader: Loader, path: string, params: Record<string, string>, o: CallOptions = {}, method = "GET"): Promise<Response> {
  const headers = new Headers();
  if (o.key !== undefined) headers.set("Authorization", `Bearer ${o.key}`);
  const request = new Request(`https://skillx.test${path}${o.query ?? ""}`, { method, headers });
  return loader({ request, params, context: { cloudflare: { env: envOf({ SKILLX_TOKEN_SECRET: SECRET, ...o.env }) } } } as never);
}

const split = (name: string) => name.split("/") as [string, string];
const api = {
  list: (name: string, o?: CallOptions) => {
    const [scope, slug] = split(name);
    return call(listLoader, `/api/v1/packages/${name}/releases`, { scope, slug }, o);
  },
  version: (name: string, version: string, o?: CallOptions) => {
    const [scope, slug] = split(name);
    return call(manifestLoader, `/api/v1/packages/${name}/releases/${version}`, { scope, slug, version }, o);
  },
  manifest: (digest: string, o?: CallOptions) => call(manifestLoader, `/api/v1/releases/${digest}/manifest`, { digest }, o),
  file: (digest: string, o?: CallOptions) => call(fileLoader, `/api/v1/releases/${digest}/files/SKILL.md`, { digest, "*": "SKILL.md" }, o),
  artifact: (digest: string, o?: CallOptions) => call(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }, o),
  mint: (digest: string, o?: CallOptions) => call(mintAction, `/api/v1/releases/${digest}/artifact/url`, { digest }, o, "POST"),
};

const redeem = (url: string, now = new Date()) =>
  serveDownloadRedeem(new Request(url), envOf({ SKILLX_TOKEN_SECRET: SECRET }) as never, { token: url.slice(url.lastIndexOf("/") + 1) }, () => now);

/** Every pinned read of one release: listing, by version, and the three digest endpoints. */
function everyRead(name: string, digest: string, o?: CallOptions): Promise<Response[]> {
  return Promise.all([api.list(name, o), api.version(name, "1.0.0", o), api.manifest(digest, o), api.file(digest, o), api.artifact(digest, o)]);
}

async function publishPrivate(name = PRIVATE, version = "1.0.0", key?: string): Promise<string> {
  const res = await h.upload(name, tarOf(skillTree(name)), { version, key });
  expect(res.status).toBe(200);
  sql("UPDATE packages SET visibility = 'private' WHERE name = ?", name);
  return res.body.releaseDigest as string;
}

/** One tree per name, so two packages share bytes only when a test asks for it. */
const skillTree = (name: string) => [file("SKILL.md", `---\nname: secret\ndescription: ${name}\n---\n# Secret\n`)];

const grant = (subject: string, name = PRIVATE, revokedAt: number | null = null) =>
  sql(
    `INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at)
     SELECT ?, ?, id, NULL, 'grant', 1, ? FROM packages WHERE name = ?`,
    `ent-${subject}-${name}`,
    subject,
    revokedAt,
    name,
  );

async function unknownBody(): Promise<string> {
  return (await api.list(UNKNOWN)).text();
}

async function expectAllUnknown(responses: Response[], body: string) {
  for (const res of responses) {
    expect(res.status).toBe(404);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.text()).toBe(body);
  }
}

async function expectError(res: Response | Promise<Response>, status: number, code: string) {
  const response = await res;
  expect(response.status).toBe(status);
  expect(await response.json()).toEqual({ error: { code, message: expect.any(String) } });
}

describe("private package reads: callers other than the owner stay denied", () => {
  it("answers another account, a non-owner session and anonymous exactly like an unknown package", async () => {
    const digest = await publishPrivate();
    const body = await unknownBody();
    await expectAllUnknown(await everyRead(PRIVATE, digest), body);
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: otherKey }), body);
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: strangerKey }), body);
    session.user = { id: "user-b" };
    await expectAllUnknown(await everyRead(PRIVATE, digest), body);
  });

  it("does not let an account read a private package of a publisher it does not own", async () => {
    const betaKey = await h.createKey("user-b", [releasePublishScope("beta")]);
    const digest = await publishPrivate("@beta/secret", "1.0.0", betaKey);
    const body = await unknownBody();
    // user-a owns @alpha, not @beta.
    await expectAllUnknown(await everyRead("@beta/secret", digest, { key: ownerKey }), body);
    for (const res of await everyRead("@beta/secret", digest, { key: otherKey })) expect(res.status).toBe(200);
  });

  it("never matches anonymous to a publisher whose owner is empty or missing", async () => {
    const digest = await publishPrivate();
    const body = await unknownBody();
    for (const owner of ["", null]) {
      sql("UPDATE publishers SET owner_user_id = ? WHERE handle = 'alpha'", owner);
      await expectAllUnknown(await everyRead(PRIVATE, digest), body);
      await expectAllUnknown(await everyRead(PRIVATE, digest, { key: otherKey }), body);
    }
  });

  it("answers 401 to the owner's revoked, unknown or scoped publish key and never falls back to anonymous or the session", async () => {
    const digest = await publishPrivate();
    const revoked = await h.createKey("user-a", null, true);
    session.user = { id: "user-a" };
    for (const key of [revoked, `sx_${"0".repeat(64)}`, h.alphaKey]) {
      for (const res of await everyRead(PRIVATE, digest, { key })) {
        expect(res.headers.get("WWW-Authenticate")).toBe(BEARER_CHALLENGE);
        await expectError(res, 401, "invalid_api_key");
      }
    }
  });

  it("stops serving the previous owner once the publisher changes hands", async () => {
    const digest = await publishPrivate();
    sql("UPDATE publishers SET owner_user_id = 'user-c' WHERE handle = 'alpha'");
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: ownerKey }), await unknownBody());
    for (const res of await everyRead(PRIVATE, digest, { key: strangerKey })) expect(res.status).toBe(200);
  });

  it("answers a grantee with a revoked entitlement 404 while the owner keeps access", async () => {
    const digest = await publishPrivate();
    grant("user-b", PRIVATE, 5);
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: otherKey }), await unknownBody());
    for (const res of await everyRead(PRIVATE, digest, { key: ownerKey })) expect(res.status).toBe(200);
  });

  it("spends the same queries on a private package of another owner as on an unknown one", async () => {
    const digest = await publishPrivate();
    const prepare = vi.spyOn(h.d1, "prepare");
    const queries = async (run: () => Promise<Response>) => {
      prepare.mockClear();
      expect((await run()).status).toBe(404);
      return prepare.mock.calls.length;
    };
    const unknownDigest = `sha256:${"0".repeat(64)}`;
    for (const key of [undefined, otherKey]) {
      expect(await queries(() => api.list(PRIVATE, { key }))).toBe(await queries(() => api.list(UNKNOWN, { key })));
      expect(await queries(() => api.version(PRIVATE, "1.0.0", { key }))).toBe(await queries(() => api.version(UNKNOWN, "1.0.0", { key })));
      expect(await queries(() => api.manifest(digest, { key }))).toBe(await queries(() => api.manifest(unknownDigest, { key })));
    }
    prepare.mockRestore();
  });
});

describe("private package reads: the owner", () => {
  it("lists, reads by version and by digest, and downloads files and the artifact with a private cache", async () => {
    const digest = await publishPrivate();
    for (const res of await everyRead(PRIVATE, digest, { key: ownerKey })) {
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toMatch(/^private, /);
      expect(res.headers.get("Vary")).toBe("Authorization, Cookie");
    }
    const list = await (await api.list(PRIVATE, { key: ownerKey })).json();
    expect(list).toMatchObject({ identity: PRIVATE, releases: [expect.objectContaining({ version: "1.0.0", releaseDigest: digest })] });
    session.user = { id: "user-a" };
    for (const res of await everyRead(PRIVATE, digest)) expect(res.status).toBe(200);
  });

  it.each(["suspended", "revoked"])("answers the owner of a %s publisher 403 publisher_revoked, others still 404", async (state) => {
    const digest = await publishPrivate();
    sql("UPDATE publishers SET state = ? WHERE handle = 'alpha'", state);
    for (const res of await everyRead(PRIVATE, digest, { key: ownerKey })) await expectError(res, 403, "publisher_revoked");
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: otherKey }), await unknownBody());
  });

  it("answers the owner 403 release_quarantined and 410 release_yanked like an entitled reader", async () => {
    const digest = await publishPrivate();
    sql("UPDATE package_releases SET release_state = 'yanked', yanked_at = 2");
    await expectError(api.version(PRIVATE, "1.0.0", { key: ownerKey }), 410, "release_yanked");
    const byDigest = await api.manifest(digest, { key: ownerKey });
    expect(byDigest.status).toBe(200);
    expect(byDigest.headers.get("X-SkillX-Release-State")).toBe("yanked");
    sql("UPDATE package_releases SET release_state = 'quarantined', quarantined_at = 3");
    await expectError(api.version(PRIVATE, "1.0.0", { key: ownerKey }), 403, "release_quarantined");
    await expectError(api.manifest(digest, { key: ownerKey }), 403, "release_quarantined");
    await expectError(api.file(digest, { key: ownerKey }), 403, "release_quarantined");
    await expectError(api.artifact(digest, { key: ownerKey }), 403, "release_quarantined");
    // The listing hides the quarantined release; others still see an unknown package.
    expect((await (await api.list(PRIVATE, { key: ownerKey })).json()).releases).toEqual([]);
    await expectAllUnknown(await everyRead(PRIVATE, digest, { key: otherKey }), await unknownBody());
  });

  it("gets the signed status of its own private release; others get 404", async () => {
    await publishPrivate();
    const status = statusHelpers(h);
    const own = await status.status(at(1), { name: PRIVATE, userId: "user-a" });
    expect(own.res.status).toBe(200);
    expect(own.res.headers.get("Cache-Control")).toMatch(/^private, /);
    for (const userId of [null, "user-b", ""]) {
      await expect(status.status(at(1), { name: PRIVATE, userId })).rejects.toMatchObject({ status: 404, code: "not_found" });
    }
  });
});

describe("private package reads: one tree in a public and a private package", () => {
  it("serves the private package only to its owner, also through the package selector", async () => {
    const digest = await publish("@alpha/open", "1.0.0", skillTree(PRIVATE));
    expect(await publishPrivate()).toBe(digest);
    const selected = { query: `?package=${encodeURIComponent(PRIVATE)}&version=1.0.0` };
    const body = await (await api.manifest(`sha256:${"0".repeat(64)}`)).text();
    for (const key of [undefined, otherKey, strangerKey]) {
      const responses = [await api.manifest(digest, { ...selected, key }), await api.file(digest, { ...selected, key }), await api.artifact(digest, { ...selected, key })];
      await expectAllUnknown(responses, body);
      // Without a selector the public copy answers.
      expect((await api.manifest(digest, { key })).headers.get("X-SkillX-Identity")).toBe("@alpha/open");
    }
    const own = await api.manifest(digest, { ...selected, key: ownerKey });
    expect(own.status).toBe(200);
    expect(own.headers.get("X-SkillX-Identity")).toBe(PRIVATE);
  });

  it(`serves the owner's active private row beyond the ${MAX_DIGEST_ROWS}-row bound when every public row has a suspended publisher`, async () => {
    const betaKey = await h.createKey("user-b", [releasePublishScope("beta")]);
    const tree = skillTree("@beta/secret");
    const digest = await publish("@alpha/crowd", "1.0.0", tree);
    for (let minor = 1; minor <= MAX_DIGEST_ROWS + 1; minor++) await publish("@alpha/crowd", `1.${minor}.0`, tree);
    expect(await publishPrivate("@beta/secret", "1.0.0", betaKey)).toBe(digest);
    // Every public row now belongs to the suspended publisher; user-b owns the active private row.
    sql("UPDATE packages SET publisher_id = 'pub-gone' WHERE name = '@alpha/crowd'");
    const own = await api.manifest(digest, { key: otherKey });
    expect(own.status).toBe(200);
    expect(own.headers.get("X-SkillX-Identity")).toBe("@beta/secret");
    // A non-owner cannot read the private row, so only suspended publishers remain.
    await expectError(api.manifest(digest, { key: strangerKey }), 403, "publisher_revoked");
  }, 30_000);
});

describe("private package reads: signed download URLs", () => {
  it("mints only for the owner and streams the artifact no-store", async () => {
    const digest = await publishPrivate();
    for (const key of [undefined, otherKey, strangerKey]) expect((await api.mint(digest, { key })).status).toBe(404);
    const minted = await api.mint(digest, { key: ownerKey });
    expect(minted.status).toBe(200);
    const { url } = (await minted.json()) as { url: string };
    const res = await redeem(url);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(new Uint8Array(await (await api.artifact(digest, { key: ownerKey })).arrayBuffer()));
    expect((await redeem(url, new Date(Date.now() + DOWNLOAD_URL_TTL_MS + 1000))).status).toBe(404);
  });

  it("re-checks the owner on redemption: suspension, quarantine and a change of owner stop an issued URL", async () => {
    const digest = await publishPrivate();
    const mintUrl = async () => ((await (await api.mint(digest, { key: ownerKey })).json()) as { url: string }).url;

    const suspended = await mintUrl();
    sql("UPDATE publishers SET state = 'suspended' WHERE handle = 'alpha'");
    await expectError(redeem(suspended), 403, "publisher_revoked");
    sql("UPDATE publishers SET state = 'active' WHERE handle = 'alpha'");

    const transferred = await mintUrl();
    sql("UPDATE publishers SET owner_user_id = 'user-c' WHERE handle = 'alpha'");
    await expectError(redeem(transferred), 404, "not_found");
    sql("UPDATE publishers SET owner_user_id = 'user-a' WHERE handle = 'alpha'");

    const quarantinedUrl = await mintUrl();
    sql("UPDATE package_releases SET release_state = 'quarantined', quarantined_at = 5");
    await expectError(redeem(quarantinedUrl), 403, "release_quarantined");
  });

  it("stops a grantee's issued URL once the entitlement is revoked", async () => {
    const digest = await publishPrivate();
    grant("user-b");
    const { url } = (await (await api.mint(digest, { key: otherKey })).json()) as { url: string };
    expect((await redeem(url)).status).toBe(200);
    sql("UPDATE entitlements SET revoked_at = 9 WHERE subject_id = 'user-b'");
    await expectError(redeem(url), 404, "not_found");
  });
});
