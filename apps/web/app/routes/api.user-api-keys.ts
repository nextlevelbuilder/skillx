import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { apiKeys } from "~/lib/db/schema";
import { publishers } from "~/lib/db/registry-schema";
import { eq, isNull, and } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { generateApiKey } from "~/lib/auth/api-key-utils";
import { normalizeRequestedScopes, parseStoredScopes } from "~/lib/auth/api-key-scopes";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Require authentication
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    // Fetch user's API keys (non-revoked only)
    const userKeys = await db
      .select({
        id: apiKeys.id,
        name: apiKeys.name,
        key_prefix: apiKeys.key_prefix,
        last_used_at: apiKeys.last_used_at,
        created_at: apiKeys.created_at,
        scopes: apiKeys.scopes,
      })
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.user_id, session.user.id),
          isNull(apiKeys.revoked_at)
        )
      )
      .orderBy(apiKeys.created_at);

    // Mask keys - show prefix + "..." for security
    const maskedKeys = userKeys.map((key) => ({
      ...key,
      scopes: parseStoredScopes(key.scopes),
      key_masked: `${key.key_prefix}...`,
    }));

    return Response.json({ keys: maskedKeys });
  } catch (error) {
    console.error("Error fetching API keys:", error);
    return Response.json({ error: "Failed to fetch API keys" }, { status: 500 });
  }
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Require authentication
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const method = request.method;

    if (method === "POST") {
      // Generate new API key
      // SAFETY: request bodies are untrusted; every field is coerced below.
      const body = (await request.json()) as Record<string, unknown>;
      const name = String(body.name || "Default").trim();

      if (name.length > 100) {
        return Response.json(
          { error: "Name cannot exceed 100 characters" },
          { status: 400 }
        );
      }

      // Optional scopes make a scoped key (e.g. CI release publishing), which legacy endpoints reject.
      let scopes: string[] | null = null;
      if (body.scopes !== undefined) {
        let requested: { scopes: string[]; handles: string[] };
        try {
          requested = normalizeRequestedScopes(body.scopes);
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Invalid scopes" }, { status: 400 });
        }
        for (const handle of requested.handles) {
          const [owned] = await db
            .select({ id: publishers.id })
            .from(publishers)
            .where(and(eq(publishers.handle, handle), eq(publishers.owner_user_id, session.user.id), eq(publishers.state, "active")))
            .limit(1);
          if (!owned) {
            return Response.json({ error: `You do not own an active publisher @${handle}` }, { status: 403 });
          }
        }
        scopes = requested.scopes;
      }

      const { plaintext, hash, prefix } = await generateApiKey();
      const keyId = `key-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const now = new Date();

      await db.insert(apiKeys).values({
        id: keyId,
        user_id: session.user.id,
        name,
        key_hash: hash,
        key_prefix: prefix,
        created_at: now,
        last_used_at: null,
        revoked_at: null,
        scopes: scopes === null ? null : JSON.stringify(scopes),
      });

      // Return plaintext key ONCE (never stored)
      return Response.json({
        success: true,
        key: plaintext,
        scopes,
        message: "Save this key securely. It will not be shown again.",
      });
    } else if (method === "DELETE") {
      // Revoke API key (soft delete)
      // SAFETY: request bodies are untrusted; every field is coerced below.
      const body = (await request.json()) as Record<string, unknown>;
      const keyId = String(body.id || "").trim();

      if (!keyId) {
        return Response.json({ error: "Key ID is required" }, { status: 400 });
      }

      // Verify ownership and revoke
      const result = await db
        .update(apiKeys)
        .set({ revoked_at: new Date() })
        .where(
          and(
            eq(apiKeys.id, keyId),
            eq(apiKeys.user_id, session.user.id),
            isNull(apiKeys.revoked_at)
          )
        )
        .returning();

      if (result.length === 0) {
        return Response.json(
          { error: "API key not found or already revoked" },
          { status: 404 }
        );
      }

      return Response.json({ success: true });
    } else {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }
  } catch (error) {
    console.error("Error managing API keys:", error);
    return Response.json({ error: "Failed to manage API keys" }, { status: 500 });
  }
}
