import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, installs } from "~/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { authenticateApiKey } from "~/lib/auth/authenticate-api-key";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";
import { resolveSkillBySlug } from "~/lib/db/skill-aliases";

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) {
      return Response.json({ error: "Skill slug required" }, { status: 400 });
    }

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Resolve identity: API key (user_id) or device fingerprint
    let userId: string | null = null;
    const deviceId = request.headers.get("X-Device-Id");
    const authHeader = request.headers.get("Authorization");

    if (authHeader?.startsWith("Bearer ")) {
      // Unscoped keys only; scoped keys never act as full-account keys.
      userId = (await authenticateApiKey(db, authHeader.substring(7)))?.userId ?? null;
    }

    // Need at least one identifier
    if (!userId && !deviceId) {
      return Response.json(
        { error: "Authorization header or X-Device-Id required" },
        { status: 400 },
      );
    }

    // Find skill
    // Legacy slugs resolve through skill_aliases
    const skill = await resolveSkillBySlug(db, slug);

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Insert install (ON CONFLICT DO NOTHING) and check if row was inserted
    const installId = `inst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    let inserted = false;

    try {
      await db.insert(installs).values({
        id: installId,
        skill_id: skill.id,
        user_id: userId,
        device_id: userId ? null : deviceId, // Nullify device_id when user_id present to prevent double-counting
        created_at: new Date(),
      });
      inserted = true;
    } catch (e: unknown) {
      // UNIQUE constraint violation = already installed (dedup)
      const msg = e instanceof Error ? e.message : "";
      if (!msg.includes("UNIQUE constraint")) throw e;
    }

    if (inserted) {
      // Atomic increment
      await db
        .update(skills)
        .set({ install_count: sql`install_count + 1`, updated_at: new Date() })
        .where(eq(skills.id, skill.id));

      await recomputeSkillScores(db, skill.id);
    }

    return Response.json({ installed: inserted });
  } catch (error) {
    console.error("Error tracking install:", error);
    return Response.json(
      { error: "Failed to track install" },
      { status: 500 },
    );
  }
}
