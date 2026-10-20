/**
 * The short-lived publish token of GitHub OIDC trusted publishing:
 * `sxo_<signed token>` (see `release-tokens.ts`), valid for 15 minutes and
 * for one publisher handle only. It authorizes exactly what a
 * `releases:publish:@handle` key does on the release publish and promote
 * routes; every other route rejects it (it is not an `sx_` API key).
 *
 * The token is stateless, but its use re-reads D1: the publisher must still
 * be active and the trusted publisher config it came from still active, so
 * revoking the config (or suspending the publisher) stops every token it
 * already issued.
 */
import { releaseError } from "./release-http";
import { signToken, verifyToken } from "./release-tokens";
import type { AuthorizedPublisher } from "./release-auth";

export const OIDC_PUBLISH_TOKEN_PREFIX = "sxo_";
export const OIDC_PUBLISH_TOKEN_TTL_MS = 15 * 60_000;

export interface OidcPublishGrant {
  handle: string;
  publisherId: string;
  trustedPublisherId: string;
  jti: string;
}

export async function mintOidcPublishToken(secret: string, grant: OidcPublishGrant, now: Date): Promise<{ token: string; expiresAt: Date }> {
  const exp = now.getTime() + OIDC_PUBLISH_TOKEN_TTL_MS;
  const signed = await signToken(secret, "oidc-publish", {
    v: 1,
    h: grant.handle,
    p: grant.publisherId,
    t: grant.trustedPublisherId,
    j: grant.jti,
    exp,
  });
  return { token: `${OIDC_PUBLISH_TOKEN_PREFIX}${signed}`, expiresAt: new Date(exp) };
}

type Row = { owner_user_id: string | null; publisher_state: string; handle: string; trusted_state: string };

/**
 * The publisher a valid OIDC publish token authorizes for `handle`, or null
 * (401) when the token is malformed, forged, expired, or the secret is unset.
 * A valid token for another handle is 403 `auth.scope_missing`.
 */
export async function verifyOidcPublishToken(
  db: D1Database,
  token: string,
  handle: string,
  secret: string | null,
  now: Date,
): Promise<AuthorizedPublisher | null> {
  if (secret === null || !token.startsWith(OIDC_PUBLISH_TOKEN_PREFIX)) return null;
  const payload = await verifyToken(secret, "oidc-publish", token.slice(OIDC_PUBLISH_TOKEN_PREFIX.length), now);
  if (payload === null || payload.v !== 1) return null;
  const { h, p, t, j } = payload;
  if (typeof h !== "string" || typeof p !== "string" || typeof t !== "string" || typeof j !== "string") return null;
  if (h !== handle) throw releaseError(403, "auth.scope_missing", `this token does not hold the releases:publish:@${handle} scope`);

  const row = await db
    .prepare(
      `SELECT pub.owner_user_id, pub.state AS publisher_state, pub.handle, tp.state AS trusted_state
         FROM publishers pub JOIN trusted_publishers tp ON tp.publisher_id = pub.id
        WHERE pub.id = ? AND tp.id = ?`,
    )
    .bind(p, t)
    .first<Row>();
  if (row === null || row.handle !== handle || row.trusted_state !== "active") return null;
  if (row.publisher_state !== "active") throw releaseError(403, "publisher.inactive", `publisher @${handle} is ${row.publisher_state}`);
  return { publisherId: p, handle, userId: row.owner_user_id ?? "", apiKeyId: `oidc:${j}` };
}
