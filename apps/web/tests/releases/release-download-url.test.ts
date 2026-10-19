import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as mintAction } from "~/routes/api.v1.release-download-url";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { DOWNLOAD_URL_TTL_MS, serveDownloadRedeem } from "~/lib/releases/release-download-url";
import { envOf, publish, sql, useStateHarness } from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "test-token-secret-0123456789abcdef";
let h: Harness;
let readerKey: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  readerKey = await h.createKey("user-r", null);
});

async function mint(digest: string, key?: string, env: Record<string, unknown> = { SKILLX_TOKEN_SECRET: SECRET }) {
  const headers = new Headers();
  if (key !== undefined) headers.set("Authorization", `Bearer ${key}`);
  const request = new Request(`https://skillx.test/api/v1/releases/${digest}/artifact/url`, { method: "POST", headers });
  const res = await mintAction({ request, params: { digest }, context: { cloudflare: { env: envOf(env) } } } as never);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

const redeem = (url: string, now = new Date(), env: Record<string, unknown> = { SKILLX_TOKEN_SECRET: SECRET }) => {
  const token = url.slice(url.lastIndexOf("/") + 1);
  return serveDownloadRedeem(new Request(url), envOf(env) as never, { token }, () => now);
};

const artifactBytes = async (digest: string) => {
  const res = await artifactLoader({ request: new Request(`https://skillx.test/api/v1/releases/${digest}/artifact`), params: { digest }, context: { cloudflare: { env: envOf() } } } as never);
  return new Uint8Array(await res.arrayBuffer());
};

const makePrivate = () => sql("UPDATE packages SET visibility = 'private' WHERE name = '@alpha/demo'");
const grant = (subject: string) =>
  sql("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at) SELECT ?, ?, id, NULL, 'grant', 1, NULL FROM packages WHERE name = '@alpha/demo'", `ent-${subject}`, subject);

describe("signed artifact download URLs", () => {
  it("mints a 5 minute URL for a public release that streams the same bytes, no-store", async () => {
    const digest = await publish();
    const minted = await mint(digest);
    expect(minted.status).toBe(200);
    expect(minted.headers.get("Cache-Control")).toBe("no-store");
    expect(minted.body).toMatchObject({ identity: "@alpha/demo", version: "1.0.0", releaseDigest: digest });
    expect(minted.body.url).toMatch(/^https:\/\/skillx\.test\/api\/v1\/downloads\/[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    const res = await redeem(minted.body.url);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(new Uint8Array(await res.arrayBuffer())).toEqual(await artifactBytes(digest));
  });

  it("answers 404 to an expired, tampered or unconfigured token", async () => {
    const digest = await publish();
    const { url } = (await mint(digest)).body;
    expect((await redeem(url, new Date(Date.now() + DOWNLOAD_URL_TTL_MS + 1000))).status).toBe(404);
    const at = url.lastIndexOf(".") + 10;
    const tampered = url.slice(0, at) + (url[at] === "A" ? "B" : "A") + url.slice(at + 1);
    expect((await redeem(tampered)).status).toBe(404);
    // The last of 43 MAC characters carries two unused bits; another spelling of the same MAC is refused too.
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
    const respelled = url.slice(0, -1) + alphabet[alphabet.indexOf(url.at(-1)!) ^ 1];
    expect((await redeem(respelled)).status).toBe(404);
    expect((await redeem(url, new Date(), { SKILLX_TOKEN_SECRET: "another-secret-0123456789abcdefghij" })).status).toBe(404);
    expect((await redeem(url, new Date(), {})).status).toBe(404);
  });

  it("only mints for an entitled viewer of a private package and re-checks access on redemption", async () => {
    const digest = await publish();
    makePrivate();
    expect((await mint(digest)).status).toBe(404);
    expect((await mint(digest, readerKey)).status).toBe(404);
    grant("user-r");
    const minted = await mint(digest, readerKey);
    expect(minted.status).toBe(200);
    expect((await redeem(minted.body.url)).status).toBe(200);
    sql("UPDATE entitlements SET revoked_at = 2");
    expect((await redeem(minted.body.url)).status).toBe(404);
  });

  it("stops an issued URL once the release is quarantined", async () => {
    const digest = await publish();
    const { url } = (await mint(digest)).body;
    sql("UPDATE package_releases SET release_state = 'quarantined', quarantined_at = 5");
    expect((await redeem(url)).status).not.toBe(200);
  });

  it("is 503 without SKILLX_TOKEN_SECRET and 404 with the releases API off", async () => {
    const digest = await publish();
    expect((await mint(digest, undefined, {})).body.error.code).toBe("download_url.unavailable");
    const { url } = (await mint(digest)).body;
    expect((await redeem(url, new Date(), { SKILLX_TOKEN_SECRET: SECRET, SKILLX_RELEASES_API: "0" })).status).toBe(404);
  });
});
