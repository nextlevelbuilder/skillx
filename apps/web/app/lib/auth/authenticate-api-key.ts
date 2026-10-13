/**
 * Full-account (unscoped) API key authentication shared by the legacy
 * routes. The key is found by its full SHA-256, so a scoped key, stored
 * under `hashScopedApiKey`, never matches. The query does not reference the
 * `scopes` column, so it keeps working before migration 0012 is applied.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { apiKeys } from "~/lib/db/schema";
import { hashApiKey } from "./api-key-utils";

export interface ApiKeyOwner {
  keyId: string;
  userId: string;
}

/** The owner of an unrevoked unscoped key, or null. Records the key's last use. */
export async function authenticateApiKey(db: Database, plaintext: string): Promise<ApiKeyOwner | null> {
  if (plaintext === "") return null;
  const [found] = await db
    .select({ id: apiKeys.id, user_id: apiKeys.user_id })
    .from(apiKeys)
    .where(and(eq(apiKeys.key_hash, await hashApiKey(plaintext)), isNull(apiKeys.revoked_at)))
    .limit(1);
  if (!found) return null;
  // Best-effort bookkeeping; may be dropped on Workers after the response.
  await db.update(apiKeys).set({ last_used_at: new Date() }).where(eq(apiKeys.id, found.id));
  return { keyId: found.id, userId: found.user_id };
}
