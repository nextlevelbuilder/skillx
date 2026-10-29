/**
 * Re-validation of a stored link (identity contract §2): before SkillX acts on
 * a link whose last successful refresh is older than 60 s, it refreshes its own
 * grant. `invalid_grant` means the user revoked SkillX in Connected apps (or
 * the account is gone): the link row is deleted and the account falls back to
 * SkillX's own auth.
 *
 * Refresh tokens rotate and are one-time (reuse revokes the grant), so one
 * request claims the refresh in D1, only if no other refreshed since it read
 * the row, and stores the rotated token before verifying anything; concurrent
 * requests ride on that refresh. An unreachable AS never deletes a
 * link; it is tolerated for `OUTAGE_GRACE_MS`, then the caller gets 503.
 */
import { verifyAccessToken } from "./access-token";
import { AuthServerUnavailableError, GrantRevokedError, refreshGrant, revokeRefreshToken } from "./as-client";
import type { AgentKitEnv } from "./agentkit-config";
import { openRefreshToken, sealRefreshToken } from "./link-crypto";
import { claimRefresh, deleteLink, linkOfUser, recordRefresh, releaseRefresh, storeRefreshToken } from "./link-store";
import type { AgentKitLink } from "./link-store";

export interface LinkEnv extends AgentKitEnv {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
}

export const LINK_FRESH_MS = 60_000;
const CLAIM_MS = 15_000;
const OUTAGE_GRACE_MS = 15 * 60_000;

export class LinkUnavailableError extends Error {}

export type Liveness = "live" | "revoked";

function withinGrace(link: AgentKitLink, now: number): Liveness {
  if (now - link.validatedAt <= OUTAGE_GRACE_MS) return "live";
  throw new LinkUnavailableError("agentkit.best could not confirm the link");
}

async function revoked(env: LinkEnv, link: AgentKitLink): Promise<Liveness> {
  await deleteLink(env.DB, link.userId);
  return "revoked";
}

export async function ensureLinkLive(env: LinkEnv, link: AgentKitLink, fetcher: typeof fetch = fetch, now = Date.now()): Promise<Liveness> {
  if (now - link.validatedAt <= LINK_FRESH_MS) return "live";
  if (!(await claimRefresh(env.DB, link.userId, link.validatedAt, now, now + CLAIM_MS))) {
    // Another request is refreshing (for at most CLAIM_MS) or just did; only a deleted row means revoked.
    return (await linkOfUser(env.DB, link.userId)) === null ? "revoked" : "live";
  }

  const refreshToken = link.refreshTokenEnc === null ? null : await openRefreshToken(env.BETTER_AUTH_SECRET, link.userId, link.refreshTokenEnc);
  if (refreshToken === null) return revoked(env, link);
  try {
    const tokens = await refreshGrant(env, refreshToken, fetcher);
    // The AS has rotated the token: keep the new one before anything else can fail.
    const sealed = tokens.refreshToken === null ? null : await sealRefreshToken(env.BETTER_AUTH_SECRET, link.userId, tokens.refreshToken);
    if (sealed !== null) await storeRefreshToken(env.DB, link.userId, sealed);
    const claims = await verifyAccessToken(env, tokens.accessToken, fetcher, Math.floor(now / 1000));
    if (claims.sub !== link.sub) {
      if (tokens.refreshToken !== null) await revokeRefreshToken(env, tokens.refreshToken, fetcher);
      return revoked(env, link);
    }
    await recordRefresh(env.DB, link.userId, null, tokens.scope, now);
    return "live";
  } catch (error) {
    if (error instanceof GrantRevokedError) return revoked(env, link);
    await releaseRefresh(env.DB, link.userId);
    if (error instanceof AuthServerUnavailableError) return withinGrace(link, now);
    // A token the AS just issued that SkillX cannot verify (JWKS unreachable, wrong audience): no deletion.
    console.warn("agentkit link: refresh not verifiable:", error instanceof Error ? error.message : String(error));
    return withinGrace(link, now);
  }
}
