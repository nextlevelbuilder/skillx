import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { LIBRARY_READ_SCOPE, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { serveDownloadRedeem } from "~/lib/releases/release-download-url";
import { callTool } from "~/lib/mcp/tools";
import { handleSkillMarkdown } from "~/lib/markdown/skill-markdown-handler";
import { action as mintAction } from "~/routes/api.v1.release-download-url";
import { action as collectionAction, loader as collectionLoader } from "~/routes/api.v1.collections";
import { loader as apiSkillDetail } from "~/routes/api.skill-detail";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as leaderboardLoader } from "~/routes/api.leaderboard";
import { loader as libraryLoader } from "~/routes/api.v1.library";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as llmsFullLoader } from "~/routes/llms-full-txt";
import { loader as llmsLoader } from "~/routes/llms-txt";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as pageLoader } from "~/routes/skill-detail";
import { loader as statusLoader } from "~/routes/api.v1.release-status";
import { executeSearch } from "~/lib/search/search-executor";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { BODY, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";
import { NOW, TEST_KEY_ID } from "./release-harness";
import { statusHelpers } from "./release-status-helpers";

/**
 * Leak matrix of a private package. The package is known by slug and digest,
 * yet an anonymous caller, an unrelated account, and an unrelated account's
 * scoped key each get the answer of a package that never existed, on every
 * surface that could name, list, serve or describe a package. The owner and an
 * entitled account keep reading it, and no log line carries its name.
 *
 * Fixture accounts: `user-a` owns `@alpha` and the private package,
 * `user-b` owns `@beta` (unrelated), `user-c` owns nothing (unrelated),
 * `user-d` holds an entitlement.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const TOKEN_SECRET = "test-token-secret-0123456789abcdef";
const SLUG = "canarywidget";
const PRIVATE = `@alpha/${SLUG}`;
const UNKNOWN = "@alpha/nosuchthing";
const UNKNOWN_DIGEST = `sha256:${"e".repeat(64)}`;
const PUBLIC_SLUG = "publicgadget";

let k: KitHarness;
let digest: string;
let keys: { owner: string; entitled: string; other: string; otherScoped: string; stranger: string };
let logs: string[];

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  keys = {
    owner: k.ownerKey,
    entitled: await k.h.createKey("user-d", null),
    other: k.otherKey,
    otherScoped: await k.h.createKey("user-b", [releasePublishScope("beta"), LIBRARY_READ_SCOPE]),
    stranger: await k.h.createKey("user-c", null),
  };
  digest = await k.publish(PRIVATE, "1.0.0", { "SKILL.md": skillText(BODY, `name: ${SLUG}\ndescription: ${SLUG} private notes`) });
  k.sql("UPDATE packages SET visibility = 'private' WHERE name = ?", PRIVATE);
  k.sql(
    `INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at)
     SELECT 'ent-d', 'user-d', id, NULL, 'grant', 1, NULL FROM packages WHERE name = ?`,
    PRIVATE,
  );
  // A public listing proves the catalog surfaces work and are not just empty.
  const stamp = Date.now();
  k.sql(
    "INSERT INTO skills (id, name, slug, description, content, author, category, created_at, updated_at) VALUES ('s-pub', ?, ?, 'A public gadget', 'gadget body', 'someone', 'dev', ?, ?)",
    PUBLIC_SLUG,
    PUBLIC_SLUG,
    stamp,
    stamp,
  );
  logs = [];
  for (const level of ["log", "info", "warn", "error", "debug"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.message}\n${a.stack ?? ""}` : typeof a === "string" ? a : JSON.stringify(a))).join(" "));
    });
  }
});

afterEach(() => {
  vi.restoreAllMocks();
});

/** A KV that never hits, so every catalog render reads the database. */
const kv = { get: async () => null, put: async () => undefined };

const env = (extra: Record<string, unknown> = {}) => ({
  SKILLX_RELEASES_API: "1",
  SKILLX_PERSONAL_KITS_API: "1",
  SKILLX_COLLECTIONS_API: "1",
  DB: k.h.deps.db,
  R2: k.h.deps.bucket,
  KV: kv,
  RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
  RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
  SKILLX_REGISTRY_SIGNING_KEY_ID: TEST_KEY_ID,
  SKILLX_TOKEN_SECRET: TOKEN_SECRET,
  ...extra,
});

/** Who is asking. `session` goes through the web session mock, `key` through a bearer key. */
interface Viewer {
  label: string;
  key?: string;
  sessionUser?: string;
}
const viewers = (): Record<"anonymous" | "unrelatedKey" | "unrelatedSession" | "unrelatedScoped" | "stranger" | "owner" | "entitled", Viewer> => ({
  anonymous: { label: "anonymous" },
  unrelatedKey: { label: "unrelated user key", key: keys.other },
  unrelatedSession: { label: "unrelated user session", sessionUser: "user-b" },
  unrelatedScoped: { label: "unrelated user scoped key", key: keys.otherScoped },
  stranger: { label: "account owning nothing", key: keys.stranger },
  owner: { label: "owner", key: keys.owner },
  entitled: { label: "entitled user", key: keys.entitled },
});
const DENIED = ["anonymous", "unrelatedKey", "unrelatedSession", "unrelatedScoped", "stranger"] as const;
const ALLOWED = ["owner", "entitled"] as const;

function request(path: string, viewer: Viewer, init: RequestInit = {}): Request {
  const headers = new Headers(init.headers);
  if (viewer.key !== undefined) headers.set("Authorization", `Bearer ${viewer.key}`);
  session.user = viewer.sessionUser === undefined ? null : { id: viewer.sessionUser };
  return new Request(`https://skillx.test${path}`, { ...init, headers });
}

type Loader = (args: never) => Promise<Response>;
const route = (loader: Loader, path: string, params: Record<string, string>, viewer: Viewer, init?: RequestInit) =>
  loader({ request: request(path, viewer, init), params, context: { cloudflare: { env: env() } } } as never);

const split = (name: string) => name.split("/") as [string, string];

interface Surface {
  name: string;
  /** The same call against `target`: the private package, or an unknown one. */
  call: (target: { name: string; digest: string }, viewer: Viewer) => Promise<Response>;
}

const releaseSurfaces: Surface[] = [
  {
    name: "release list",
    call: (t, v) => route(listLoader, `/api/v1/packages/${t.name}/releases`, { scope: split(t.name)[0], slug: split(t.name)[1] }, v),
  },
  {
    name: "manifest by version",
    call: (t, v) => route(manifestLoader, `/api/v1/packages/${t.name}/releases/1.0.0`, { scope: split(t.name)[0], slug: split(t.name)[1], version: "1.0.0" }, v),
  },
  { name: "manifest by digest", call: (t, v) => route(manifestLoader, `/api/v1/releases/${t.digest}/manifest`, { digest: t.digest }, v) },
  { name: "file", call: (t, v) => route(fileLoader, `/api/v1/releases/${t.digest}/files/SKILL.md`, { digest: t.digest, "*": "SKILL.md" }, v) },
  { name: "artifact", call: (t, v) => route(artifactLoader, `/api/v1/releases/${t.digest}/artifact`, { digest: t.digest }, v) },
  {
    name: "artifact selected by package and version",
    call: (t, v) => route(artifactLoader, `/api/v1/releases/${t.digest}/artifact?package=${t.name}&version=1.0.0`, { digest: t.digest }, v),
  },
  { name: "download URL mint", call: (t, v) => route(mintAction, `/api/v1/releases/${t.digest}/artifact/url`, { digest: t.digest }, v, { method: "POST" }) },
  {
    name: "status",
    call: (t, v) => route(statusLoader, `/api/v1/packages/${t.name}/releases/1.0.0/status`, { scope: split(t.name)[0], slug: split(t.name)[1], version: "1.0.0" }, v),
  },
];

const privateTarget = () => ({ name: PRIVATE, digest });
const unknownTarget = () => ({ name: UNKNOWN, digest: UNKNOWN_DIGEST });

/** The exact answer a caller gets for something that does not exist: status, body, and cache policy. */
async function fingerprint(res: Response) {
  return { status: res.status, cache: res.headers.get("Cache-Control"), type: res.headers.get("Content-Type"), body: await res.text() };
}

describe("release API: a private package answers like an unknown one", () => {
  it.each(releaseSurfaces)("$name", async ({ call }) => {
    for (const who of DENIED) {
      const viewer = viewers()[who];
      const unknown = await fingerprint(await call(unknownTarget(), viewer));
      const priv = await fingerprint(await call(privateTarget(), viewer));
      expect(unknown.status, `${viewer.label}: unknown package`).toBe(404);
      expect(priv, viewer.label).toEqual(unknown);
      expect(priv.body).not.toContain(SLUG);
      expect(priv.body).not.toContain(digest);
    }
  });

  it("answers a mint URL a denied caller never receives, and nothing redeems", async () => {
    // A denied caller cannot obtain a token; a forged one is an unknown release too.
    const forged = await serveDownloadRedeem(request("/api/v1/downloads/forged.token", viewers().anonymous), env() as never, { token: "forged.token" });
    const unknown = await fingerprint(await route(mintAction, `/api/v1/releases/${UNKNOWN_DIGEST}/artifact/url`, { digest: UNKNOWN_DIGEST }, viewers().anonymous, { method: "POST" }));
    expect(await fingerprint(forged)).toEqual(unknown);
  });

  it("stops a URL minted by the owner as soon as ownership moves away", async () => {
    const mint = await route(mintAction, `/api/v1/releases/${digest}/artifact/url`, { digest }, viewers().owner, { method: "POST" });
    expect(mint.status).toBe(200);
    expect(mint.headers.get("Cache-Control")).toBe("no-store");
    const { url } = (await mint.json()) as { url: string };
    const token = url.slice(url.lastIndexOf("/") + 1);
    const redeem = () => serveDownloadRedeem(new Request(url), env() as never, { token });
    expect((await redeem()).status).toBe(200);
    k.sql("UPDATE publishers SET owner_user_id = 'user-c' WHERE handle = 'alpha'");
    const after = await fingerprint(await redeem());
    const unknown = await fingerprint(await route(artifactLoader, `/api/v1/releases/${UNKNOWN_DIGEST}/artifact`, { digest: UNKNOWN_DIGEST }, viewers().anonymous));
    expect(after).toEqual({ ...unknown, cache: after.cache });
  });

  it.each(ALLOWED)("still serves the %s every surface, uncacheable", async (who) => {
    const viewer = viewers()[who];
    for (const surface of releaseSurfaces) {
      if (surface.name === "status") continue; // needs the registry signer; covered below
      const res = await surface.call(privateTarget(), viewer);
      expect(res.status, `${who}: ${surface.name}`).toBe(200);
      expect(res.headers.get("Cache-Control"), `${who}: ${surface.name}`).toBe(surface.name === "download URL mint" ? "no-store" : "private, no-store");
      await res.arrayBuffer();
    }
  });

  it("serves the signed status of a private release to its owner and entitled user", async () => {
    const status = statusHelpers(k.h);
    for (const [who, userId] of [["owner", "user-a"], ["entitled", "user-d"]] as const) {
      const { res, doc } = await status.status(NOW, { name: PRIVATE, userId });
      expect(res.status, who).toBe(200);
      expect(res.headers.get("Cache-Control"), who).toBe("private, no-store");
      expect(doc.state).toBe("published");
    }
  });


  it("marks the private file and artifact responses private, no-store, and the public ones cacheable", async () => {
    const publicDigest = await k.publish("@alpha/openthing", "1.0.0", { "SKILL.md": skillText(BODY, "name: openthing\ndescription: open") });
    const priv = await route(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }, viewers().owner);
    const open = await route(artifactLoader, `/api/v1/releases/${publicDigest}/artifact`, { digest: publicDigest }, viewers().anonymous);
    expect(priv.headers.get("Cache-Control")).toBe("private, no-store");
    expect(open.headers.get("Cache-Control")).toMatch(/^public, /);
  });
});

