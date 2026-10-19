/**
 * Personal kit API test harness over the release harness: real ingest of
 * base releases into the in-memory D1/R2, real API key authentication, and
 * helpers that build overlays with the shared contracts engine exactly as a
 * client (AgentKit) would.
 */
import { compareUtf8, memoryTree, overlayBetween, PERSONAL_KIT_SCHEMA } from "@skillx/contracts";
import type { KitTree, SkillOverlay } from "@skillx/contracts";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { loader, action } from "~/routes/api.v1.kits";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { createHarness, file, tarOf } from "../releases/release-harness";

export type KitHarness = Awaited<ReturnType<typeof createKitHarness>>;
export const NOW = new Date("2026-10-14T12:00:00Z");

export const skillText = (body: string, front = "name: demo\ndescription: Demo\nallowed-tools: Read") => `---\n${front}\n---\n${body}`;
export const BODY = ["# Demo", "one", "two", "three", "four", "five", "six", "seven", "eight", "end"].map((l) => `${l}\n`).join("");

export async function createKitHarness() {
  const h = await createHarness();
  const ownerKey = await h.createKey("user-a", null);
  const otherKey = await h.createKey("user-b", null);
  const trees = new Map<string, Record<string, string>>();

  const betaPublisherKey = await h.createKey("user-b", [releasePublishScope("beta")]);

  async function publish(name: string, version: string, files: Record<string, string>) {
    const key = name.startsWith("@beta/") ? betaPublisherKey : undefined;
    const res = await h.upload(name, tarOf(Object.entries(files).map(([p, t]) => file(p, t))), { version, key });
    if (res.status !== 200) throw new Error(`publish ${name}@${version} failed: ${JSON.stringify(res.body)}`);
    trees.set(`${name}@${version}`, files);
    return res.body.releaseDigest as string;
  }

  const treeOf = (name: string, version: string): Promise<KitTree> =>
    memoryTree(Object.entries(trees.get(`${name}@${version}`)!).map(([path, text]) => ({ path, text })));

  async function overlayTo(name: string, version: string, files: Record<string, string>): Promise<{ overlay: SkillOverlay; compositionDigest: string }> {
    const base = await treeOf(name, version);
    const target = await memoryTree(Object.entries(files).map(([path, text]) => ({ path, text })));
    return { overlay: await overlayBetween(base, target), compositionDigest: target.digest };
  }

  async function entry(pkg: string, version: string, files?: Record<string, string>, extra: Record<string, unknown> = {}) {
    const base = await treeOf(pkg, version);
    const composed = files === undefined ? { overlay: { schema: "agentkit.skill-overlay/v1", baseTreeDigest: base.digest, ops: [] }, compositionDigest: base.digest } : await overlayTo(pkg, version, files);
    return { identity: pkg, mode: "override", base: { package: pkg, version, releaseDigest: base.digest }, ...composed, ...extra };
  }

  const doc = (skills: Array<Record<string, unknown>>, extra: Record<string, unknown> = {}) => ({
    schema: PERSONAL_KIT_SCHEMA,
    kit: "@alpha/my-kit",
    localId: "local/my-kit",
    visibility: "private",
    skills: [...skills].sort((a, b) => compareUtf8(String(a.identity), String(b.identity))),
    exclude: [],
    runtimes: {},
    ...extra,
  });

  const env = (extra: Record<string, unknown> = {}) => ({
    SKILLX_RELEASES_API: "1",
    SKILLX_PERSONAL_KITS_API: "1",
    DB: h.deps.db,
    R2: h.deps.bucket,
    ADMIN_SECRET: "test-admin-secret-0123456789",
    RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
    RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
    ...extra,
  });

  interface CallOptions {
    key?: string | null;
    env?: Record<string, unknown>;
    method?: string;
    kit?: string;
    headers?: Record<string, string>;
  }

  async function call(sub: string, body?: unknown, o: CallOptions = {}) {
    const kit = o.kit ?? "@alpha/my-kit";
    const [scope, name] = kit.split("/") as [string, string];
    const method = o.method ?? (body === undefined ? "GET" : "POST");
    const headers = new Headers({ "Content-Type": "application/json", ...o.headers });
    const key = o.key === undefined ? ownerKey : o.key;
    if (key !== null) headers.set("Authorization", `Bearer ${key}`);
    const path = sub === "" ? `/api/v1/kits/${kit}` : `/api/v1/kits/${kit}/${sub}`;
    const request = new Request(`https://skillx.test${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
    const params = { scope, name, ...(sub === "" ? {} : { "*": sub.split("?")[0] }) };
    const args = { request, params, context: { cloudflare: { env: env(o.env) } } } as never;
    const res = method === "GET" ? await loader(args) : await action(args);
    return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
  }

  /**
   * A `fetch` over the real kit and release-manifest route modules, for
   * clients (the enablement smoke) that speak HTTP, with `extra` over the
   * harness env. Other paths are 599.
   */
  const serveWith = (extra: Record<string, unknown> = {}) => async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname;
    const context = { cloudflare: { env: env(extra) } };
    const kitPath = /^\/api\/v1\/kits\/(@[^/]+)\/([^/]+)(?:\/(.+))?$/.exec(path);
    if (kitPath !== null) {
      const params = { scope: kitPath[1], name: kitPath[2], ...(kitPath[3] === undefined ? {} : { "*": kitPath[3] }) };
      const args = { request, params, context } as never;
      return request.method === "GET" || request.method === "HEAD" ? loader(args) : action(args);
    }
    const manifest = /^\/api\/v1\/packages\/(@[^/]+)\/([^/]+)\/releases\/([^/]+)$/.exec(path);
    if (manifest !== null) {
      return manifestLoader({ request, params: { scope: manifest[1], slug: manifest[2], version: manifest[3] }, context } as never);
    }
    return new Response("no route in the kit harness", { status: 599 });
  };
  const serve = serveWith();

  const count = (table: string) => (h.d1.raw.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
  const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);

  let keyCounter = 0;
  const idem = () => `idem-key-${String(++keyCounter).padStart(4, "0")}`;

  return { h, ownerKey, otherKey, publish, treeOf, overlayTo, entry, doc, call, serve, serveWith, count, sql, idem };
}
