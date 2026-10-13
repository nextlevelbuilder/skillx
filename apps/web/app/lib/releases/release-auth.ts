/**
 * Authorization of a release upload: a scoped publisher API key
 * (`releases:publish:@<handle>`) whose owner owns the active publisher of the
 * package handle. Sessions and legacy unscoped keys are not accepted.
 */
import { hashApiKey, hashScopedApiKey } from "~/lib/auth/api-key-utils";
import { parseStoredScopes, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { releaseError } from "./release-http";

export interface AuthorizedPublisher {
  publisherId: string;
  handle: string;
  userId: string;
  apiKeyId: string;
}

const API_KEY_PATTERN = /^sx_[0-9a-f]{64}$/;
const KEY_QUERY = "SELECT id, user_id, scopes FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL";

type KeyRow = { id: string; user_id: string; scopes: string | null };

function unauthorized() {
  return releaseError(401, "auth.invalid_key", "a valid, unrevoked API key is required (Authorization: Bearer sx_...)");
}

function scopeMissing(handle: string) {
  return releaseError(403, "auth.scope_missing", `this API key does not hold the ${releasePublishScope(handle)} scope`);
}

export async function authorizeReleasePublisher(db: D1Database, request: Request, handle: string): Promise<AuthorizedPublisher> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!API_KEY_PATTERN.test(token)) throw unauthorized();

  const key = await db.prepare(KEY_QUERY).bind(await hashScopedApiKey(token)).first<KeyRow>();
  if (key === null) {
    // A valid unscoped key gets the clearer "scope missing" answer.
    const legacy = await db.prepare(KEY_QUERY).bind(await hashApiKey(token)).first<KeyRow>();
    throw legacy === null ? unauthorized() : scopeMissing(handle);
  }

  const scopes = parseStoredScopes(key.scopes);
  if (scopes === null || !scopes.includes(releasePublishScope(handle))) throw scopeMissing(handle);

  const publisher = await db
    .prepare("SELECT id, owner_user_id, state FROM publishers WHERE handle = ?")
    .bind(handle)
    .first<{ id: string; owner_user_id: string | null; state: string }>();
  if (publisher === null || publisher.owner_user_id !== key.user_id) {
    throw releaseError(403, "publisher.not_owner", `the key owner does not own publisher @${handle}`);
  }
  if (publisher.state !== "active") {
    throw releaseError(403, "publisher.inactive", `publisher @${handle} is ${publisher.state}`);
  }

  try {
    await db.prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?").bind(Date.now(), key.id).run();
  } catch (error) {
    // Usage bookkeeping must not block a publish; the failure is still reported.
    console.warn("release publish: cannot record API key use:", error instanceof Error ? error.message : String(error));
  }
  return { publisherId: publisher.id, handle, userId: key.user_id, apiKeyId: key.id };
}