describe("MCP tools", () => {
  const ctx = (userId: string | null) => ({ env: env() as unknown as Env, userId });
  const text = (result: { content: Array<{ text: string }> }) => result.content[0].text;
  const renamed = (value: string, from: string, to: string) => value.split(from).join(to);

  const calls: Array<{ tool: string; args: (name: string) => Record<string, unknown> }> = [
    { tool: "get_release", args: (name) => ({ package: name }) },
    { tool: "get_release", args: (name) => ({ package: name, version: "1.0.0" }) },
    { tool: "get_package", args: (name) => ({ slug: name }) },
    { tool: "get_package", args: (name) => ({ slug: name.split("/")[1] }) },
    { tool: "check_compatibility", args: (name) => ({ slug: name.split("/")[1], target: "claude-code" }) },
    { tool: "search_packages", args: (name) => ({ query: name.split("/")[1] }) },
    { tool: "prepare_install", args: (name) => ({ package: name, version: "1.0.0" }) },
    { tool: "prepare_install", args: (name) => ({ package: name, version: "1.0.0", host: "installer" }) },
  ];

  it.each(calls)("$tool names no private package, whoever asks", async ({ tool, args }) => {
    for (const userId of [null, "user-b", "user-c", "user-a", "user-d"]) {
      const priv = await callTool(tool, args(PRIVATE), ctx(userId));
      const unknown = await callTool(tool, args(UNKNOWN), ctx(userId));
      // The tool echoes the name the caller sent; apart from that echo the answers are identical.
      expect(renamed(text(priv), SLUG, "nosuchthing"), `${tool} as ${userId}`).toBe(text(unknown));
      expect(priv.isError).toBe(unknown.isError);
    }
  });

  it("get_kit answers a private kit like an unknown one to everyone but its owner", async () => {
    const rev = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry(PRIVATE, "1.0.0")]) })).body.revision;
    expect(rev.id).toBeTruthy();
    for (const userId of [null, "user-b", "user-c", "user-d"]) {
      const priv = await callTool("get_kit", { kit: "@alpha/my-kit" }, ctx(userId));
      const unknown = await callTool("get_kit", { kit: "@alpha/no-such-kit" }, ctx(userId));
      expect(renamed(text(priv), "my-kit", "no-such-kit"), String(userId)).toBe(text(unknown));
      expect(text(priv)).not.toContain(SLUG);
    }
    const owner = JSON.parse(text(await callTool("get_kit", { kit: "@alpha/my-kit" }, ctx("user-a"))));
    expect(owner.found).toBe(true);
  });

  it("get_release reads through the anonymous viewer by design, even for the owner", async () => {
    const owner = JSON.parse(text(await callTool("get_release", { package: PRIVATE }, ctx("user-a"))));
    expect(owner).toMatchObject({ found: false, code: "not_found" });
  });
});

