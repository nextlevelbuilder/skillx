import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { action as trustedAction, loader as trustedLoader } from "~/routes/api.v1.trusted-publishers";
import { GITHUB_OIDC_ISSUER, resetJwksCache, verifyGithubOidcToken } from "~/lib/releases/github-oidc";
import { serveOidcExchange } from "~/lib/releases/oidc-exchange";
import { tarOf } from "./release-harness";
import { ADMIN, audit, envOf, skillFiles, useStateHarness } from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "test-token-secret-0123456789abcdef";
const NOW = new Date("2026-10-13T12:00:00Z");
const b64url = (bytes: Uint8Array | string) => Buffer.from(bytes).toString("base64url");
let keys: CryptoKeyPair;
let jwks: unknown;
let h: Harness;

beforeAll(async () => {
  keys = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  jwks = { keys: [{ ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", use: "sig" }] };
});

beforeEach(async () => {
  h = await useStateHarness();
  resetJwksCache();
});

const baseClaims = () => ({
  iss: GITHUB_OIDC_ISSUER,
  aud: "skillx",
  iat: NOW.getTime() / 1000 - 10,
  nbf: NOW.getTime() / 1000 - 10,
  exp: NOW.getTime() / 1000 + 290,
  jti: crypto.randomUUID(),
  sub: "repo:nextlevelbuilder/skillx:ref:refs/heads/main",
  repository: "nextlevelbuilder/skillx",
  repository_id: "42",
  repository_owner_id: "7",
  workflow_ref: "nextlevelbuilder/skillx/.github/workflows/publish-agentkit-foundation.yml@refs/heads/main",
  ref: "refs/heads/main",
  event_name: "workflow_dispatch",
  run_id: "99",
});

async function jwt(claims: Record<string, unknown>, header: Record<string, unknown> = { alg: "RS256", kid: "k1", typ: "JWT" }, key = keys.privateKey) {
  const signing = `${b64url(JSON.stringify(header))}.${b64url(JSON.stringify(claims))}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signing)));
  return `${signing}.${b64url(sig)}`;
}

async function configure(body: Record<string, unknown>, auth: Record<string, string> = { "X-Admin-Secret": ADMIN }, method = "POST", id?: string) {
  const path = `/api/v1/publishers/bestagentkits/trusted-publishers${id ? `/${id}/revoke` : ""}`;
  const request = new Request(`https://skillx.test${path}`, { method, headers: { "Content-Type": "application/json", ...auth }, body: method === "GET" ? undefined : JSON.stringify(body) });
  const args = { request, params: { handle: "bestagentkits", id }, context: { cloudflare: { env: envOf() } } } as never;
  const res = method === "GET" ? await trustedLoader(args) : await trustedAction(args);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const TRUST = { repository: "NextLevelBuilder/skillx", repositoryId: "42", workflowPath: ".github/workflows/publish-agentkit-foundation.yml", ref: "refs/heads/main" };

async function exchange(token: string, publisher = "@bestagentkits", env: Record<string, unknown> = { SKILLX_TOKEN_SECRET: SECRET }) {
  const request = new Request("https://skillx.test/api/v1/oidc/github/token", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, publisher }) });
  const res = await serveOidcExchange(request, envOf(env) as never, { now: () => NOW, fetchJwks: async () => jwks });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("trusted publisher configuration", () => {
  it("is admin only, idempotent, audited, and revocable", async () => {
    expect((await configure(TRUST, { Authorization: `Bearer ${await h.createKey("user-a", null)}` })).status).toBe(403);
    const added = await configure(TRUST);
    expect(added.status).toBe(200);
    expect(added.body).toMatchObject({ created: true, trustedPublisher: { repository: "nextlevelbuilder/skillx", repositoryId: "42", state: "active" } });
    expect((await configure(TRUST)).body.created).toBe(false);
    expect((await configure({}, undefined, "GET")).body.trustedPublishers).toHaveLength(1);
    const id = added.body.trustedPublisher.id as string;
    expect((await configure({ reason: "rotated" }, undefined, "POST", id)).body.trustedPublisher.state).toBe("revoked");
    expect((await configure({}, undefined, "POST", id)).status).toBe(409);
    expect(audit().filter((r) => r.subject_kind === "trusted_publisher").map((r) => [r.from_state, r.to_state])).toEqual([
      ["none", "active"],
      ["active", "revoked"],
    ]);
  });

  it("validates every field", async () => {
    for (const bad of [{ ...TRUST, repositoryId: 42 }, { ...TRUST, workflowPath: "publish.yml" }, { ...TRUST, ref: "main" }, { ...TRUST, repository: "bad" }, { ...TRUST, extra: 1 }]) {
      expect((await configure(bad)).status).toBe(400);
    }
  });
});

describe("OIDC exchange", () => {
  it("exchanges a matching token once for a publish token that publishes the release", async () => {
    await configure(TRUST);
    const token = await jwt(baseClaims());
    const res = await exchange(token);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ publisher: "@bestagentkits", scope: "releases:publish:@bestagentkits" });
    expect(res.body.token).toMatch(/^sxo_/);
    expect(new Date(res.body.expiresAt).getTime() - NOW.getTime()).toBe(15 * 60_000);
    expect((await exchange(token)).body.error.code).toBe("oidc.replayed");

    const deps = { ...h.deps, tokenSecret: SECRET };
    const publish = (await import("~/lib/releases/ingest-release")).ingestRelease;
    const req = h.request("@bestagentkits/foundation", tarOf(skillFiles()) as BodyInit, { key: res.body.token });
    const published = await publish(req, { scope: "@bestagentkits", slug: "foundation" }, deps);
    expect(published.status).toBe(200);
    const other = h.request("@alpha/foundation", tarOf(skillFiles()) as BodyInit, { key: res.body.token });
    expect((await publish(other, { scope: "@alpha", slug: "foundation" }, deps)).status).toBe(403);
  });

  it.each([
    ["another repository id", { repository_id: "43" }],
    ["another workflow", { workflow_ref: "nextlevelbuilder/skillx/.github/workflows/other.yml@refs/heads/main" }],
    ["another ref", { ref: "refs/heads/dev", workflow_ref: "nextlevelbuilder/skillx/.github/workflows/publish-agentkit-foundation.yml@refs/heads/dev" }],
    ["a fork with the same name", { repository: "nextlevelbuilder/skillx", repository_id: "1000" }],
  ])("refuses %s as not trusted", async (_label, override) => {
    await configure(TRUST);
    expect((await exchange(await jwt({ ...baseClaims(), ...override }))).body.error.code).toBe("oidc.not_trusted");
  });

  it.each(["pull_request", "pull_request_target", "workflow_run", "issue_comment", "schedule", "repository_dispatch"])("refuses the %s event", async (event) => {
    await configure(TRUST);
    const res = await exchange(await jwt({ ...baseClaims(), event_name: event }));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("oidc.event_forbidden");
  });

  it("drops exchange rows past the retention window", async () => {
    await configure(TRUST);
    expect((await exchange(await jwt(baseClaims()))).status).toBe(200);
    h.d1.raw.prepare("UPDATE oidc_token_exchanges SET created_at = ?").run(NOW.getTime() - 8 * 24 * 60 * 60_000);
    expect((await exchange(await jwt(baseClaims()))).status).toBe(200);
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM oidc_token_exchanges").get()).toEqual({ n: 1 });
  });

  it.each(["push", "release"])("accepts the %s event", async (event) => {
    await configure(TRUST);
    expect((await exchange(await jwt({ ...baseClaims(), event_name: event }))).status).toBe(200);
  });

  it("keeps verifying with recently fetched keys while the JWKS endpoint fails", async () => {
    const at = (minutes: number) => new Date(NOW.getTime() + minutes * 60_000);
    const tokenAt = (when: Date) => jwt({ ...baseClaims(), iat: when.getTime() / 1000 - 10, nbf: when.getTime() / 1000 - 10, exp: when.getTime() / 1000 + 290 });
    const down = async () => {
      throw new Error("GitHub is down");
    };
    await verifyGithubOidcToken(await tokenAt(NOW), { audience: "skillx", now: NOW, fetchJwks: async () => jwks });
    await expect(verifyGithubOidcToken(await tokenAt(at(30)), { audience: "skillx", now: at(30), fetchJwks: down })).resolves.toMatchObject({ repository_id: "42" });
    await expect(verifyGithubOidcToken(await tokenAt(at(120)), { audience: "skillx", now: at(120), fetchJwks: down })).rejects.toThrow("GitHub is down");
  });

  it("refuses unknown publishers", async () => {
    await configure(TRUST);
    expect((await exchange(await jwt(baseClaims()), "@alpha")).body.error.code).toBe("oidc.not_trusted");
  });

  it.each([
    ["another audience", { aud: "sigstore" }],
    ["another issuer", { iss: "https://evil.example" }],
    ["an expired token", { exp: NOW.getTime() / 1000 - 1 }],
    ["a future token", { iat: NOW.getTime() / 1000 + 600, nbf: NOW.getTime() / 1000 + 600, exp: NOW.getTime() / 1000 + 900 }],
    ["a missing claim", { repository_id: undefined }],
  ])("rejects %s as an invalid token", async (_label, override) => {
    await configure(TRUST);
    const res = await exchange(await jwt({ ...baseClaims(), ...override }));
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("oidc.invalid_token");
  });

  it("rejects a bad signature, another algorithm and an unknown key", async () => {
    await configure(TRUST);
    const other = (await crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign"])) as CryptoKeyPair;
    expect((await exchange(await jwt(baseClaims(), undefined, other.privateKey))).status).toBe(401);
    expect((await exchange(await jwt(baseClaims(), { alg: "none", kid: "k1" }))).status).toBe(401);
    expect((await exchange(await jwt(baseClaims(), { alg: "RS256", kid: "k9" }))).status).toBe(401);
    expect((await exchange("not.a.jwt")).status).toBe(401);
  });

  it("is 503 without the token secret", async () => {
    await configure(TRUST);
    expect((await exchange(await jwt(baseClaims()), "@bestagentkits", {})).body.error.code).toBe("oidc.unavailable");
  });
});
