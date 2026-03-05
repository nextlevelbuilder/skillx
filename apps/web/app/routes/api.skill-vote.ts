import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, votes } from "~/lib/db/schema";
import { eq, and, sql, gt } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { recomputeSkillScores } from "~/lib/leaderboard/recompute-skill-scores";

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 10;

export async function action({ request, params, context }: ActionFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) return Response.json({ error: "Skill slug required" }, { status: 400 });

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Auth required
    const session = await getSession(request, env);
    if (!session?.user?.id) {
      return Response.json({ error: "Authentication required" }, { status: 401 });
    }

    // Validate body
    const body = (await request.json()) as { type?: string };
    const voteType = body?.type;
    if (!["up", "down", "none"].includes(voteType)) {
      return Response.json({ error: "type must be 'up', 'down', or 'none'" }, { status: 400 });
    }

    // Rate limiting: 10 votes/min per user via DB query
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS);
    const [rateCheck] = await db
      .select({ count: sql<number>`count(*)` })
      .from(votes)
      .where(and(eq(votes.user_id, session.user.id), gt(votes.updated_at, windowStart)));

    if (rateCheck.count >= RATE_LIMIT_MAX) {
      return Response.json({ error: "Rate limit exceeded. Max 10 votes per minute." }, { status: 429 });
    }

    // Find skill
    const [skill] = await db
      .select({ id: skills.id })
      .from(skills)
      .where(eq(skills.slug, slug))
      .limit(1);
    if (!skill) return Response.json({ error: "Skill not found" }, { status: 404 });

    // Check existing vote
    const [existing] = await db
      .select()
      .from(votes)
      .where(and(eq(votes.user_id, session.user.id), eq(votes.skill_id, skill.id)))
      .limit(1);

    const now = new Date();

    if (voteType === "none") {
      if (existing) {
        await db.delete(votes).where(eq(votes.id, existing.id));
      }
    } else if (existing) {
      await db.update(votes)
        .set({ vote_type: voteType, updated_at: now })
        .where(eq(votes.id, existing.id));
    } else {
      await db.insert(votes).values({
        id: crypto.randomUUID(),
        user_id: session.user.id,
        skill_id: skill.id,
        vote_type: voteType,
        created_at: now,
        updated_at: now,
      });
    }

    // Atomic vote count update with subquery to prevent race conditions
    await db.run(sql`
      UPDATE skills SET
        upvote_count = (SELECT count(*) FROM votes WHERE skill_id = ${skill.id} AND vote_type = 'up'),
        downvote_count = (SELECT count(*) FROM votes WHERE skill_id = ${skill.id} AND vote_type = 'down'),
        net_votes = (SELECT count(case when vote_type = 'up' then 1 end) - count(case when vote_type = 'down' then 1 end) FROM votes WHERE skill_id = ${skill.id})
      WHERE id = ${skill.id}
    `);

    // Read back for response
    const [updated] = await db
      .select({ net_votes: skills.net_votes })
      .from(skills)
      .where(eq(skills.id, skill.id));

    // Fire-and-forget recompute
    recomputeSkillScores(db, skill.id).catch((err) =>
      console.error("Failed to recompute scores after vote:", err)
    );

    return Response.json({
      vote_type: voteType === "none" ? null : voteType,
      net_votes: updated?.net_votes ?? 0,
    });
  } catch (error) {
    console.error("Error processing vote:", error);
    return Response.json({ error: "Failed to process vote" }, { status: 500 });
  }
}
