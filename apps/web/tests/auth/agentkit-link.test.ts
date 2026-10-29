import { beforeEach, describe, expect, it } from "vitest";
import { resetJwksCache } from "~/lib/agentkit/access-token";
import { completeLink, startLink, unlink } from "~/lib/agentkit/link-flow";
import { ensureLinkLive, LinkUnavailableError } from "~/lib/agentkit/link-liveness";
import { claimRefresh, linkOfUser } from "~/lib/agentkit/link-store";
import { loader as clientJson } from "~/routes/oauth.client-json";
import { loader as resourceMetadata } from "~/routes/well-known.oauth-protected-resource";
import { createFakeAs, createIdentityEnv } from "./agentkit-fake-as";

let as: Awaited<ReturnType<typeof createFakeAs>>;
let ctx: ReturnType<typeof createIdentityEnv>;

beforeEach(async () => {
  resetJwksCache();
  as = await createFakeAs();
  ctx = createIdentityEnv();
});

/** Runs the flow as the AS would: start, approve (a code bound to the PKCE challenge), callback. */
async function linkAs(userId: string, callbackUser = userId) {
  const authorize = new URL((await startLink(ctx.env, userId))!);
  const code = `code-${userId}-${Math.random()}`;
  as.state.codes.set(code, authorize.searchParams.get("code_challenge")!);
  const query = new URLSearchParams({ code, state: authorize.searchParams.get("state")! });
  return { authorize, outcome: await completeLink(ctx.env, callbackUser, query, as.fetcher) };
}

const rows = () => ctx.d1.raw.prepare("SELECT user_id, agentkit_sub, refresh_token_enc FROM agentkit_links").all() as Array<Record<string, string>>;

describe("Link with AgentKit", () => {
  it("sends the user to the AS with PKCE S256, the SkillX resource and its CIMD client id", async () => {
    const authorize = new URL((await startLink(ctx.env, "user-a"))!);
    expect(`${authorize.origin}${authorize.pathname}`).toBe("https://as.test/oauth/authorize");
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: "code",
      client_id: "https://skillx.sh/oauth/client.json",
      redirect_uri: "https://skillx.sh/auth/agentkit/callback",
      resource: "https://skillx.sh/api",
      scope: "skillx-kits:read skillx-kits:write",
      code_challenge_method: "S256",
    });
  });

  it("stores the AgentKit subject with the refresh token encrypted", async () => {
    expect((await linkAs("user-a")).outcome).toBe("linked");
    const [row] = rows();
    expect(row).toMatchObject({ user_id: "user-a", agentkit_sub: "ak-user-1" });
    expect(row.refresh_token_enc).toMatch(/^v1\./);
    expect(row.refresh_token_enc).not.toContain("rt-");
    expect(ctx.kvStore.size).toBe(0);
  });

  it("refuses a callback in another account's session (login CSRF)", async () => {
    expect((await linkAs("user-a", "user-b")).outcome).toBe("expired");
    expect(rows()).toEqual([]);
  });

  it("refuses a second link of the same AgentKit account and revokes the new grant", async () => {
    await linkAs("user-a");
    expect((await linkAs("user-b")).outcome).toBe("taken");
    expect(rows()).toHaveLength(1);
    expect(as.state.revokedTokens).toHaveLength(1);
  });

  it("does not start a second link for a linked account", async () => {
    await linkAs("user-a");
    expect(await startLink(ctx.env, "user-a")).toBeNull();
  });

  it("reports a denied consent without linking", async () => {
    const authorize = new URL((await startLink(ctx.env, "user-a"))!);
    const query = new URLSearchParams({ error: "access_denied", state: authorize.searchParams.get("state")! });
    expect(await completeLink(ctx.env, "user-a", query, as.fetcher)).toBe("denied");
    expect(rows()).toEqual([]);
  });

  it("unlinks: revokes SkillX's refresh token at the AS and deletes the row", async () => {
    await linkAs("user-a");
    expect(await unlink(ctx.env, "user-a", as.fetcher)).toBe(true);
    expect(rows()).toEqual([]);
    expect(as.state.revokedTokens).toHaveLength(1);
    expect(as.state.revokedTokens[0]).toMatch(/^rt-/);
    // The only live refresh token at the AS was SkillX's, and it is gone.
    expect(as.state.refreshTokens.size).toBe(0);
  });
});

