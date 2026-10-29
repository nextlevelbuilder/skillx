import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InvalidAccessTokenError, resetJwksCache, verifyAccessToken } from "~/lib/agentkit/access-token";
import { insertLink } from "~/lib/agentkit/link-store";
import { grantsAnyKitRead, grantsLibraryRead } from "~/lib/auth/api-key-scopes";
import { resolveRequestCredential } from "~/lib/auth/scoped-viewer";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import { createFakeAs, createIdentityEnv, ISS } from "./agentkit-fake-as";

let as: Awaited<ReturnType<typeof createFakeAs>>;
let ctx: ReturnType<typeof createIdentityEnv>;

beforeEach(async () => {
  resetJwksCache();
  as = await createFakeAs();
  ctx = createIdentityEnv();
  vi.stubGlobal("fetch", as.fetcher);
});
afterEach(() => vi.unstubAllGlobals());

const bearer = (token: string) => new Request("https://skillx.sh/api/v1/library", { headers: { Authorization: `Bearer ${token}` } });
const env = () => ctx.env as unknown as Env;
const link = (userId: string, sub = "ak-user-1", validatedAt = Date.now()) =>
  insertLink(ctx.env.DB, { userId, issuer: ISS, sub, scopes: "skillx-kits:read skillx-kits:write", refreshTokenEnc: null, linkedAt: validatedAt, validatedAt });

async function refusal(promise: Promise<unknown>): Promise<{ status: number; code: string }> {
  const error = await promise.then(() => null, (e: unknown) => e);
  expect(error).toBeInstanceOf(ReleaseHttpError);
  return { status: (error as ReleaseHttpError).status, code: (error as ReleaseHttpError).code };
}

describe("AgentKit access token verification", () => {
  it("accepts a token signed by the AS for the SkillX resource", async () => {
    const claims = await verifyAccessToken(ctx.env, await as.sign(), as.fetcher);
    expect(claims).toMatchObject({ sub: "ak-user-1", scopes: ["skillx-kits:read", "skillx-kits:write"], clientId: "ak-cli", grantId: "g1" });
  });

  it.each([
    ["another audience", { aud: "https://mcp.agentkit.best/mcp" }, {}],
    ["another issuer", { iss: "https://evil.test" }, {}],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 30 }, {}],
    ["a future iat", { iat: Math.floor(Date.now() / 1000) + 600 }, {}],
    ["an id token typ", {}, { typ: "JWT" }],
    ["alg none", {}, { alg: "none" }],
    ["an unknown kid", {}, { kid: "k9" }],
    ["no subject", { sub: "" }, {}],
  ])("refuses %s", async (_label, claims, header) => {
    await expect(verifyAccessToken(ctx.env, await as.sign(claims, header), as.fetcher)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it("refuses a token whose payload was altered after signing", async () => {
    const [h, , s] = (await as.sign()).split(".");
    const forged = (await as.sign({ sub: "someone-else" })).split(".")[1];
    await expect(verifyAccessToken(ctx.env, `${h}.${forged}.${s}`, as.fetcher)).rejects.toBeInstanceOf(InvalidAccessTokenError);
  });

  it("caches the JWKS between tokens", async () => {
    await verifyAccessToken(ctx.env, await as.sign(), as.fetcher);
    await verifyAccessToken(ctx.env, await as.sign(), as.fetcher);
    expect(as.state.jwksCalls).toBe(1);
  });
});

describe("AgentKit access token as a SkillX credential", () => {
  it("runs as the linked account with translated scopes", async () => {
    await link("user-a");
    const credential = await resolveRequestCredential(bearer(await as.sign()), env(), grantsAnyKitRead);
    // `gone` is suspended, so it grants nothing.
    expect(credential).toEqual({ userId: "user-a", keyId: null, scopes: ["library:read", "kits:write:@alpha"] });
  });

  it("maps a read-only grant to library:read only", async () => {
    await link("user-a");
    const credential = await resolveRequestCredential(bearer(await as.sign({ scope: "skillx-kits:read" })), env(), grantsLibraryRead);
    expect(credential.scopes).toEqual(["library:read"]);
  });

  it("answers 403 account_not_linked with the link URL for an unlinked AgentKit account", async () => {
    const error = await resolveRequestCredential(bearer(await as.sign()), env(), grantsLibraryRead).catch((e: ReleaseHttpError) => e);
    expect(error).toMatchObject({ status: 403, code: "account_not_linked" });
    expect((error as Error).message).toContain("https://skillx.sh/settings#agentkit");
  });

  it("answers 401 invalid_token for a token SkillX must not accept", async () => {
    await link("user-a");
    expect(await refusal(resolveRequestCredential(bearer(await as.sign({ aud: "https://other.test/api" })), env(), grantsLibraryRead))).toEqual({ status: 401, code: "invalid_token" });
  });

  it("refuses the token where the route accepts none of its scopes, like a scoped key", async () => {
    await link("user-a");
    expect(await refusal(resolveRequestCredential(bearer(await as.sign()), env()))).toEqual({ status: 401, code: "invalid_api_key" });
  });

  it("is ignored entirely while SKILLX_AGENTKIT_IDENTITY is off", async () => {
    ctx = createIdentityEnv("0");
    await link("user-a");
    expect(await refusal(resolveRequestCredential(bearer(await as.sign()), env(), grantsLibraryRead))).toEqual({ status: 401, code: "invalid_api_key" });
    expect(as.state.jwksCalls).toBe(0);
  });

  it("answers 503 when the JWKS cannot be fetched", async () => {
    as.state.down = true;
    expect(await refusal(resolveRequestCredential(bearer(await as.sign()), env(), grantsLibraryRead))).toEqual({ status: 503, code: "agentkit_unavailable" });
  });

  it("drops a link revoked at agentkit.best once it is older than 60 seconds", async () => {
    await link("user-a", "ak-user-1", Date.now() - 61_000);
    // No stored refresh token reads as a revoked grant.
    expect(await refusal(resolveRequestCredential(bearer(await as.sign()), env(), grantsLibraryRead))).toEqual({ status: 403, code: "account_not_linked" });
    expect(ctx.d1.raw.prepare("SELECT COUNT(*) AS n FROM agentkit_links").get()).toEqual({ n: 0 });
  });
});
