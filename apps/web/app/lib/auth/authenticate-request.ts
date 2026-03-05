/**
 * Shared request authentication: try API key first, fallback to session.
 * Returns userId or null if unauthenticated.
 */

import { getDb } from "~/lib/db";
import { apiKeys } from "~/lib/db/schema";
import { eq, and, isNull } from "drizzle-orm";
import { verifyApiKey } from "./api-key-utils";
import { getSession } from "./session-helpers";

interface AuthResult {
  userId: string;
  method: "api-key" | "session";
}

export async function authenticateRequest(
  request: Request,
  env: Env,
): Promise<AuthResult | null> {
  // Try API key first (CLI usage)
  const authHeader = request.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    const apiKeyPlaintext = authHeader.substring(7);
    const prefix = apiKeyPlaintext.substring(0, 8);

    const db = getDb(env.DB);
    const [foundKey] = await db
      .select()
      .from(apiKeys)
      .where(and(eq(apiKeys.key_prefix, prefix), isNull(apiKeys.revoked_at)))
      .limit(1);

    if (foundKey) {
      const isValid = await verifyApiKey(apiKeyPlaintext, foundKey.key_hash);
      if (isValid) {
        // Update last used timestamp (best-effort, may be dropped on Workers after response)
        await db.update(apiKeys)
          .set({ last_used_at: new Date() })
          .where(eq(apiKeys.id, foundKey.id));

        return { userId: foundKey.user_id, method: "api-key" };
      }
    }
  }

  // Fallback to session (web usage)
  const session = await getSession(request, env);
  if (session?.user?.id) {
    return { userId: session.user.id, method: "session" };
  }

  return null;
}
