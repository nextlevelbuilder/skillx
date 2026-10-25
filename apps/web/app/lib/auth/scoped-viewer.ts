/**
 * The credential of an API request: an unscoped account key, a scoped key,
 * or (without an `Authorization` header) the web session.
 *
 * A present `Authorization` header must carry a valid, unrevoked key as
 * `Bearer <key>`; anything else (another scheme, an unknown or revoked key)
 * is `401 invalid_api_key`, never a fall back to the session or anonymous, so
 * a misconfigured client never sees a private package as "not found". A
 * scoped key is accepted only when `accepts` approves its scopes; a scoped key
 * holding no scope the route family accepts gets the same 401, as on every
 * legacy endpoint. Routes then check the exact scope (`requireScope`).
 */
import { authenticateApiKey } from "./authenticate-api-key";
import { authenticateRequest } from "./authenticate-request";
import { hashScopedApiKey } from "./api-key-utils";
import { parseStoredScopes } from "./api-key-scopes";
import { getDb } from "~/lib/db";
import { releaseError } from "~/lib/releases/release-http";
import type { ReleaseHttpError } from "~/lib/releases/release-http";

export interface RequestCredential {
  /** The acting account; null for anonymous. */
  userId: string | null;
  /** The API key used, null for a session or anonymous. */
  keyId: string | null;
  /** The key's scopes; null for an unscoped key, a session or anonymous (no scope restriction). */
  scopes: readonly string[] | null;
}

/** Which scoped keys a route family accepts at all; the default accepts none. */
export type ScopeFilter = (scopes: readonly string[]) => boolean;

const API_KEY_PATTERN = /^sx_[0-9a-f]{64}$/;
const SCOPED_KEY_QUERY = "SELECT id, user_id, scopes FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL";

export const invalidApiKey = (): ReleaseHttpError =>
  releaseError(401, "invalid_api_key", "the Authorization header does not carry a valid read API key");

/** The owner and scopes of an unrevoked scoped key, or null. */
async function authenticateScopedKey(db: D1Database, token: string): Promise<{ keyId: string; userId: string; scopes: string[] } | null> {
  if (!API_KEY_PATTERN.test(token)) return null;
  const row = await db.prepare(SCOPED_KEY_QUERY).bind(await hashScopedApiKey(token)).first<{ id: string; user_id: string; scopes: string | null }>();
  if (row === null) return null;
  // A scoped hash with a NULL column cannot be minted; treat it as granting nothing.
  return { keyId: row.id, userId: row.user_id, scopes: parseStoredScopes(row.scopes) ?? [] };
}

/** Records the use of an accepted key; a refused key never shows as used. */
async function recordKeyUse(db: D1Database, keyId: string): Promise<void> {
  try {
    await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), keyId).run();
  } catch (error) {
    // Usage bookkeeping must not block a read; the failure is still reported.
    console.warn("scoped key: cannot record API key use:", error instanceof Error ? error.message : String(error));
  }
}

export async function resolveRequestCredential(
  request: Request,
  env: Env,
  accepts: ScopeFilter = () => false,
): Promise<RequestCredential> {
  const header = request.headers.get("Authorization");
  if (header === null) {
    const viewer = await authenticateRequest(request, env);
    return { userId: viewer?.userId ?? null, keyId: null, scopes: null };
  }
  // The auth scheme is case-insensitive (RFC 9110 section 11.1).
  const key = /^bearer\s+(\S+)\s*$/i.exec(header)?.[1] ?? "";
  // authenticateApiKey matches unscoped keys only (scoped keys hash differently) and rejects "".
  const owner = await authenticateApiKey(getDb(env.DB), key);
  if (owner !== null) return { userId: owner.userId, keyId: owner.keyId, scopes: null };
  const scoped = await authenticateScopedKey(env.DB, key);
  if (scoped === null || !accepts(scoped.scopes)) throw invalidApiKey();
  await recordKeyUse(env.DB, scoped.keyId);
  return scoped;
}

/**
 * 403 `auth.scope_missing` unless the credential is unrestricted (session or
 * unscoped key) or its key holds one of `scopes`. It depends only on the key
 * and the route, never on stored state, so it is no existence oracle.
 */
export function requireScope(credential: Pick<RequestCredential, "scopes">, scopes: readonly string[]): void {
  if (credential.scopes === null || scopes.some((scope) => credential.scopes!.includes(scope))) return;
  throw releaseError(403, "auth.scope_missing", `this API key does not hold the ${scopes.join(" or ")} scope`);
}
