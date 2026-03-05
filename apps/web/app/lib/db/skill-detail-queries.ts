import { eq, desc, count, avg, and, sql } from "drizzle-orm";
import { skills, ratings, reviews, favorites, usageStats } from "./schema";
import { skillReferences } from "./skill-references-schema";
import type { Database } from "./index";

export async function fetchSkillBySlug(db: Database, slug: string) {
  const [skill] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);
  return skill ?? null;
}

export async function fetchSkillReviews(db: Database, skillId: string) {
  return db
    .select()
    .from(reviews)
    .where(eq(reviews.skill_id, skillId))
    .orderBy(desc(reviews.created_at))
    .limit(50);
}

export async function fetchRatingSummary(db: Database, skillId: string) {
  const data = await db
    .select({
      avgRating: avg(ratings.score),
      ratingCount: count(ratings.id),
    })
    .from(ratings)
    .where(eq(ratings.skill_id, skillId))
    .get();

  return {
    avgRating: Number(data?.avgRating || 0),
    ratingCount: Number(data?.ratingCount || 0),
  };
}

/** Split rating counts by human vs agent */
export async function fetchRatingBreakdown(db: Database, skillId: string) {
  const rows = await db
    .select({
      isAgent: ratings.is_agent,
      total: count(ratings.id),
    })
    .from(ratings)
    .where(eq(ratings.skill_id, skillId))
    .groupBy(ratings.is_agent);

  let humanCount = 0;
  let agentCount = 0;
  for (const row of rows) {
    if (row.isAgent) agentCount = row.total;
    else humanCount = row.total;
  }
  return { humanCount, agentCount };
}

export async function fetchFavoriteCount(db: Database, skillId: string) {
  const data = await db
    .select({ total: count() })
    .from(favorites)
    .where(eq(favorites.skill_id, skillId))
    .get();
  return data?.total ?? 0;
}

/** Usage stats: total runs, success rate, model breakdown */
export async function fetchUsageStats(db: Database, skillId: string) {
  // Total + success count
  const totals = await db
    .select({
      total: count(),
      successCount: sql<number>`sum(case when ${usageStats.outcome} = 'success' then 1 else 0 end)`,
    })
    .from(usageStats)
    .where(eq(usageStats.skill_id, skillId))
    .get();

  const total = totals?.total ?? 0;
  const successCount = Number(totals?.successCount ?? 0);
  const successRate = total > 0 ? (successCount / total) * 100 : 0;

  // Model breakdown (top 6)
  const modelRows = await db
    .select({
      model: usageStats.model,
      total: count(),
    })
    .from(usageStats)
    .where(and(eq(usageStats.skill_id, skillId), sql`${usageStats.model} is not null`))
    .groupBy(usageStats.model)
    .orderBy(sql`count(*) desc`)
    .limit(6);

  const modelBreakdown = modelRows.map((r) => ({
    model: r.model || "unknown",
    count: r.total,
  }));

  return { totalUsages: total, successRate, modelBreakdown };
}

/** Fetch skill references (metadata only — no content for page load) */
export async function fetchSkillReferences(db: Database, skillId: string) {
  return db
    .select({
      id: skillReferences.id,
      title: skillReferences.title,
      filename: skillReferences.filename,
      url: skillReferences.url,
      type: skillReferences.type,
    })
    .from(skillReferences)
    .where(eq(skillReferences.skill_id, skillId))
    .orderBy(skillReferences.title);
}

/** Check user-specific data: favorite status + personal rating */
export async function fetchUserSkillData(
  db: Database,
  userId: string,
  skillId: string
) {
  const [favorite] = await db
    .select()
    .from(favorites)
    .where(and(eq(favorites.user_id, userId), eq(favorites.skill_id, skillId)))
    .limit(1);

  const [rating] = await db
    .select()
    .from(ratings)
    .where(and(eq(ratings.user_id, userId), eq(ratings.skill_id, skillId)))
    .limit(1);

  return {
    isFavorited: !!favorite,
    userRating: rating?.score ?? null,
  };
}
