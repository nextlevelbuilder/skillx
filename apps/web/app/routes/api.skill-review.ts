import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, reviews } from "~/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";

export async function loader({ params, context }: LoaderFunctionArgs) {
  try {
    const slug = params.slug;
    if (!slug) {
      return Response.json({ error: "Skill slug is required" }, { status: 400 });
    }

    const env = context.cloudflare.env as Env;
    const db = getDb(env.DB);

    // Find skill
    const [skill] = await db
      .select()
      .from(skills)
      .where(eq(skills.slug, slug))
      .limit(1);

    if (!skill) {
      return Response.json({ error: "Skill not found" }, { status: 404 });
    }

    // Fetch reviews
    const skillReviews = await db
      .select()
      .from(reviews)
      .where(eq(reviews.skill_id, skill.id))
      .orderBy(desc(reviews.created_at))
      .limit(100);

    return Response.json({ reviews: skillReviews });
  } catch (error) {
    console.error("Error fetching reviews:", error);
    return Response.json({ error: "Failed to fetch reviews" }, { status: 500 });
  }
}

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

    // Parse and validate content
    // SAFETY: request bodies are untrusted; every field is re-validated below.
    const body = (await request.json()) as { content?: unknown };
    const content = String(body.content || "").trim();

    if (!content || content.length < 1) {
      return Response.json(
        { error: "Review content cannot be empty" },
        { status: 400 }
      );
    }

    if (content.length > 2000) {
      return Response.json(
        { error: "Review content cannot exceed 2000 characters" },
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

    // Create review
    const reviewId = `review-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const now = new Date();

    const [review] = await db
      .insert(reviews)
      .values({
        id: reviewId,
        skill_id: skill.id,
        user_id: session.user.id,
        content,
        is_agent: false,
        created_at: now,
      })
      .returning();

    return Response.json({ success: true, review });
  } catch (error) {
    console.error("Error creating review:", error);
    return Response.json({ error: "Failed to create review" }, { status: 500 });
  }
}