describe("catalog surfaces never carry a private package", () => {
  const catalog = async (loader: Loader, path: string) => {
    const res = (await loader({ request: request(path, viewers().anonymous), params: {}, context: { cloudflare: { env: env() } } } as never)) as Response;
    return { status: res.status, body: await res.text() };
  };

  it("search finds the public listing and nothing of the private one", async () => {
    const searchEnv = env({ VECTORIZE: { query: async () => Promise.reject(new Error("vectorize off")) }, AI: { run: async () => Promise.reject(new Error("ai off")) } });
    const hit = await executeSearch(searchEnv as unknown as Env, { query: PUBLIC_SLUG, filters: {}, limit: 10 });
    expect(hit.results.map((r) => r.slug)).toContain(PUBLIC_SLUG);
    for (const query of [SLUG, "private notes", PRIVATE]) {
      const miss = await executeSearch(searchEnv as unknown as Env, { query, filters: {}, userId: "user-a", limit: 10 });
      expect(JSON.stringify(miss.results)).not.toContain(SLUG);
    }
  });

  it("llms.txt, llms-full.txt and the leaderboard list the public listing only", async () => {
    for (const [loader, path] of [
      [llmsLoader, "/llms.txt"],
      [llmsFullLoader, "/llms-full.txt"],
      [leaderboardLoader, "/api/leaderboard"],
    ] as const) {
      const { status, body } = await catalog(loader as Loader, path);
      expect(status, path).toBe(200);
      expect(body, path).toContain(PUBLIC_SLUG);
      expect(body, path).not.toContain(SLUG);
      expect(body, path).not.toContain(digest);
    }
  });

  it("skill pages, the detail API, and the markdown preview 404 for the private name", async () => {
    for (const slug of [PRIVATE, SLUG, `alpha-${SLUG}`]) {
      const page = await pageLoader({ params: { slug }, request: request(`/skills/${slug}`, viewers().anonymous), context: { cloudflare: { env: env() } } } as never).catch((e: unknown) => e);
      expect(page).toBeInstanceOf(Response);
      expect((page as Response).status).toBe(404);

      const detail = await route(apiSkillDetail, `/api/skills/${slug}`, { slug }, viewers().unrelatedKey);
      expect(detail.status).toBe(404);
      expect(await detail.text()).not.toContain(SLUG);

      const preview = await handleSkillMarkdown(request(`/skills/${slug}.md`, viewers().anonymous), env() as never, slug);
      const unknown = await handleSkillMarkdown(request(`/skills/nosuchthing.md`, viewers().anonymous), env() as never, "nosuchthing");
      expect(preview.status).toBe(404);
      expect(await preview.text()).toBe(await unknown.text());
    }
  });
});

