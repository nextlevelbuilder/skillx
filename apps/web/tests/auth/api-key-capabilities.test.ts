import { beforeEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_READ_SCOPE, kitsWriteScope, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { serveDownloadRedeem } from "~/lib/releases/release-download-url";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { action as mintAction } from "~/routes/api.v1.release-download-url";
import { action as stateAction } from "~/routes/api.v1.release-state";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { file, tarOf } from "../releases/release-harness";
import { BODY, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";

/**
 * Capability matrix of scoped API keys for private library sync:
 * `library:read` reads what the owner's session reads; `kits:write:@h`
 * reads and writes the owner's kits under `@h` only; neither publishes,
 * changes release state or outgrows the owner account. Revoked keys and keys
 * holding no accepted scope stay `401 invalid_api_key` with no session
 * fallback; a key scoped to another handle is `403 auth.scope_missing`
 * before any lookup.
 *
 * Fixture accounts: `user-a` owns `@alpha`, `user-b` owns `@beta`.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "test-token-secret-0123456789abcdef";
const PRIVATE = "@alpha/secret";
const BETA_PRIVATE = "@beta/hidden";
const SECRET_TREE = { "SKILL.md": skillText(BODY, "name: secret\ndescription: Secret") };

let k: KitHarness;
let digest: string;
let readKey: string;
let kitKey: string;
let syncKey: string;
let otherReadKey: string;

const key = (userId: string, scopes: string[] | null, revoked = false) => k.h.createKey(userId, scopes, revoked);

beforeEach(async () => {
  k = await createKitHarness();
  session.user = null;
  digest = await k.publish(PRIVATE, "1.0.0", SECRET_TREE);
  await k.publish(BETA_PRIVATE, "1.0.0", { "SKILL.md": skillText(BODY, "name: hidden\ndescription: Hidden") });
  k.sql("UPDATE packages SET visibility = 'private' WHERE name IN (?, ?)", PRIVATE, BETA_PRIVATE);
  readKey = await key("user-a", [LIBRARY_READ_SCOPE]);
  kitKey = await key("user-a", [kitsWriteScope("alpha")]);
  syncKey = await key("user-a", [LIBRARY_READ_SCOPE, kitsWriteScope("alpha"), releasePublishScope("alpha")]);
  otherReadKey = await key("user-b", [LIBRARY_READ_SCOPE]);
});

const env = () => ({
  SKILLX_RELEASES_API: "1",
  SKILLX_PERSONAL_KITS_API: "1",
  SKILLX_TOKEN_SECRET: SECRET,
  DB: k.h.deps.db,
  R2: k.h.deps.bucket,
  ADMIN_SECRET: "test-admin-secret-0123456789",
  RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
  RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
});

type Loader = (args: never) => Promise<Response>;

function call(loader: Loader, path: string, params: Record<string, string>, bearer?: string, method = "GET", body?: unknown): Promise<Response> {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (bearer !== undefined) headers.set("Authorization", `Bearer ${bearer}`);
  const request = new Request(`https://skillx.test${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  return loader({ request, params, context: { cloudflare: { env: env() } } } as never);
}

const split = (name: string) => name.split("/") as [string, string];

/** Every pinned read of one release: listing, by version, and the three digest endpoints. */
function everyRead(name: string, bearer?: string): Promise<Response[]> {
  const [scope, slug] = split(name);
  return Promise.all([
    call(listLoader, `/api/v1/packages/${name}/releases`, { scope, slug }, bearer),
    call(manifestLoader, `/api/v1/packages/${name}/releases/1.0.0`, { scope, slug, version: "1.0.0" }, bearer),
    call(manifestLoader, `/api/v1/releases/${digest}/manifest?package=${encodeURIComponent(name)}`, { digest }, bearer),
    call(fileLoader, `/api/v1/releases/${digest}/files/SKILL.md?package=${encodeURIComponent(name)}`, { digest, "*": "SKILL.md" }, bearer),
    call(artifactLoader, `/api/v1/releases/${digest}/artifact?package=${encodeURIComponent(name)}`, { digest }, bearer),
  ]);
}

const mint = (bearer?: string) => call(mintAction, `/api/v1/releases/${digest}/artifact/url?package=${encodeURIComponent(PRIVATE)}`, { digest }, bearer, "POST");
const redeem = (url: string) =>
  serveDownloadRedeem(new Request(url), env() as never, { token: url.slice(url.lastIndexOf("/") + 1) });
const mintedUrl = async (bearer?: string) => {
  const res = await mint(bearer);
  expect(res.status).toBe(200);
  return ((await res.json()) as { url: string }).url;
};

const yank = (bearer: string) =>
  call(stateAction, `/api/v1/packages/${PRIVATE}/releases/1.0.0/state`, { scope: "@alpha", slug: "secret", version: "1.0.0" }, bearer, "POST", { from: "published", to: "yanked" });

async function expectError(res: Response | { status: number; body: Record<string, unknown> }, status: number, code: string) {
  const body = res instanceof Response ? await res.json() : res.body;
  expect(res.status).toBe(status);
  expect(body).toEqual({ error: { code, message: expect.any(String) } });
}

async function expectAll(responses: Response[], status: number, code: string) {
  for (const res of responses) {
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    if (status === 401) expect(res.headers.get("WWW-Authenticate")).toBe("Bearer");
    await expectError(res, status, code);
  }
}

/** A private kit `@alpha/my-kit` over the private skill, stored by the owner's account key. */
async function storeKit(bearer = k.ownerKey, generation = 0) {
  // One document per generation, so a later store is a new revision, not kit.revision_exists.
  const text = skillText(BODY.replace("two\n", `two (mine, g${generation})\n`), "name: secret\ndescription: Secret");
  const document = k.doc([await k.entry(PRIVATE, "1.0.0", { "SKILL.md": text })]);
  return k.call("revisions", { expectedGeneration: generation, idempotencyKey: k.idem(), document }, { key: bearer });
}

describe("library:read", () => {
  it("reads the owner's private releases like the owner's session, with a private cache", async () => {
    for (const bearer of [readKey, syncKey]) {
      for (const res of await everyRead(PRIVATE, bearer)) {
        expect(res.status).toBe(200);
        expect(res.headers.get("Cache-Control")).toMatch(/^private, /);
        expect(res.headers.get("Vary")).toBe("Authorization, Cookie");
      }
    }
  });

  it("reads nothing private of another account: the same 404 as an unknown package", async () => {
    const unknown = await (await call(listLoader, "/api/v1/packages/@alpha/nope/releases", { scope: "@alpha", slug: "nope" }, otherReadKey)).text();
    for (const res of await everyRead(PRIVATE, otherReadKey)) {
      expect(res.status).toBe(404);
      expect(await res.text()).toBe(unknown);
    }
    for (const res of await everyRead(BETA_PRIVATE, readKey)) expect(res.status).toBe(404);
    // Its own account's private package stays readable to it.
    expect((await everyRead(BETA_PRIVATE, otherReadKey))[0]!.status).toBe(200);
  });

  it("reads the owner's kit and lock, and nobody else's", async () => {
    const stored = await storeKit();
    expect(stored.status).toBe(201);
    const rev = stored.body.revision as { id: string; digest: string };
    expect((await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } })).status).toBe(200);
    expect((await k.call("", undefined, { key: readKey })).status).toBe(200);
    expect((await k.call(`revisions/${rev.id}`, undefined, { key: readKey })).status).toBe(200);
    expect((await k.call("lock", undefined, { key: readKey })).status).toBe(200);
    const unknown = await k.call("", undefined, { key: otherReadKey, kit: "@alpha/nope" });
    const foreign = await k.call("", undefined, { key: otherReadKey });
    expect(foreign.status).toBe(404);
    expect(foreign.body).toEqual(unknown.body);
  });

  it("never writes: kit writes and state changes are 401, publishing is 403 auth.scope_missing", async () => {
    await expectError(await storeKit(readKey), 401, "invalid_api_key");
    expect(k.count("personal_kit_revisions")).toBe(0);
    await expectError(await yank(readKey), 401, "invalid_api_key");
    const upload = await k.h.upload("@alpha/new", tarOf([file("SKILL.md", skillText(BODY))]), { key: readKey });
    expect(upload).toMatchObject({ status: 403, body: { error: { code: "auth.scope_missing" } } });
  });

  it("mints a signed URL that dies with the key; a session-minted URL is unaffected", async () => {
    const url = await mintedUrl(readKey);
    expect((await redeem(url)).status).toBe(200);
    k.sql("UPDATE api_keys SET revoked_at = 9 WHERE key_prefix = ?", readKey.slice(0, 8));
    await expectError(await redeem(url), 404, "not_found");

    const accountUrl = await mintedUrl(k.ownerKey);
    k.sql("UPDATE api_keys SET revoked_at = 9 WHERE key_prefix = ?", k.ownerKey.slice(0, 8));
    await expectError(await redeem(accountUrl), 404, "not_found");

    session.user = { id: "user-a" };
    const sessionUrl = await mintedUrl();
    session.user = null;
    expect((await redeem(sessionUrl)).status).toBe(200);
  });
});

