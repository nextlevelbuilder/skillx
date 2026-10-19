import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { favorites, votes } from "~/lib/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { getSession } from "~/lib/auth/session-helpers";
import { resolveSkillIdsBySlugs } from "~/lib/db/skill-aliases";

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

  // Canonical and alias slugs both resolve; overlay keys stay the slugs the client asked for.
  const slugToId = await resolveSkillIdsBySlugs(db, slugs);
  const idToSlugs = new Map<string, string[]>();
  for (const [slug, id] of slugToId) {
    idToSlugs.set(id, [...(idToSlugs.get(id) ?? []), slug]);
  }
  const skillIds = [...idToSlugs.keys()];

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

  const userFavorites = favRows.flatMap((r) => idToSlugs.get(r.skill_id) ?? []);
  const userVotes: Record<string, string> = {};
  for (const row of voteRows) {
    for (const slug of idToSlugs.get(row.skill_id) ?? []) userVotes[slug] = row.vote_type;
  }

  return Response.json({ favorites: userFavorites, votes: userVotes });
}
