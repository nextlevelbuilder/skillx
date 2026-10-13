import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, usageStats } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { authenticateApiKey } from "~/lib/auth/authenticate-api-key";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Authenticate via API key
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return Response.json(
        { error: "API key required. Use Authorization: Bearer header" },
        { status: 401 }
      );
    }

    // Unscoped keys only; scoped keys never act as full-account keys.
    const foundKey = await authenticateApiKey(db, authHeader.substring(7));
    if (!foundKey) {
      return Response.json({ error: "Invalid API key" }, { status: 401 });
    }

    // SAFETY: request bodies are untrusted; every field is re-validated below.
    const body = (await request.json()) as Record<string, unknown>;
    const skill_slug = typeof body.skill_slug === "string" ? body.skill_slug : "";
    const outcome = typeof body.outcome === "string" ? body.outcome : "";
    const model = typeof body.model === "string" ? body.model : null;
    const duration_ms = typeof body.duration_ms === "number" ? body.duration_ms : null;

    if (!skill_slug) {
      return Response.json(
        { error: "skill_slug is required" },
        { status: 400 }
      );
    }

    if (!outcome || !["success", "failure", "partial"].includes(outcome)) {
      return Response.json(
        { error: "outcome must be 'success', 'failure', or 'partial'" },
        { status: 400 }
      );
    }

    // Find skill
    const [skill] = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, skill_slug))
      .limit(1);

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Create usage stat
    const usageId = `usage-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    await db.insert(usageStats).values({
      id: usageId,
      skill_id: skill.id,
      user_id: foundKey.userId,
      model: model || null,
      outcome,
      duration_ms: duration_ms || null,
      created_at: new Date(),
    });

    // Recompute leaderboard scores
    await recomputeSkillScores(db, skill.id);

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error reporting usage:", error);
    return Response.json({ error: "Failed to report usage" }, { status: 500 });
  }
}
