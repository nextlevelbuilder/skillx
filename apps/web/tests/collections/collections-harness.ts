/**
 * Shared harness of the collections API tests: a fake D1 with every
 * migration, three keys (two owners and a scoped publish key) and a `call`
 * that drives the route module the way React Router does.
 */
import { beforeEach } from "vitest";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { action, loader } from "~/routes/api.v1.collections";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { createHarness } from "../releases/release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
export let h: Harness;
export let ownerKey: string;
export let otherKey: string;
export let scopedKey: string;

export const DIGEST = `sha256:${"a".repeat(64)}`;
export const ADMIN_SECRET = "test-admin-secret-0123456789";

beforeEach(async () => {
  h = await createHarness();
  ownerKey = await h.createKey("user-a", null);
  otherKey = await h.createKey("user-b", null);
  scopedKey = await h.createKey("user-a", [releasePublishScope("alpha")]);
});

export interface CallOptions {
  key?: string | null;
  env?: Record<string, unknown>;
  method?: string;
  headers?: Record<string, string>;
}

export async function call(path: string, body?: unknown, o: CallOptions = {}) {
  const method = o.method ?? (body === undefined ? "GET" : "POST");
  const headers = new Headers({ "Content-Type": "application/json", ...o.headers });
  const key = o.key === undefined ? ownerKey : o.key;
  if (key !== null) headers.set("Authorization", `Bearer ${key}`);
  const [, , , , id, ...rest] = path.split("/");
  const params = { ...(id === undefined ? {} : { id }), ...(rest.length === 0 ? {} : { "*": rest.join("/") }) };
  const request = new Request(`https://skillx.test${path}`, { method, headers, body: method === "GET" ? undefined : JSON.stringify(body ?? {}) });
  const env = {
    SKILLX_COLLECTIONS_API: "1",
    DB: h.deps.db,
    RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
    RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
    ADMIN_SECRET,
    ...o.env,
  };
  const args = { request, params, context: { cloudflare: { env } } } as never;
  const res = method === "GET" ? await loader(args) : await action(args);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

export const create = (extra: Record<string, unknown> = {}, o: CallOptions = {}) =>
  call("/api/v1/collections", { slug: "starter", name: "Starter", members: [{ packageName: "@alpha/demo", version: "1.0.0" }], config: { scope: "user" }, ...extra }, o);
