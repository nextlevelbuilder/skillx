/**
 * Shared request authentication: try API key first, fallback to session.
 * Returns userId or null if unauthenticated.
 */

import { getDb } from "~/lib/db";
import { authenticateApiKey } from "./authenticate-api-key";
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
    // Scoped keys never authenticate here (see authenticateApiKey).
    const owner = await authenticateApiKey(getDb(env.DB), authHeader.substring(7));
    if (owner) return { userId: owner.userId, method: "api-key" };
  }

  // Fallback to session (web usage)
  const session = await getSession(request, env);
  if (session?.user?.id) {
    return { userId: session.user.id, method: "session" };
  }

  return null;
}
