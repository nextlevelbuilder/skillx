import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { compareUtf8, memoryTree, overlayBetween, PERSONAL_KIT_SCHEMA } from "@skillx/contracts";
import { LIBRARY_READ_SCOPE, kitsWriteScope, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { hashScopedApiKey } from "~/lib/auth/api-key-utils";
import { loader as libraryLoader } from "~/routes/api.v1.library";
import { loader as fileLoader } from "~/routes/api.v1.release-file";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as releasesLoader } from "~/routes/api.v1.package-releases";
import { listLibrary } from "../../../../packages/cli/src/lib/library-api.js";
import { runKitActivate, runKitLock, runKitPush, runKitRevision, runKitShow } from "../../../../packages/cli/src/commands/kit.js";
import { createInstallContext } from "../../../../packages/cli/src/lib/install/install-context.js";
import { installRefs } from "../../../../packages/cli/src/lib/install/install-operations.js";
import { createRegistry } from "../../../../packages/cli/src/lib/install/registry-client.js";
import { CliError, EXIT_CODES } from "../../../../packages/cli/src/lib/output.js";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { file, tarOf, TEST_KEY_ID } from "../releases/release-harness";
import { BODY, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";

/**
 * The private library round trip, local only: one account, two scoped keys
 * (two machines), a second account, all over the real route modules, the
 * in-memory D1/R2 and the CLI's own library, kit and install code paths.
 * It says nothing about a deployed SkillX.
 */
const cli = vi.hoisted(() => ({ key: null as string | null }));
vi.mock("../../../../packages/cli/src/utils/config-store.js", () => ({
  getApiKey: () => cli.key ?? undefined,
  getBaseUrl: () => "https://skillx.test",
}));
vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

const BASE = "https://skillx.test";
const KIT = "@u/k";
const SKILL = "@u/skill";
const SKILL_FILES = { "SKILL.md": skillText(BODY, "name: skill\ndescription: Private skill") };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n"), "name: skill\ndescription: Private skill"), "notes.md": "my notes\n" };
const MINE_R2 = { ...MINE, "notes.md": "my notes, second machine\n" };
const MINE_A = { ...MINE, "notes.md": "my notes, first machine\n" };

let k: KitHarness;
let work: string;
let keyA: string;
let keyB: string;
let keyV: string;
let publishedDigest: string;
let r1: { id: string; digest: string };
let r1Document: Record<string, any>;
let counter = 0;

const asKey = (key: string | null) => {
  cli.key = key;
};

const env = () => ({
  SKILLX_RELEASES_API: "1",
  SKILLX_PERSONAL_KITS_API: "1",
  DB: k.h.deps.db,
  R2: k.h.deps.bucket,
  RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
  RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
});

/** The web routes the CLI talks to, served in process. */
async function server(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = new Request(input, init);
  const { pathname } = new URL(request.url);
  const context = { cloudflare: { env: env() } };
  if (pathname === "/api/v1/library") return libraryLoader({ request, params: {}, context } as never);
  const files = /^\/api\/v1\/releases\/(sha256:[0-9a-f]{64})\/files\//.exec(pathname);
  if (files !== null) return fileLoader({ request, params: { digest: files[1] }, context } as never);
  const manifest = /^\/api\/v1\/releases\/(sha256:[0-9a-f]{64})\/manifest$/.exec(pathname);
  if (manifest !== null) return manifestLoader({ request, params: { digest: manifest[1] }, context } as never);
  const list = /^\/api\/v1\/packages\/(@[^/]+)\/([^/]+)\/releases$/.exec(pathname);
  if (list !== null) return releasesLoader({ request, params: { scope: list[1], slug: list[2] }, context } as never);
  return k.serve(request);
}

const registryFor = (apiKey: string) => createRegistry({ baseUrl: BASE, apiKey, fetch: server as typeof fetch });

function installContext(name: string, apiKey: string) {
  const home = join(work, name);
  mkdirSync(home, { recursive: true });
  const env = { HOME: home, USERPROFILE: home, SKILLX_HOME: join(home, ".skillx") };
  const keys = new Map([[TEST_KEY_ID, k.h.signingKey.publicKey]]);
  return createInstallContext({ registry: registryFor(apiKey), env, keys });
}

const installed = (ctx: ReturnType<typeof installContext>, alias: string, path: string) => readFileSync(join(ctx.skillsDir, alias, path), "utf8");

async function failure(run: () => Promise<unknown>): Promise<CliError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error("expected the call to fail");
}

