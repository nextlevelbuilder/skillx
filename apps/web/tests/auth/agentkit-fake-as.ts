/**
 * A fake agentkit.best AS for the identity tests: a real ES256 key and JWKS,
 * the token endpoint (authorization_code with S256 PKCE, rotating one-time
 * refresh tokens) and RFC 7009 revocation, plus a FakeD1 with every migration.
 */
import { base64UrlEncode } from "~/lib/agentkit/access-token";
import { FakeD1 } from "../releases/fake-d1";

export const ISS = "https://as.test";
export const RESOURCE = "https://skillx.sh/api";

const enc = (value: unknown) => base64UrlEncode(new TextEncoder().encode(JSON.stringify(value)));

export async function createFakeAs() {
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
  const state = {
    sub: "ak-user-1",
    scope: "skillx-kits:read skillx-kits:write",
    revoked: false,
    down: false,
    /** Only the JWKS endpoint fails (the token endpoint still answers). */
    jwksDown: false,
    noRefreshToken: false,
    refreshTokens: new Set<string>(),
    revokedTokens: [] as string[],
    codes: new Map<string, string>(), // code → code_challenge
    tokenCalls: 0,
    jwksCalls: 0,
  };
  let counter = 0;

  async function sign(claims: Record<string, unknown> = {}, header: Record<string, unknown> = {}): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    const head = enc({ alg: "ES256", typ: "at+jwt", kid: "k1", ...header });
    const body = enc({ iss: ISS, aud: RESOURCE, sub: state.sub, client_id: "ak-cli", grant_id: "g1", scope: state.scope, jti: `j${++counter}`, iat: now, exp: now + 60, ...claims });
    const sig = await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${base64UrlEncode(new Uint8Array(sig))}`;
  }

  async function issue(): Promise<Response> {
    const access = { access_token: await sign(), token_type: "Bearer", expires_in: 60, scope: state.scope };
    if (state.noRefreshToken) return Response.json(access);
    const refresh = `rt-${++counter}`;
    state.refreshTokens.add(refresh);
    return Response.json({ ...access, refresh_token: refresh });
  }

  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (state.down) throw new TypeError("network down");
    if (url === `${ISS}/.well-known/jwks.json`) {
      state.jwksCalls++;
      if (state.jwksDown) return new Response("unavailable", { status: 503 });
      return Response.json({ keys: [{ ...jwk, kid: "k1", alg: "ES256", use: "sig" }] });
    }
    const form = new URLSearchParams(String(init?.body ?? ""));
    if (url === `${ISS}/oauth/revoke`) {
      state.revokedTokens.push(form.get("token") ?? "");
      state.refreshTokens.delete(form.get("token") ?? "");
      return new Response(null, { status: 200 });
    }
    if (url === `${ISS}/oauth/token`) {
      state.tokenCalls++;
      const invalid = () => Response.json({ error: "invalid_grant" }, { status: 400 });
      if (form.get("resource") !== RESOURCE || form.get("client_id") !== "https://skillx.sh/oauth/client.json") return Response.json({ error: "invalid_request" }, { status: 400 });
      if (form.get("grant_type") === "authorization_code") {
        const challenge = state.codes.get(form.get("code") ?? "");
        const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(form.get("code_verifier") ?? "")));
        if (challenge === undefined || challenge !== base64UrlEncode(digest)) return invalid();
        state.codes.delete(form.get("code") ?? "");
        return issue();
      }
      const presented = form.get("refresh_token") ?? "";
      if (state.revoked || !state.refreshTokens.delete(presented)) return invalid();
      return issue();
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  return { state, sign, fetcher };
}

export function fakeKv() {
  const store = new Map<string, string>();
  return {
    store,
    kv: {
      async get(key: string, type?: string) {
        const value = store.get(key);
        if (value === undefined) return null;
        return type === "json" ? JSON.parse(value) : value;
      },
      async put(key: string, value: string) {
        store.set(key, value);
      },
      async delete(key: string) {
        store.delete(key);
      },
    } as unknown as KVNamespace,
  };
}

export function createIdentityEnv(flag = "1") {
  const d1 = new FakeD1();
  for (const id of ["user-a", "user-b"]) {
    d1.raw.exec(`INSERT INTO user (id, name, email, createdAt, updatedAt) VALUES ('${id}', '${id}', '${id}@x.test', 1, 1)`);
  }
  d1.raw.exec("INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES ('p1', 'alpha', 'Alpha', 'user-a', 1, 'active')");
  d1.raw.exec("INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES ('p2', 'gone', 'Gone', 'user-a', 1, 'suspended')");
  const { kv, store } = fakeKv();
  const env = {
    DB: d1.asD1(),
    KV: kv,
    BETTER_AUTH_SECRET: "test-secret-at-least-32-characters-long",
    ENVIRONMENT: "production",
    SKILLX_AGENTKIT_IDENTITY: flag,
    AGENTKIT_ISSUER: ISS,
  };
  return { d1, env, kvStore: store };
}
