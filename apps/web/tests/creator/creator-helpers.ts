/**
 * Shared helpers of the owner management tests, over the release state
 * harness (`useStateHarness` in `beforeEach`). Each test file keeps its own
 * session mock because `vi.mock` is per file.
 */
import { servePackageAction } from "~/lib/creator/owner-actions-http";
import type { PackageAction } from "~/lib/creator/owner-actions-http";
import { serveDownloadRedeem } from "~/lib/releases/release-download-url";
import { loader as listLoader } from "~/routes/api.v1.package-releases";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { action as mintAction } from "~/routes/api.v1.release-download-url";
import { TEST_KEY_ID } from "../releases/release-harness";
import { envOf, sql } from "../releases/release-state-helpers";
import type { ChangeOptions, Harness } from "../releases/release-state-helpers";

export const ORIGIN = "https://skillx.test";
const readEnv = () => envOf({ SKILLX_REGISTRY_SIGNING_KEY_ID: TEST_KEY_ID, SKILLX_TOKEN_SECRET: "test-token-secret-0123456789abcdef" });

export interface ManageOptions extends ChangeOptions {
  now?: Date;
}

/** One owner management request against a package (`POST .../visibility|delete|restore`). */
export async function manage(name: string, action: PackageAction, body: unknown = {}, o: ManageOptions = {}) {
  const [scope, slug] = name.split("/") as [string, string];
  const headers = new Headers({ "Content-Type": "application/json", ...o.headers });
  if (o.key !== undefined) headers.set("Authorization", `Bearer ${o.key}`);
  if (o.admin !== undefined) headers.set("X-Admin-Secret", o.admin);
  const request = new Request(`${ORIGIN}/api/v1/packages/${name}/${action}`, { method: o.method ?? "POST", headers, body: o.rawBody ?? JSON.stringify(body) });
  const now = o.now;
  const res = await servePackageAction(request, envOf(o.env) as never, { scope, slug }, action, now === undefined ? undefined : () => now);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

const readRequest = (path: string, key?: string, init: RequestInit = {}) => {
  const headers = new Headers(init.headers);
  if (key !== undefined) headers.set("Authorization", `Bearer ${key}`);
  return new Request(`${ORIGIN}${path}`, { ...init, headers });
};

const read = (loader: (args: never) => Promise<Response>, path: string, params: Record<string, string>, key?: string) =>
  loader({ request: readRequest(path, key), params, context: { cloudflare: { env: readEnv() } } } as never);

/** Statuses of the list, version manifest, digest manifest and artifact reads of `name@1.0.0`. */
export async function readStatuses(name: string, digest: string, key?: string): Promise<number[]> {
  const [scope, slug] = name.split("/") as [string, string];
  const responses = await Promise.all([
    read(listLoader, `/api/v1/packages/${name}/releases`, { scope, slug }, key),
    read(manifestLoader, `/api/v1/packages/${name}/releases/1.0.0`, { scope, slug, version: "1.0.0" }, key),
    read(manifestLoader, `/api/v1/releases/${digest}/manifest`, { digest }, key),
    read(artifactLoader, `/api/v1/releases/${digest}/artifact`, { digest }, key),
  ]);
  return responses.map((r) => r.status);
}

/** Mints a signed artifact URL for `digest` with `key`; returns its redeem function. */
export async function mintDownload(digest: string, key: string) {
  const minted = await mintAction({ request: readRequest(`/api/v1/releases/${digest}/artifact/url`, key, { method: "POST" }), params: { digest }, context: { cloudflare: { env: readEnv() } } } as never);
  if (minted.status !== 200) throw new Error(`mint failed with ${minted.status}`);
  const { url } = (await minted.json()) as { url: string };
  return async () => (await serveDownloadRedeem(new Request(url), readEnv() as never, { token: url.slice(url.lastIndexOf("/") + 1) })).status;
}

export const packageAudit = (h: Harness) =>
  h.d1.raw.prepare("SELECT subject_kind, subject_name, actor_kind, actor_id, action, from_value, to_value FROM package_audit ORDER BY created_at, rowid").all() as Array<Record<string, unknown>>;

export const visibilityOf = (h: Harness, name: string) =>
  (h.d1.raw.prepare("SELECT visibility, deleted_at FROM packages WHERE name = ?").get(name) as { visibility: string; deleted_at: number | null }) ?? null;

export const setVisibility = (name: string, visibility: string) => sql("UPDATE packages SET visibility = ? WHERE name = ?", visibility, name);
