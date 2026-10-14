/**
 * Shared helpers of the state transition tests. Each test file keeps its own
 * session mock (vi.mock is per file) and calls `useStateHarness` in
 * `beforeEach`; every helper below then works on that harness.
 */
import { expect } from "vitest";
import { createHash } from "node:crypto";
import { action as stateAction, loader as stateLoader } from "~/routes/api.v1.release-state";
import type { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { createHarness, file, tarOf } from "./release-harness";

export type Harness = Awaited<ReturnType<typeof createHarness>>;
export const ADMIN = "test-admin-secret-0123456789";
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");

let current: Harness | undefined;
const harness = (): Harness => {
  if (current === undefined) throw new Error("call useStateHarness() in beforeEach first");
  return current;
};

export async function useStateHarness(): Promise<Harness> {
  current = await createHarness();
  return current;
}

export interface ChangeOptions {
  key?: string;
  admin?: string;
  env?: Record<string, unknown>;
  headers?: Record<string, string>;
  method?: string;
  rawBody?: string;
}

export const envOf = (extra: Record<string, unknown> = {}) => ({
  SKILLX_RELEASES_API: "1",
  DB: harness().deps.db,
  R2: harness().deps.bucket,
  ADMIN_SECRET: ADMIN,
  RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
  RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
  ...extra,
});

function stateRequest(path: string, body: unknown, o: ChangeOptions): Request {
  const headers = new Headers({ "Content-Type": "application/json", ...o.headers });
  if (o.key !== undefined) headers.set("Authorization", `Bearer ${o.key}`);
  if (o.admin !== undefined) headers.set("X-Admin-Secret", o.admin);
  const method = o.method ?? "POST";
  const payload = method === "GET" ? undefined : (o.rawBody ?? JSON.stringify(body));
  return new Request(`https://skillx.test${path}`, { method, headers, body: payload });
}

export async function change(name: string, version: string, body: unknown, o: ChangeOptions = {}) {
  const [scope, slug] = name.split("/") as [string, string];
  const request = stateRequest(`/api/v1/packages/${name}/releases/${version}/state`, body, o);
  const args = { request, params: { scope, slug, version }, context: { cloudflare: { env: envOf(o.env) } } } as never;
  const res = o.method === "GET" ? await stateLoader(args) : await stateAction(args);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

export async function changePublisher(handle: string, body: unknown, o: ChangeOptions = {}) {
  const request = stateRequest(`/api/v1/publishers/${handle}/state`, body, o);
  const res = await stateAction({ request, params: { handle }, context: { cloudflare: { env: envOf(o.env) } } } as never);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

export const read = (loader: typeof manifestLoader, path: string, params: Record<string, string>) =>
  loader({ request: new Request(`https://skillx.test${path}`), params, context: { cloudflare: { env: envOf() } } } as never);

export const skillFiles = () => [file("SKILL.md", "---\nname: demo\ndescription: Demo\n---\n# Demo\n"), file("scripts/run.sh", "#!/bin/sh\necho hi\n", "100755")];

export async function publish(name = "@alpha/demo", version = "1.0.0", files = skillFiles()) {
  const res = await harness().upload(name, tarOf(files), { version });
  expect(res.status).toBe(200);
  return res.body.releaseDigest as string;
}

export const stateOf = (version: string, name = "@alpha/demo") =>
  (harness().d1.raw.prepare("SELECT r.release_state AS s FROM package_releases r JOIN packages p ON p.id = r.package_id WHERE p.name = ? AND r.version = ?").get(name, version) as { s: string }).s;
export const audit = () =>
  harness().d1.raw.prepare("SELECT subject_kind, actor_kind, actor_id, from_state, to_state, outcome, reason FROM release_state_audit ORDER BY rowid").all() as Array<Record<string, unknown>>;
export const sql = (statement: string, ...params: Array<string | number | null>) => harness().d1.raw.prepare(statement).run(...params);

/** Everything a transition must never change: release identity columns and every stored object. */
export function immutableSnapshot() {
  return {
    rows: harness().d1.raw
      .prepare("SELECT id, version, release_digest, artifact_key, artifact_digest, artifact_size, signed_manifest_key, file_count, tree_size, created_at FROM package_releases ORDER BY id")
      .all(),
    objects: [...harness().r2.objects.entries()].map(([key, value]) => [key, sha(value.bytes)]).sort(),
  };
}

export function expectError(res: { status: number; body: Record<string, any> }, status: number, code: string) {
  expect(res.status).toBe(status);
  expect(res.body).toEqual({ error: { code, message: expect.any(String) } });
}

/**
 * Parks D1 batches until `count` are waiting, so concurrent requests pass
 * every pre-check before any of them writes. `onRelease` runs for each
 * parked batch, after the wait and right before the batch itself.
 */
export function holdBatches(count: number, onRelease: () => void = () => undefined) {
  const h = harness();
  const original = h.d1.batch.bind(h.d1);
  const waiting: Array<() => void> = [];
  h.d1.batch = async (statements: Parameters<typeof original>[0]) => {
    await new Promise<void>((resolve) => {
      waiting.push(resolve);
      if (waiting.length >= count) for (const resume of waiting.splice(0)) resume();
    });
    onRelease();
    return original(statements);
  };
}
