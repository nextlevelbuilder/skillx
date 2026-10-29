/**
 * Calls to the agentkit.best AS token and revocation endpoints as the public
 * client SkillX (no secret: CIMD client_id plus PKCE). Every response is
 * reduced to what SkillX needs; tokens are never logged.
 */
import { asEndpoint, skillxClientId, skillxRedirectUri, skillxResource } from "./agentkit-config";
import type { AgentKitEnv } from "./agentkit-config";

export interface TokenSet {
  accessToken: string;
  refreshToken: string | null;
  scope: string | null;
}

/** The AS refused the grant (`invalid_grant`): the link is gone. */
export class GrantRevokedError extends Error {}
/** The AS could not be reached or answered something unexpected: retry later. */
export class AuthServerUnavailableError extends Error {}

const TIMEOUT_MS = 8_000;

async function tokenRequest(env: AgentKitEnv, fields: Record<string, string>, fetcher: typeof fetch): Promise<TokenSet> {
  let res: Response;
  try {
    res = await fetcher(asEndpoint(env, "token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams({ ...fields, client_id: skillxClientId(env), resource: skillxResource(env) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    throw new AuthServerUnavailableError(error instanceof Error ? error.message : String(error));
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (res.ok && typeof body.access_token === "string") {
    return {
      accessToken: body.access_token,
      refreshToken: typeof body.refresh_token === "string" ? body.refresh_token : null,
      scope: typeof body.scope === "string" ? body.scope : null,
    };
  }
  if (res.status >= 400 && res.status < 500 && body.error === "invalid_grant") throw new GrantRevokedError("invalid_grant");
  throw new AuthServerUnavailableError(`token endpoint answered HTTP ${res.status}${typeof body.error === "string" ? ` ${body.error}` : ""}`);
}

export function exchangeCode(env: AgentKitEnv, code: string, codeVerifier: string, fetcher: typeof fetch = fetch): Promise<TokenSet> {
  return tokenRequest(env, { grant_type: "authorization_code", code, code_verifier: codeVerifier, redirect_uri: skillxRedirectUri(env) }, fetcher);
}

export function refreshGrant(env: AgentKitEnv, refreshToken: string, fetcher: typeof fetch = fetch): Promise<TokenSet> {
  return tokenRequest(env, { grant_type: "refresh_token", refresh_token: refreshToken }, fetcher);
}

/** RFC 7009 revocation; best effort, so a failure is reported, never thrown. */
export async function revokeRefreshToken(env: AgentKitEnv, refreshToken: string, fetcher: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await fetcher(asEndpoint(env, "revoke"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token: refreshToken, token_type_hint: "refresh_token", client_id: skillxClientId(env) }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return res.ok;
  } catch (error) {
    console.warn("agentkit link: revocation failed:", error instanceof Error ? error.message : String(error));
    return false;
  }
}