/** A kit document over the private skill, as `skillx kit push --document` reads it. */
async function documentFor(files: Record<string, string>) {
  const base = await memoryTree(Object.entries(SKILL_FILES).map(([path, text]) => ({ path, text })));
  const target = await memoryTree(Object.entries(files).map(([path, text]) => ({ path, text })));
  const entry = {
    identity: SKILL,
    mode: "override",
    base: { package: SKILL, version: "1.0.0", releaseDigest: publishedDigest },
    overlay: await overlayBetween(base, target),
    compositionDigest: target.digest,
  };
  return {
    schema: PERSONAL_KIT_SCHEMA,
    kit: KIT,
    localId: "local/k",
    visibility: "private",
    skills: [entry].sort((a, b) => compareUtf8(a.identity, b.identity)),
    exclude: [],
    runtimes: {},
  };
}

function documentFile(document: unknown): string {
  const path = join(work, `document-${++counter}.json`);
  writeFileSync(path, JSON.stringify(document), "utf8");
  return path;
}

const push = (document: unknown, ifMatch: string) => runKitPush(KIT, { document: documentFile(document), ifMatch });

/** The raw HTTP answer, for comparing what an outsider sees. */
async function http(path: string, key: string | null) {
  const headers = new Headers();
  if (key !== null) headers.set("Authorization", `Bearer ${key}`);
  const res = await server(new Request(`${BASE}${path}`, { headers }));
  return { status: res.status, body: await res.text() };
}

beforeAll(async () => {
  work = mkdtempSync(join(tmpdir(), "skillx-private-library-"));
  vi.stubGlobal("fetch", server);
  k = await createKitHarness();
  // The administrator provisions @u for user U; user V owns no publisher.
  k.sql("INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES ('pub-u', 'u', 'U', 'user-u', 1, 'active')");
  const machine = [releasePublishScope("u"), kitsWriteScope("u"), LIBRARY_READ_SCOPE];
  keyA = await k.h.createKey("user-u", machine);
  keyB = await k.h.createKey("user-u", machine);
  keyV = await k.h.createKey("user-v", machine);
});

afterAll(() => {
  vi.unstubAllGlobals();
  rmSync(work, { recursive: true, force: true });
});

