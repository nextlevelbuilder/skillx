import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { apiKeys } from "~/lib/db/schema";
import { publishers } from "~/lib/db/registry-schema";
import { parseStoredScopes } from "./api-key-scopes";

export interface UserApiKey {
  id: string;
  name: string;
  key_prefix: string;
  key_masked: string;
  last_used_at: Date | null;
  created_at: Date;
  /** null for a legacy full-account key, otherwise the scopes the key holds. */
  scopes: string[] | null;
}

export interface OwnedPublisher {
  handle: string;
  display_name: string;
}

/** The user's non-revoked keys, oldest first, with the secret masked to its prefix. */
export async function listUserApiKeys(db: Database, userId: string): Promise<UserApiKey[]> {
  const rows = await db
    .select({
      id: apiKeys.id,
      name: apiKeys.name,
      key_prefix: apiKeys.key_prefix,
      last_used_at: apiKeys.last_used_at,
      created_at: apiKeys.created_at,
      scopes: apiKeys.scopes,
    })
    .from(apiKeys)
    .where(and(eq(apiKeys.user_id, userId), isNull(apiKeys.revoked_at)))
    .orderBy(apiKeys.created_at);

  return rows.map((row) => ({
    ...row,
    scopes: parseStoredScopes(row.scopes),
    key_masked: `${row.key_prefix}...`,
  }));
}

/**
 * Active publishers the user owns: the only handles a `releases:publish` scope
 * may name. Pass `handles` to restrict the lookup to those handles.
 */
export async function listOwnedActivePublishers(db: Database, userId: string, handles?: string[]): Promise<OwnedPublisher[]> {
  const conditions = [eq(publishers.owner_user_id, userId), eq(publishers.state, "active")];
  if (handles) {
    if (handles.length === 0) return [];
    conditions.push(inArray(publishers.handle, handles));
  }
  return db
    .select({ handle: publishers.handle, display_name: publishers.display_name })
    .from(publishers)
    .where(and(...conditions))
    .orderBy(asc(publishers.handle));
}
