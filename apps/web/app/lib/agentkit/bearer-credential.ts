/**
 * An agentkit.best access token as a SkillX API credential (identity
 * contract §4.2). The token's `sub` must have a live link to a SkillX account;
 * the request then runs as that account with SkillX scopes translated from
 * the AS scopes, so every route keeps its scoped-key rules:
 *
 * - `skillx-kits:read`  → `library:read`
 * - `skillx-kits:write` → `kits:write:@<handle>` for each active publisher the account owns
 */
import { LIBRARY_READ_SCOPE, kitsWriteScope } from "~/lib/auth/api-key-scopes";
import { releaseError } from "~/lib/releases/release-http";
import { InvalidAccessTokenError, verifyAccessToken } from "./access-token";
import { SKILLX_KITS_READ, SKILLX_KITS_WRITE, agentKitIssuer, linkSettingsUrl } from "./agentkit-config";
import { ensureLinkLive, LinkUnavailableError } from "./link-liveness";
import type { LinkEnv } from "./link-liveness";
import { linkOfSubject } from "./link-store";

export interface AgentKitCredential {
  userId: string;
  scopes: string[];
}

async function ownedHandles(db: D1Database, userId: string): Promise<string[]> {
  const { results } = await db
    .prepare("SELECT handle FROM publishers WHERE owner_user_id = ? AND state = 'active' ORDER BY handle")
    .bind(userId)
    .all<{ handle: string }>();
  return results.map((row) => row.handle);
}

export async function skillxScopesFor(db: D1Database, userId: string, granted: readonly string[]): Promise<string[]> {
  const scopes: string[] = [];
  if (granted.includes(SKILLX_KITS_READ)) scopes.push(LIBRARY_READ_SCOPE);
  if (granted.includes(SKILLX_KITS_WRITE)) scopes.push(...(await ownedHandles(db, userId)).map(kitsWriteScope));
  return scopes;
}

const unavailable = () => releaseError(503, "agentkit_unavailable", "agentkit.best could not be reached to verify the token; retry shortly");

export async function resolveAgentKitBearer(env: LinkEnv, token: string, fetcher: typeof fetch = fetch): Promise<AgentKitCredential> {
  let claims;
  try {
    claims = await verifyAccessToken(env, token, fetcher);
  } catch (error) {
    if (error instanceof InvalidAccessTokenError) throw releaseError(401, "invalid_token", "the AgentKit access token is not valid for SkillX");
    console.warn("agentkit bearer: JWKS unavailable:", error instanceof Error ? error.message : String(error));
    throw unavailable();
  }
  const notLinked = () =>
    releaseError(403, "account_not_linked", `this AgentKit account is not linked to a SkillX account; link it at ${linkSettingsUrl(env)}`);
  const link = await linkOfSubject(env.DB, agentKitIssuer(env), claims.sub);
  if (link === null) throw notLinked();
  try {
    if ((await ensureLinkLive(env, link, fetcher)) === "revoked") throw notLinked();
  } catch (error) {
    if (error instanceof LinkUnavailableError) throw unavailable();
    throw error;
  }
  return { userId: link.userId, scopes: await skillxScopesFor(env.DB, link.userId, claims.scopes) };
}