describe("private library round trip: one account, two machines", () => {
  it("machine A publishes a private skill and stores and activates a kit over it", async () => {
    // No visibility given: a new package is private.
    const published = await k.h.upload(SKILL, tarOf(Object.entries(SKILL_FILES).map(([p, t]) => file(p, t))), { key: keyA, version: "1.0.0", visibility: null });
    expect(published.status).toBe(200);
    expect(published.body.visibility).toBe("private");
    publishedDigest = published.body.releaseDigest;
    expect((k.h.d1.raw.prepare("SELECT visibility FROM packages WHERE name = ?").get(SKILL) as { visibility: string }).visibility).toBe("private");

    asKey(keyA);
    r1Document = await documentFor(MINE);
    const stored = await push(r1Document, "0");
    expect(stored.generation).toBe(1);
    r1 = stored.revision;
    const activated = await runKitActivate(KIT, r1.id, { digest: r1.digest, ifMatch: "1" });
    expect(activated.generation).toBe(2);
    expect(activated.effectiveRevisionId).toBe(r1.id);
  });

  it("machine B lists the library, reads the revision and the lock exactly as A stored them", async () => {
    asKey(keyA);
    const fromA = { library: await listLibrary({}), revision: await runKitRevision(KIT, r1.id), lock: await runKitLock(KIT, {}) };
    asKey(keyB);
    const fromB = { library: await listLibrary({}), revision: await runKitRevision(KIT, r1.id), lock: await runKitLock(KIT, {}) };

    expect(fromB.library.kits).toEqual({ status: "available" });
    expect(fromB.library.items.map((i) => `${i.kind}:${i.identity}:${i.relation}:${i.visibility}`)).toEqual([`kit:${KIT}:owner:private`, `skill:${SKILL}:owner:private`]);
    const [kit, skill] = fromB.library.items;
    expect(kit).toMatchObject({ state: "active", generation: 2, effectiveRevision: { id: r1.id, number: 1, digest: r1.digest }, installRef: `kit:${KIT}#${r1.id}` });
    expect(skill).toMatchObject({ state: "published", latest: { version: "1.0.0", releaseDigest: publishedDigest }, installRef: `${SKILL}@1.0.0` });
    expect(fromB.library).toEqual(fromA.library);

    expect(fromB.revision.digest).toBe(r1.digest);
    expect(fromB.revision.document).toEqual(r1Document);
    expect(fromB.revision).toEqual(fromA.revision);
    expect(fromB.lock).toEqual(fromA.lock);
  });

  it("machine B installs the kit and the skill with the same digests and bytes as A", async () => {
    const kitRef = [`kit:${KIT}#${r1.id}`];
    const outcomes = {} as Record<"a" | "b", Awaited<ReturnType<typeof installRefs>>>;
    const contexts = { a: installContext("a", keyA), b: installContext("b", keyB) };
    outcomes.a = await installRefs(contexts.a, kitRef);
    outcomes.b = await installRefs(contexts.b, kitRef);

    expect(outcomes.b.lockDigest).toBe(outcomes.a.lockDigest);
    expect(outcomes.b.lock).toEqual(outcomes.a.lock);
    const doc = r1Document.skills[0];
    expect(outcomes.b.lock.packages).toEqual([
      expect.objectContaining({ package: SKILL, version: "1.0.0", releaseDigest: publishedDigest, compositionDigest: doc.compositionDigest }),
    ]);
    expect(outcomes.b.lock.packages[0]!.overlayDigests).toHaveLength(1);
    for (const path of ["SKILL.md", "notes.md"]) {
      expect(installed(contexts.b, "skill", path)).toBe(MINE[path as keyof typeof MINE]);
      expect(installed(contexts.b, "skill", path)).toBe(installed(contexts.a, "skill", path));
    }

    // The skill by itself, from its own release, as installed on a clean home.
    const bare = installContext("b-skill", keyB);
    const plain = await installRefs(bare, [`${SKILL}@1.0.0`]);
    expect(plain.lock.packages[0]).toMatchObject({ package: SKILL, version: "1.0.0", releaseDigest: publishedDigest, compositionDigest: publishedDigest, overlayDigests: [] });
    expect(installed(bare, "skill", "SKILL.md")).toBe(SKILL_FILES["SKILL.md"]);
    expect(existsSync(join(bare.skillsDir, "skill", "notes.md"))).toBe(false);
  });

  it("another account sees nothing, and what it asks for is indistinguishable from unknown", async () => {
    asKey(keyV);
    const library = await listLibrary({});
    expect(library.items).toEqual([]);
    expect(library.nextCursor).toBeNull();

    for (const [real, unknown] of [
      [`/api/v1/kits/${KIT}`, "/api/v1/kits/@u/nokit"],
      [`/api/v1/kits/${KIT}/revisions/${r1.id}`, `/api/v1/kits/@u/nokit/revisions/${r1.id}`],
      [`/api/v1/kits/${KIT}/lock`, "/api/v1/kits/@u/nokit/lock"],
      [`/api/v1/packages/${SKILL}/releases`, "/api/v1/packages/@u/nopkg/releases"],
      [`/api/v1/packages/${SKILL}/releases/1.0.0`, "/api/v1/packages/@u/nopkg/releases/1.0.0"],
      [`/api/v1/releases/${publishedDigest}/manifest?package=${SKILL}&version=1.0.0`, `/api/v1/releases/${publishedDigest}/manifest?package=@u/nopkg&version=1.0.0`],
      [`/api/v1/releases/${publishedDigest}/files/SKILL.md?package=${SKILL}&version=1.0.0`, `/api/v1/releases/${publishedDigest}/files/SKILL.md?package=@u/nopkg&version=1.0.0`],
    ] as const) {
      const seen = await http(real, keyV);
      expect(seen.status, real).toBe(404);
      expect(seen, real).toEqual(await http(unknown, keyV));
    }

    const kitError = await failure(() => runKitShow(KIT));
    expect(kitError).toMatchObject({ code: "not_found", extra: { details: { status: 404 } } });
    const installError = await failure(() => installRefs(installContext("v", keyV), [`kit:${KIT}#${r1.id}`]));
    expect(installError).toMatchObject({ code: "not_found" });
    const skillError = await failure(() => installRefs(installContext("v2", keyV), [`${SKILL}@1.0.0`]));
    expect(skillError).toMatchObject({ code: "not_found" });
  });

  it("keeps the scope vocabulary: no matching scope is 401, another handle is 403", async () => {
    const publishOnly = await k.h.createKey("user-u", [releasePublishScope("u")]);
    expect((await http("/api/v1/library", publishOnly)).status).toBe(401);
    expect(JSON.parse((await http("/api/v1/library", publishOnly)).body).error.code).toBe("invalid_api_key");
    expect((await http("/api/v1/library", null)).status).toBe(401);

    const otherHandle = await k.h.createKey("user-u", [kitsWriteScope("other")]);
    const wrong = await http(`/api/v1/kits/${KIT}`, otherHandle);
    expect(wrong.status).toBe(403);
    expect(JSON.parse(wrong.body).error.code).toBe("auth.scope_missing");
  });

  it("machine B pushes r2 and machine A's push on the stale generation is a conflict", async () => {
    asKey(keyB);
    const second = await push(await documentFor(MINE_R2), "g2");
    expect(second.generation).toBe(3);
    expect(second.revision.number).toBe(2);

    asKey(keyA);
    const staleDocument = await documentFor(MINE_A);
    const stale = await failure(() => push(staleDocument, "g2"));
    expect(stale).toMatchObject({ code: "conflict", extra: { details: { status: 412 } } });
    expect(EXIT_CODES.conflict).toBe(8);
    // Nothing of A's stale write was stored; the kit moved only once.
    expect(k.count("personal_kit_revisions")).toBe(2);
    expect((await runKitShow(KIT)).generation).toBe(3);

    // Reading the new generation, A pushes on top of B's.
    const retried = await push(await documentFor(MINE_A), "g3");
    expect(retried.generation).toBe(4);
    expect(k.count("personal_kit_revisions")).toBe(3);
  });

  it("revoking machine B's key rejects B and leaves A working", async () => {
    k.sql("UPDATE api_keys SET revoked_at = 9 WHERE key_hash = ?", await hashScopedApiKey(keyB));

    asKey(keyB);
    expect(await failure(() => listLibrary({}))).toMatchObject({ code: "auth_error", extra: { details: { status: 401, code: "invalid_api_key" } } });
    expect(await failure(() => runKitShow(KIT))).toMatchObject({ code: "auth_error", extra: { details: { status: 401 } } });
    expect(await failure(() => push(r1Document, "g4"))).toMatchObject({ code: "auth_error" });
    expect(await failure(() => installRefs(installContext("b-revoked", keyB), [`${SKILL}@1.0.0`]))).toMatchObject({ code: "auth_error" });
    expect(k.count("personal_kit_revisions")).toBe(3);

    asKey(keyA);
    const next = await k.h.upload(SKILL, tarOf([file("SKILL.md", skillText(BODY, "name: skill\ndescription: Second release"))]), { key: keyA, version: "1.1.0", visibility: null });
    expect(next.status).toBe(200);
    expect(next.body.visibility).toBe("private");
    // `latest` follows semver, not publish time: make 1.0.0 the newest row so the order is tested.
    k.sql("UPDATE package_releases SET created_at = created_at + 1000 WHERE version = ?", "1.0.0");
    const library = await listLibrary({ kind: "skill" });
    expect(library.items[0]).toMatchObject({ identity: SKILL, latest: { version: "1.1.0" }, installRef: `${SKILL}@1.1.0` });
    expect((await runKitShow(KIT)).generation).toBe(4);
  });
});
