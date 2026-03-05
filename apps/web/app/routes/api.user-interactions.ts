import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills, favorites, votes } from "~/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);
  if (!session?.user?.id) {
    return Response.json({ favorites: [], votes: {} });
  }

  const url = new URL(request.url);
  const slugsParam = url.searchParams.get("slugs") || "";
  const slugs = slugsParam.split(",").filter(Boolean).slice(0, 100);

  if (slugs.length === 0) {
    return Response.json({ favorites: [], votes: {} });
  }

  const db = getDb(env.DB);

  // Get skill IDs from slugs
  const skillRows = await db
    .select({ id: skills.id, slug: skills.slug })
    .from(skills)
    .where(inArray(skills.slug, slugs));

  const idToSlug = new Map(skillRows.map((r) => [r.id, r.slug]));
  const skillIds = skillRows.map((r) => r.id);

  if (skillIds.length === 0) {
    return Response.json({ favorites: [], votes: {} });
  }

  // Parallel fetch of user's favorites and votes
  const [favRows, voteRows] = await Promise.all([
    db
      .select({ skill_id: favorites.skill_id })
      .from(favorites)
      .where(and(eq(favorites.user_id, session.user.id), inArray(favorites.skill_id, skillIds))),
    db
      .select({ skill_id: votes.skill_id, vote_type: votes.vote_type })
      .from(votes)
      .where(and(eq(votes.user_id, session.user.id), inArray(votes.skill_id, skillIds))),
  ]);

  const userFavorites = favRows.map((r) => idToSlug.get(r.skill_id)).filter(Boolean);
  const userVotes: Record<string, string> = {};
  for (const row of voteRows) {
    const slug = idToSlug.get(row.skill_id);
    if (slug) userVotes[slug] = row.vote_type;
  }

  return Response.json({ favorites: userFavorites, votes: userVotes });
}