describe("kits:write:@handle", () => {
  it("stores, activates, locks and reads kits under its handle, through a private base of the owner", async () => {
    const stored = await storeKit(kitKey);
    expect(stored.status).toBe(201);
    const rev = stored.body.revision as { id: string; digest: string };
    const activated = await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } }, { key: kitKey });
    expect(activated.status).toBe(200);
    expect((await k.call("lock", undefined, { key: kitKey })).status).toBe(200);
    expect((await k.call("", undefined, { key: kitKey })).status).toBe(200);
    expect((await k.call(`revisions/${rev.id}`, undefined, { key: kitKey })).status).toBe(200);
    // Library sync on one key: the same flow with the combined key.
    expect((await storeKit(syncKey, 2)).status).toBe(201);
  });

  it("is 403 auth.scope_missing for a kit of another handle, before any lookup", async () => {
    expect((await storeKit()).status).toBe(201);
    const agentkitKey = await key("user-a", [kitsWriteScope("agentkit")]);
    const existing = await k.call("", undefined, { key: agentkitKey });
    const unknown = await k.call("", undefined, { key: agentkitKey, kit: "@alpha/nope" });
    await expectError(existing, 403, "auth.scope_missing");
    expect(existing.body).toEqual(unknown.body);
    await expectError(await storeKit(agentkitKey, 1), 403, "auth.scope_missing");
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("never outgrows the owner: a scope naming a publisher the owner does not hold writes nothing", async () => {
    // Settings refuses to mint this key (see user-api-keys-route.test.ts); stored directly it still grants nothing.
    const betaScoped = await key("user-a", [kitsWriteScope("beta")]);
    const document = { ...k.doc([]), kit: "@beta/x", localId: "local/x" };
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document }, { key: betaScoped, kit: "@beta/x" });
    await expectError(res, 403, "kit.publisher_not_owned");
    expect(k.count("personal_kits")).toBe(0);
  });

  it("sees an owned parent kit under another handle as a digest reference unless a scope covers that handle", async () => {
    // `@bestagentkits` is another publisher of user-a, so the parent kit is owned but outside `kits:write:@alpha`.
    const parentDoc = { ...k.doc([await k.entry(PRIVATE, "1.0.0", SECRET_TREE)]), kit: "@bestagentkits/base", localId: "local/base" };
    const parent = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: parentDoc }, { kit: "@bestagentkits/base" });
    expect(parent.status).toBe(201);
    const parentDigest = parent.body.revision.digest as string;
    const child = k.doc([], { parent: { kit: "@bestagentkits/base", revisionDigest: parentDigest } });
    const stored = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: child }, { key: kitKey });
    expect(stored.status).toBe(201);
    const rev = stored.body.revision as { id: string; digest: string };
    expect((await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } }, { key: kitKey })).status).toBe(200);

    const narrow = await k.call("lock", undefined, { key: kitKey });
    expect(narrow.status).toBe(200);
    expect(narrow.body.documents).toHaveLength(2);
    expect(narrow.body.documents[0]).toMatchObject({ kit: "@alpha/my-kit" });
    expect(narrow.body.documents[1]).toEqual({ kit: "@bestagentkits/base", revisionDigest: parentDigest, foreign: true });
    expect(JSON.stringify(narrow.body.documents)).not.toContain("local/base");

    // The owner's session, an account key, library:read and a kits:write scope for the parent's handle see the document.
    const bothHandles = await key("user-a", [kitsWriteScope("alpha"), kitsWriteScope("bestagentkits")]);
    session.user = { id: "user-a" };
    const sessionLock = await k.call("lock", undefined, { key: null });
    session.user = null;
    for (const lock of [sessionLock, ...(await Promise.all([k.ownerKey, readKey, syncKey, bothHandles].map((bearer) => k.call("lock", undefined, { key: bearer }))))]) {
      expect(lock.status).toBe(200);
      expect(lock.body.documents[1]).toMatchObject({ kit: "@bestagentkits/base", localId: "local/base", skills: [expect.objectContaining({ identity: PRIVATE })] });
      expect(lock.body.lock).toEqual(narrow.body.lock);
    }
  });

  it("cannot review a proposal or activate a public revision: both need a web session", async () => {
    const stored = await storeKit(kitKey);
    expect(stored.status).toBe(201);
    const from = stored.body.revision as { id: string; digest: string };
    const e = await k.entry(PRIVATE, "1.0.0", { "SKILL.md": skillText(BODY.replace("three\n", "three (learned)\n"), "name: secret\ndescription: Secret") });
    const proposal = { schema: "skillx.kit-proposal/v1", fromRevisionId: from.id, skill: { identity: e.identity, base: e.base, overlay: e.overlay, compositionDigest: e.compositionDigest }, declaredPermissions: [], visibility: "private" };
    const proposed = await k.call("proposals", { expectedGeneration: 1, idempotencyKey: k.idem(), proposal }, { key: kitKey });
    expect(proposed.status).toBe(201);
    const prop = proposed.body.revision as { id: string; digest: string };
    const review = await k.call(
      `revisions/${prop.id}/review`,
      { expectedGeneration: 2, decision: "approve", approval: { revisionDigest: prop.digest, permissions: [], visibility: "private", consent: true } },
      { key: kitKey },
    );
    expect(review.status).toBe(403);
    expect(review.body.error.code).toBe("kit.interactive_approval_required");
    expect((k.h.d1.raw.prepare("SELECT state FROM personal_kit_revisions WHERE id = ?").get(prop.id) as { state: string }).state).toBe("proposed");

    await k.publish("@alpha/open", "1.0.0", { "SKILL.md": skillText(BODY, "name: open\ndescription: Open") });
    const publicDoc = k.doc([await k.entry("@alpha/open", "1.0.0", { "SKILL.md": skillText(BODY.replace("two\n", "two (public)\n"), "name: open\ndescription: Open") })], { visibility: "public" });
    const pub = await k.call("revisions", { expectedGeneration: 2, idempotencyKey: k.idem(), document: publicDoc }, { key: kitKey });
    expect(pub.status).toBe(201);
    const pubRev = pub.body.revision as { id: string; digest: string };
    const activate = await k.call("activate", { expectedGeneration: 3, revisionId: pubRev.id, approval: { revisionDigest: pubRev.digest } }, { key: kitKey });
    expect(activate.status).toBe(403);
    expect(activate.body.error.code).toBe("kit.interactive_approval_required");
    expect((k.h.d1.raw.prepare("SELECT effective_revision_id AS e, visibility AS v FROM personal_kits WHERE name = ?").get("@alpha/my-kit") as { e: string | null; v: string })).toEqual({ e: null, v: "private" });
  });

  it("does not read releases, publish, change release state or reach operator routes", async () => {
    await expectAll(await everyRead(PRIVATE, kitKey), 401, "invalid_api_key");
    const upload = await k.h.upload("@alpha/new", tarOf([file("SKILL.md", skillText(BODY))]), { key: kitKey });
    expect(upload).toMatchObject({ status: 403, body: { error: { code: "auth.scope_missing" } } });
    await expectError(await yank(kitKey), 401, "invalid_api_key");
    const stored = await storeKit();
    const quarantine = await k.call(`revisions/${stored.body.revision.id}/quarantine`, { reason: "x" }, { key: kitKey });
    await expectError(quarantine, 401, "invalid_api_key");
  });
});

