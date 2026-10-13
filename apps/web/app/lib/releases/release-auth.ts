/**
 * Authorization of a release upload: a scoped publisher API key
 * (`releases:publish:@<handle>`) whose owner owns the active publisher of the
 * package handle. Sessions and legacy unscoped keys are not accepted.
 */
import { hashApiKey } from "~/lib/auth/api-key-utils";
import { parseStoredScopes, releasePublishScope } from "~/lib/auth/api-key-scopes";
import { releaseError } from "./release-http";

export interface AuthorizedPublisher {
  publisherId: string;
  handle: string;
  userId: string;
  apiKeyId: string;
}

const API_KEY_PATTERN = /^sx_[0-9a-f]{64}$/;

function unauthorized() {
  return releaseError(401, "auth.invalid_key", "a valid, unrevoked API key is required (Authorization: Bearer sx_...)");
}

export async function authorizeReleasePublisher(db: D1Database, request: Request, handle: string): Promise<AuthorizedPublisher> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!API_KEY_PATTERN.test(token)) throw unauthorized();

  const key = await db
    .prepare("SELECT id, user_id, scopes FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL")
    .bind(await hashApiKey(token))
    .first<{ id: string; user_id: string; scopes: string | null }>();
  if (key === null) throw unauthorized();

  const scopes = parseStoredScopes(key.scopes);
  if (scopes === null || !scopes.includes(releasePublishScope(handle))) {
    throw releaseError(403, "auth.scope_missing", `this API key does not hold the ${releasePublishScope(handle)} scope`);
  }

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
