import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { apiKeys } from "~/lib/db/schema";
import { eq, isNull, and } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { generateApiKey } from "~/lib/auth/api-key-utils";
import { normalizeRequestedScopes } from "~/lib/auth/api-key-scopes";
import { crossOriginRefusal } from "~/lib/auth/same-origin";
import { listOwnedActivePublishers, listUserApiKeys } from "~/lib/auth/user-api-keys";

export async function loader({ request, context }: LoaderFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Require authentication
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    // Non-revoked keys only, masked to their prefix
    const maskedKeys = await listUserApiKeys(db, session.user.id);

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

    const crossOrigin = crossOriginRefusal(request);
    if (crossOrigin) return crossOrigin;

    // Require authentication
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    const method = request.method;

    if (method === "POST") {
      // Generate new API key
      // SAFETY: request bodies are untrusted; every field is coerced below.
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
      }
      const name = String(body.name || "Default").trim();

      if (name.length > 100) {
        return Response.json(
          { error: "Name cannot exceed 100 characters" },
          { status: 400 }
        );
      }

      // Optional scopes make a scoped key (e.g. CI release publishing), which legacy endpoints reject.
      let scopes: string[] | null = null;
      // `scopes: null` is the same as omitting the field: an account key.
      if (body.scopes !== undefined && body.scopes !== null) {
        let requested: { scopes: string[]; handles: string[] };
        try {
          requested = normalizeRequestedScopes(body.scopes);
        } catch (error) {
          return Response.json({ error: error instanceof Error ? error.message : "Invalid scopes" }, { status: 400 });
        }
        // A key may only grant what its owner holds: publishing for active publishers they own.
        const owned = new Set((await listOwnedActivePublishers(db, session.user.id, requested.handles)).map((p) => p.handle));
        const missing = requested.handles.find((handle) => !owned.has(handle));
        if (missing !== undefined) {
          return Response.json({ error: `You do not own an active publisher @${missing}` }, { status: 403 });
        }
        scopes = requested.scopes;
      }

      // A scoped key is stored under a domain-separated hash, so it can never authenticate as the user.
      const { plaintext, hash, prefix } = await generateApiKey({ scoped: scopes !== null });
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
      const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
      if (body === null || typeof body !== "object" || Array.isArray(body)) {
        return Response.json({ error: "Request body must be a JSON object" }, { status: 400 });
      }
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
