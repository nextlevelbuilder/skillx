import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, ratings } from "~/lib/db/schema";
import { eq, avg, count } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";

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

    // Parse and validate score
    // SAFETY: request bodies are untrusted; every field is re-validated below.
    const body = (await request.json()) as { score?: unknown };
    const score = Number(body.score);

    if (isNaN(score) || score < 0 || score > 10) {
      return Response.json(
        { error: "Score must be a number between 0 and 10" },
        { status: 400 }
      );
    }

    // Find skill
    const [skill] = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, slug))
      .limit(1);

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Upsert rating (update if exists, insert if not)
    const ratingId = `${session.user.id}-${skill.id}`;
    const now = new Date();

    await db
      .insert(ratings)
      .values({
        id: ratingId,
        skill_id: skill.id,
        user_id: session.user.id,
        score,
        is_agent: false,
        created_at: now,
        updated_at: now,
      })
      .onConflictDoUpdate({
        target: [ratings.user_id, ratings.skill_id],
        set: {
          score,
          updated_at: now,
        },
      });

    // Recalculate average rating and count
    const ratingData = await db
      .select({
        avgRating: avg(ratings.score),
        ratingCount: count(ratings.id),
      })
      .from(ratings)
      .where(eq(ratings.skill_id, skill.id))
      .get();

    const avgRating = Number(ratingData?.avgRating ?? 0);
    const ratingCount = Number(ratingData?.ratingCount ?? 0);

    // Update skill's rating stats
    await db
      .update(skills)
      .set({
        avg_rating: avgRating,
        rating_count: ratingCount,
        updated_at: now,
      })
      .where(eq(skills.id, skill.id));

    // Recompute leaderboard scores
    await recomputeSkillScores(db, skill.id);

    return Response.json({
      success: true,
      avg_rating: avgRating,
      rating_count: ratingCount,
    });
  } catch (error) {
    console.error("Error rating skill:", error);
    return Response.json({ error: "Failed to rate skill" }, { status: 500 });
  }
}