describe("link liveness", () => {
  /** Ages the stored validation and returns the row as a request would read it. */
  const stale = async (ageMs = 61_000) => {
    ctx.d1.raw.prepare("UPDATE agentkit_links SET validated_at = ?").run(Date.now() - ageMs);
    return (await linkOfUser(ctx.env.DB, "user-a"))!;
  };

  it("trusts a link validated within 60 seconds without calling the AS", async () => {
    await linkAs("user-a");
    const calls = as.state.tokenCalls;
    expect(await ensureLinkLive(ctx.env, (await linkOfUser(ctx.env.DB, "user-a"))!, as.fetcher)).toBe("live");
    expect(as.state.tokenCalls).toBe(calls);
  });

  it("refreshes a stale link and rotates the stored refresh token", async () => {
    await linkAs("user-a");
    const before = rows()[0].refresh_token_enc;
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    expect(rows()[0].refresh_token_enc).not.toBe(before);
  });

  it("deletes the link when the AS answers invalid_grant (revoked in Connected apps)", async () => {
    await linkAs("user-a");
    as.state.revoked = true;
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("revoked");
    expect(rows()).toEqual([]);
  });

  it("keeps the link through a short AS outage, then answers unavailable", async () => {
    await linkAs("user-a");
    as.state.down = true;
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    await expect(ensureLinkLive(ctx.env, await stale(16 * 60_000), as.fetcher)).rejects.toBeInstanceOf(LinkUnavailableError);
    expect(rows()).toHaveLength(1);
  });

  it("lets only one request spend the one-time refresh token", async () => {
    await linkAs("user-a");
    const now = Date.now();
    const { validatedAt } = (await linkOfUser(ctx.env.DB, "user-a"))!;
    expect(await claimRefresh(ctx.env.DB, "user-a", validatedAt, now, now + 15_000)).toBe(true);
    expect(await claimRefresh(ctx.env.DB, "user-a", validatedAt, now, now + 15_000)).toBe(false);
    // The second request rides on the refresh in flight, even past the outage grace.
    const calls = as.state.tokenCalls;
    const old = { ...(await linkOfUser(ctx.env.DB, "user-a"))!, validatedAt: now - 16 * 60_000 };
    expect(await ensureLinkLive(ctx.env, old, as.fetcher, now)).toBe("live");
    expect(as.state.tokenCalls).toBe(calls);
  });

  it("never replays a refresh token another request already rotated", async () => {
    await linkAs("user-a");
    const seenByB = await stale();
    expect(await ensureLinkLive(ctx.env, seenByB, as.fetcher)).toBe("live"); // request A refreshes
    const calls = as.state.tokenCalls;
    expect(await ensureLinkLive(ctx.env, seenByB, as.fetcher)).toBe("live"); // B, with A's stale read
    expect(as.state.tokenCalls).toBe(calls);
    expect(rows()).toHaveLength(1);
  });

  it("keeps the rotated refresh token when the new access token cannot be verified", async () => {
    await linkAs("user-a");
    resetJwksCache();
    as.state.jwksDown = true;
    const before = rows()[0].refresh_token_enc;
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    expect(rows()[0].refresh_token_enc).not.toBe(before);
    as.state.jwksDown = false;
    resetJwksCache();
    // The stored token is the rotated one, so the next refresh still works.
    const calls = as.state.tokenCalls;
    expect(await ensureLinkLive(ctx.env, await stale(), as.fetcher)).toBe("live");
    expect(as.state.tokenCalls).toBe(calls + 1);
    expect(rows()).toHaveLength(1);
  });

  it("refuses a link the AS issued no refresh token for", async () => {
    as.state.noRefreshToken = true;
    expect((await linkAs("user-a")).outcome).toBe("failed");
    expect(rows()).toEqual([]);
  });
});

describe("discovery documents", () => {
  const call = (loader: typeof clientJson, flag: string) =>
    loader({ request: new Request("https://skillx.sh/x"), params: {}, context: { cloudflare: { env: createIdentityEnv(flag).env } } } as never) as Promise<Response>;

  it("serve the CIMD and RFC 9728 metadata only while the feature is on", async () => {
    expect((await call(clientJson, "0")).status).toBe(404);
    expect((await call(resourceMetadata, "0")).status).toBe(404);
    expect(await (await call(clientJson, "1")).json()).toMatchObject({
      client_id: "https://skillx.sh/oauth/client.json",
      redirect_uris: ["https://skillx.sh/auth/agentkit/callback"],
      token_endpoint_auth_method: "none",
    });
    expect(await (await call(resourceMetadata, "1")).json()).toMatchObject({
      resource: "https://skillx.sh/api",
      authorization_servers: ["https://as.test"],
      scopes_supported: ["skillx-kits:read", "skillx-kits:write"],
    });
  });
});