describe("refused credentials", () => {
  it("keeps a publish-only key off reads and kits (401), as before", async () => {
    await expectAll(await everyRead(PRIVATE, k.h.alphaKey), 401, "invalid_api_key");
    await expectError(await k.call("", undefined, { key: k.h.alphaKey }), 401, "invalid_api_key");
    await expectError(await storeKit(k.h.alphaKey), 401, "invalid_api_key");
  });

  it("answers revoked keys and unknown or malformed stored scopes 401 with no session fallback", async () => {
    expect((await storeKit()).status).toBe(201);
    const revokedRead = await key("user-a", [LIBRARY_READ_SCOPE], true);
    const revokedKit = await key("user-a", [kitsWriteScope("alpha")], true);
    const unknownScope = await key("user-a", ["admin:*"]);
    const lookalike = await key("user-a", ["library:read:@alpha", "kits:write:@Alpha"]);
    const malformed = await key("user-a", [LIBRARY_READ_SCOPE]);
    k.sql("UPDATE api_keys SET scopes = 'not json' WHERE key_prefix = ?", malformed.slice(0, 8));
    session.user = { id: "user-a" };
    for (const bearer of [revokedRead, revokedKit, unknownScope, lookalike, malformed]) {
      await expectAll(await everyRead(PRIVATE, bearer), 401, "invalid_api_key");
      await expectError(await k.call("", undefined, { key: bearer }), 401, "invalid_api_key");
      await expectError(await storeKit(bearer, 1), 401, "invalid_api_key");
      await expectError(await mint(bearer), 401, "invalid_api_key");
    }
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("records the last use of a scoped key only when a route accepts it", async () => {
    const lastUsed = (bearer: string) =>
      (k.h.d1.raw.prepare("SELECT last_used_at AS at FROM api_keys WHERE key_prefix = ?").get(bearer.slice(0, 8)) as { at: number | null }).at;
    const publishOnly = await key("user-a", [releasePublishScope("alpha")]);
    await expectError(await k.call("", undefined, { key: publishOnly }), 401, "invalid_api_key");
    await expectAll(await everyRead(PRIVATE, publishOnly), 401, "invalid_api_key");
    expect(lastUsed(publishOnly)).toBeNull();
    // A kit key is refused by the release read API, then accepted by the kit API.
    await expectAll(await everyRead(PRIVATE, kitKey), 401, "invalid_api_key");
    expect(lastUsed(kitKey)).toBeNull();
    expect((await k.call("", undefined, { key: kitKey })).status).toBe(404);
    expect(lastUsed(kitKey)).toEqual(expect.any(Number));
  });

  it("revokes keys independently: device B's revocation leaves device A working", async () => {
    const deviceB = await key("user-a", [LIBRARY_READ_SCOPE, kitsWriteScope("alpha")]);
    expect((await storeKit(deviceB)).status).toBe(201);
    k.sql("UPDATE api_keys SET revoked_at = 9 WHERE key_prefix = ?", deviceB.slice(0, 8));
    await expectError(await k.call("", undefined, { key: deviceB }), 401, "invalid_api_key");
    expect((await k.call("", undefined, { key: syncKey })).status).toBe(200);
    expect((await storeKit(syncKey, 1)).status).toBe(201);
    for (const res of await everyRead(PRIVATE, syncKey)) expect(res.status).toBe(200);
  });
});
