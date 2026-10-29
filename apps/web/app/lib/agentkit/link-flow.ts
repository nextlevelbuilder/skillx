/**
 * "Link with AgentKit" (identity contract §4.1): a signed-in SkillX user
 * authorizes SkillX at agentkit.best (auth code + S256 PKCE, resource
 * `<origin>/api`); the callback stores the token's `sub` on the account with
 * the encrypted refresh token. GitHub login is untouched.
 *
 * The PKCE verifier lives in KV for 10 minutes under the random `state`,
 * bound to the account that started the flow, and is consumed once: a
 * callback in another account's session (login CSRF) is refused.
 */
import { base64UrlEncode, verifyAccessToken } from "./access-token";
import { SKILLX_RESOURCE_SCOPES, agentKitIssuer, asEndpoint, skillxClientId, skillxRedirectUri, skillxResource } from "./agentkit-config";
import { exchangeCode, revokeRefreshToken } from "./as-client";
import { openRefreshToken, sealRefreshToken } from "./link-crypto";
import type { LinkEnv } from "./link-liveness";
import { deleteLink, insertLink, linkOfSubject, linkOfUser } from "./link-store";

export interface LinkFlowEnv extends LinkEnv {
  KV: KVNamespace;
}

const STATE_TTL_SECONDS = 600;
const stateKey = (state: string) => `agentkit-link:state:${state}`;

/** The outcome shown on /settings as `?agentkit=<outcome>`. */
export type LinkOutcome = "linked" | "denied" | "expired" | "already_linked" | "taken" | "failed";

const randomToken = () => base64UrlEncode(crypto.getRandomValues(new Uint8Array(32)));

async function challengeOf(verifier: string): Promise<string> {
  return base64UrlEncode(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

/** The authorize URL to send the user to, or null when the account is already linked. */
export async function startLink(env: LinkFlowEnv, userId: string): Promise<string | null> {
  if ((await linkOfUser(env.DB, userId)) !== null) return null;
  const state = randomToken();
  const verifier = randomToken();
  await env.KV.put(stateKey(state), JSON.stringify({ userId, verifier }), { expirationTtl: STATE_TTL_SECONDS });
  const url = new URL(asEndpoint(env, "authorize"));
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: skillxClientId(env),
    redirect_uri: skillxRedirectUri(env),
    resource: skillxResource(env),
    scope: SKILLX_RESOURCE_SCOPES.join(" "),
    code_challenge: await challengeOf(verifier),
    code_challenge_method: "S256",
    state,
  }).toString();
  return url.toString();
}

/** Handles the callback query for the signed-in `userId`. */
export async function completeLink(env: LinkFlowEnv, userId: string, query: URLSearchParams, fetcher: typeof fetch = fetch): Promise<LinkOutcome> {
  const state = query.get("state") ?? "";
  const stored = state === "" ? null : await env.KV.get<{ userId: string; verifier: string }>(stateKey(state), "json");
  if (stored === null || stored.userId !== userId) return "expired";
  await env.KV.delete(stateKey(state));
  if (query.get("error") !== null) return "denied";
  const code = query.get("code");
  if (code === null || code === "") return "failed";

  let tokens;
  let sub: string;
  try {
    tokens = await exchangeCode(env, code, stored.verifier, fetcher);
    sub = (await verifyAccessToken(env, tokens.accessToken, fetcher)).sub;
  } catch (error) {
    console.warn("agentkit link: code exchange failed:", error instanceof Error ? error.message : String(error));
    return "failed";
  }
  const issuer = agentKitIssuer(env);
  // A refused link must not leave a live grant behind at the AS.
  const refuse = async (outcome: LinkOutcome) => {
    if (tokens.refreshToken !== null) await revokeRefreshToken(env, tokens.refreshToken, fetcher);
    return outcome;
  };
  // Without a refresh token SkillX could never re-validate the link, which would vanish after a minute.
  if (tokens.refreshToken === null) return "failed";
  if ((await linkOfUser(env.DB, userId)) !== null) return refuse("already_linked");
  if ((await linkOfSubject(env.DB, issuer, sub)) !== null) return refuse("taken");

  const now = Date.now();
  const inserted = await insertLink(env.DB, {
    userId,
    issuer,
    sub,
    scopes: tokens.scope ?? SKILLX_RESOURCE_SCOPES.join(" "),
    refreshTokenEnc: await sealRefreshToken(env.BETTER_AUTH_SECRET, userId, tokens.refreshToken),
    linkedAt: now,
    validatedAt: now,
  });
  return inserted ? "linked" : refuse("taken");
}

/** Revokes SkillX's grant at the AS (best effort) and removes the link. */
export async function unlink(env: LinkEnv, userId: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  const link = await linkOfUser(env.DB, userId);
  if (link === null) return false;
  const refreshToken = link.refreshTokenEnc === null ? null : await openRefreshToken(env.BETTER_AUTH_SECRET, userId, link.refreshTokenEnc);
  if (refreshToken !== null) await revokeRefreshToken(env, refreshToken, fetcher);
  await deleteLink(env.DB, userId);
  return true;
}