describe("library", () => {
  const library = async (viewer: Viewer) => {
    const res = await libraryLoader({ request: request("/api/v1/library", viewer), params: {}, context: { cloudflare: { env: env() } } } as never);
    return { status: res.status, body: await res.text() };
  };

  it("lists the private package to its owner and entitled user, never to anyone else", async () => {
    for (const who of ["owner", "entitled"] as const) expect((await library(viewers()[who])).body).toContain(PRIVATE);
    for (const who of ["anonymous", "unrelatedKey", "unrelatedScoped", "stranger"] as const) {
      const res = await library(viewers()[who]);
      expect(res.body, who).not.toContain(SLUG);
      expect(res.body, who).not.toContain(digest);
    }
  });
});

describe("collections", () => {
  async function collections(path: string, viewer: Viewer, body?: unknown, method = body === undefined ? "GET" : "POST") {
    const [, , , , id, ...rest] = path.split("/");
    const params = { ...(id === undefined ? {} : { id }), ...(rest.length === 0 ? {} : { "*": rest.join("/") }) };
    const req = request(path, viewer, { method, headers: { "Content-Type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    const args = { request: req, params, context: { cloudflare: { env: env() } } } as never;
    const res = method === "GET" ? await collectionLoader(args) : await collectionAction(args);
    return { status: res.status, cache: res.headers.get("Cache-Control"), text: await res.text() };
  }

  const UNKNOWN2 = "@alpha/nosuchtwo";
  const OPEN = "@alpha/openthing";
  const READ_PATHS = (id: string) => [`/api/v1/collections/${id}/revisions`, `/api/v1/collections/${id}/revisions/1`, `/api/v1/collections/${id}/revisions/latest`];

  async function create(slug: string, visibility: string, members: unknown[]) {
    const created = await collections("/api/v1/collections", viewers().owner, { slug, name: "Twin", visibility, members, config: {} });
    expect(created.status).toBe(201);
    return JSON.parse(created.text).collection.id as string;
  }

  async function publishOpen() {
    await k.publish(OPEN, "1.0.0", { "SKILL.md": skillText(BODY, "name: openthing\ndescription: open") });
  }

  /** `[PRIVATE, UNKNOWN, OPEN]` against `[UNKNOWN2, UNKNOWN, OPEN]`: the same shape, one slot differing. */
  async function twinCollections(visibility: string) {
    await publishOpen();
    const pin = { version: "1.0.0", digest };
    const withPrivate = await create("with-private", visibility, [{ packageName: PRIVATE, ...pin }, { packageName: UNKNOWN }, { packageName: OPEN, version: "1.0.0" }]);
    const withUnknown = await create("with-unknown", visibility, [{ packageName: UNKNOWN2, ...pin }, { packageName: UNKNOWN }, { packageName: OPEN, version: "1.0.0" }]);
    return { withPrivate, withUnknown };
  }

  /** A response with the ids, clock and slug that legitimately differ between two collections removed. */
  const normalize = (text: string, ...slugs: string[]) => {
    let out = text.replace(/col_[0-9a-f-]{36}/g, "COL").replace(/colrev_[0-9a-f-]{36}/g, "REV").replace(/"(createdAt|updatedAt)":"[^"]+"/g, '"$1":"T"');
    for (const slug of slugs) out = out.split(slug).join("SLUG");
    return out;
  };

  it.each(["public", "unlisted"])("a %s collection answers a private member exactly like an unknown one", async (visibility) => {
    const { withPrivate, withUnknown } = await twinCollections(visibility);
    for (const who of DENIED) {
      for (const [i, privPath] of READ_PATHS(withPrivate).entries()) {
        const priv = await collections(privPath, viewers()[who]);
        const unknown = await collections(READ_PATHS(withUnknown)[i]!, viewers()[who]);
        expect(priv.status, `${who} ${privPath}`).toBe(unknown.status);
        expect(priv.cache, `${who} ${privPath}`).toBe(unknown.cache);
        expect(normalize(priv.text), `${who} ${privPath}`).toBe(normalize(unknown.text));
        expect(priv.text, `${who} ${privPath}`).not.toContain(SLUG);
        expect(priv.text, `${who} ${privPath}`).not.toContain(digest);
        if (priv.status === 200) {
          // Both the private and the unknown names are gone; only the readable member stays.
          expect(priv.text, `${who} ${privPath}`).not.toContain(UNKNOWN);
          expect(priv.text, `${who} ${privPath}`).toContain(OPEN);
          expect(priv.text, `${who} ${privPath}`).toContain('"revisionDigest":null');
        }
      }
      const priv = await collections(`/api/v1/collections/${withPrivate}/clone`, viewers()[who], { slug: "mine-a" });
      const unknown = await collections(`/api/v1/collections/${withUnknown}/clone`, viewers()[who], { slug: "mine-b" });
      expect(priv.status, `${who} clone`).toBe(unknown.status);
      expect(normalize(priv.text, "mine-a"), `${who} clone`).toBe(normalize(unknown.text, "mine-b"));
      expect(priv.text, `${who} clone`).not.toContain(SLUG);
      expect(priv.text, `${who} clone`).not.toContain(digest);
    }
  });

  it("reaches the viewers who cannot use the collection API the same way for a private and an unknown member", async () => {
    const { withPrivate, withUnknown } = await twinCollections("public");
    const scoped = viewers().unrelatedScoped;
    const priv = await collections(`/api/v1/collections/${withPrivate}/revisions/latest`, scoped);
    const unknown = await collections(`/api/v1/collections/${withUnknown}/revisions/latest`, scoped);
    expect(priv.status).toBe(unknown.status);
    expect(normalize(priv.text)).toBe(normalize(unknown.text));
    expect(priv.text).not.toContain(SLUG);
  });

  it("keeps the stored members for the owner, who sees the digest and edits from the whole revision", async () => {
    const { withPrivate } = await twinCollections("public");
    const stored = JSON.parse((await collections(`/api/v1/collections/${withPrivate}/revisions/latest`, viewers().owner)).text).revision;
    expect(stored.members.map((m: { packageName: string }) => m.packageName).sort()).toEqual([PRIVATE, UNKNOWN, OPEN].sort());
    expect(stored.revisionDigest).toMatch(/^sha256:/);
    // A trimmed read by someone else leaves the stored revision untouched.
    await collections(`/api/v1/collections/${withPrivate}/revisions/latest`, viewers().anonymous);
    const edit = await collections(`/api/v1/collections/${withPrivate}/members`, viewers().owner, { expectedRevision: 1, add: [{ packageName: "@alpha/another" }] });
    expect(edit.status).toBe(201);
    const next = JSON.parse(edit.text).revision;
    expect(next.members.map((m: { packageName: string }) => m.packageName)).toEqual(expect.arrayContaining([PRIVATE, UNKNOWN, OPEN, "@alpha/another"]));
    const anon = await collections(`/api/v1/collections/${withPrivate}/revisions/latest`, viewers().anonymous);
    expect(JSON.parse(anon.text).revision.members.map((m: { packageName: string }) => m.packageName)).toEqual([OPEN]);
  });

  it("shows the private member and the stored digest to an entitled reader", async () => {
    const { withPrivate } = await twinCollections("public");
    const res = await collections(`/api/v1/collections/${withPrivate}/revisions/1`, viewers().entitled);
    const revision = JSON.parse(res.text).revision;
    expect(revision.members.map((m: { packageName: string }) => m.packageName)).toContain(PRIVATE);
    // The entitled reader cannot see the unknown name, so that revision is still trimmed.
    expect(revision.members.map((m: { packageName: string }) => m.packageName)).not.toContain(UNKNOWN);
    expect(revision.revisionDigest).toBeNull();
  });

  it("keeps the digest when nothing is trimmed", async () => {
    await publishOpen();
    const id = await create("clean", "public", [{ packageName: OPEN, version: "1.0.0" }]);
    const res = await collections(`/api/v1/collections/${id}/revisions/1`, viewers().anonymous);
    expect(JSON.parse(res.text).revision.revisionDigest).toMatch(/^sha256:/);
  });

  it("a clone made by an entitled reader carries the private member", async () => {
    await publishOpen();
    const id = await create("shared", "public", [{ packageName: PRIVATE, version: "1.0.0", digest }, { packageName: OPEN, version: "1.0.0" }]);
    const clone = await collections(`/api/v1/collections/${id}/clone`, viewers().entitled, { slug: "mine" });
    expect(clone.status).toBe(201);
    expect(JSON.parse(clone.text).revision.members.map((m: { packageName: string }) => m.packageName)).toContain(PRIVATE);
  });

  it("a clone made by a viewer who cannot read the package does not carry it", async () => {
    await publishOpen();
    const id = await create("shared", "public", [{ packageName: PRIVATE, version: "1.0.0", digest }, { packageName: OPEN, version: "1.0.0" }]);
    const clone = await collections(`/api/v1/collections/${id}/clone`, viewers().unrelatedKey, { slug: "mine" });
    expect(clone.status).toBe(201);
    expect(clone.text).not.toContain(SLUG);
    const cloneId = JSON.parse(clone.text).collection.id as string;
    const latest = await collections(`/api/v1/collections/${cloneId}/revisions/latest`, viewers().unrelatedKey);
    expect(latest.text).not.toContain(SLUG);
  });
});

describe("logs", () => {
  it("never contain the private package name, across denied, allowed and failing requests", async () => {
    for (const who of Object.keys(viewers()) as Array<keyof ReturnType<typeof viewers>>) {
      for (const surface of releaseSurfaces) {
        const res = await surface.call(privateTarget(), viewers()[who]);
        await res.arrayBuffer();
      }
    }
    // Storage failure on a private object: the integrity log must not name it.
    for (const key of [...k.h.r2.objects.keys()]) k.h.r2.objects.delete(key);
    for (const who of ["owner", "anonymous"] as const) {
      for (const surface of releaseSurfaces) {
        const res = await surface.call(privateTarget(), viewers()[who]);
        await res.arrayBuffer();
      }
    }
    for (const userId of [null, "user-a"]) {
      for (const tool of ["get_release", "get_package", "search_packages", "get_kit", "prepare_install"]) {
        await callTool(tool, { package: PRIVATE, slug: PRIVATE, query: SLUG, kit: PRIVATE, version: "1.0.0" }, { env: env() as unknown as Env, userId });
      }
    }
    expect(logs.filter((line) => line.includes(SLUG) || line.includes(digest))).toEqual([]);
  });
});
