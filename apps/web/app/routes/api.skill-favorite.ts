import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, favorites } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";
import { resolveSkillBySlug } from "~/lib/db/skill-aliases";

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) {
      return Response.json({ error: "Skill slug is required" }, { status: 400 });
    }

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Require authentication
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    // Find skill
    // Find skill (legacy slugs resolve through skill_aliases)
    const skill = await resolveSkillBySlug(db, slug);

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Check if favorite exists
    const [existingFavorite] = await db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.user_id, session.user.id),
          eq(favorites.skill_id, skill.id)
        )
      )
      .limit(1);

    let favorited = false;

    if (existingFavorite) {
      // Delete favorite
      await db
        .delete(favorites)
        .where(
          and(
            eq(favorites.user_id, session.user.id),
            eq(favorites.skill_id, skill.id)
          )
        );
      favorited = false;
    } else {
      // Create favorite
      await db.insert(favorites).values({
        user_id: session.user.id,
        skill_id: skill.id,
        created_at: new Date(),
      });
      favorited = true;
    }

    // Recompute leaderboard scores (fire-and-forget to avoid blocking response)
    recomputeSkillScores(db, skill.id).catch((err) =>
      console.error("Failed to recompute scores after favorite toggle:", err)
    );

    return Response.json({ favorited });
  } catch (error) {
    console.error("Error toggling favorite:", error);
    return Response.json({ error: "Failed to toggle favorite" }, { status: 500 });
  }
}
