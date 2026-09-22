/**
 * Boost-scoring inputs for search candidates.
 *
 * Split out of `hybrid-search.ts` to keep each module within the project's
 * 200 LOC rule. Reads aggregate statistics only — never the SKILL.md payload.
 */

import { eq, inArray, and, sql } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { skills, favorites, usageStats } from "~/lib/db/schema";
import type { SkillStats } from "./boost-scoring";

/**
 * Fetch skill stats for boost scoring.
 * Includes: rating, installs, github_stars, success_rate, updated_at, favorites.
 */
export async function fetchSkillStats(
  db: Database,
  skillIds: string[],
  userId?: string
): Promise<Map<string, SkillStats>> {
  if (skillIds.length === 0) {
    return new Map();
  }

  const [skillData, successRates, favResults] = await Promise.all([
    db
      .select({
        id: skills.id,
        avg_rating: skills.avg_rating,
        install_count: skills.install_count,
        github_stars: skills.github_stars,
        net_votes: skills.net_votes,
        updated_at: skills.updated_at,
      })
      .from(skills)
      .where(inArray(skills.id, skillIds)),

    // Compute success_rate per skill from usage_stats
    db
      .select({
        skill_id: usageStats.skill_id,
        success_rate: sql<number>`
          CAST(SUM(CASE WHEN ${usageStats.outcome} = 'success' THEN 1 ELSE 0 END) AS REAL)
          / COUNT(*)
        `.as('success_rate'),
      })
      .from(usageStats)
      .where(inArray(usageStats.skill_id, skillIds))
      .groupBy(usageStats.skill_id),

    // Fetch favorites if user is authenticated
    userId
      ? db
          .select({ skill_id: favorites.skill_id })
          .from(favorites)
          .where(
            and(
              eq(favorites.user_id, userId),
              inArray(favorites.skill_id, skillIds)
            )
          )
      : Promise.resolve([]),
  ]);

  const successMap = new Map(successRates.map((r) => [r.skill_id, r.success_rate]));
  const userFavorites = new Set(favResults.map((f) => f.skill_id));

  const statsMap = new Map<string, SkillStats>();
  for (const skill of skillData) {
    statsMap.set(skill.id, {
      avg_rating: skill.avg_rating || 0,
      usage_count: skill.install_count || 0,
      github_stars: skill.github_stars || 0,
      success_rate: successMap.get(skill.id) ?? 0.5,
      updated_at: skill.updated_at,
      is_favorited: userFavorites.has(skill.id),
      net_votes: skill.net_votes || 0,
    });
  }

  return statsMap;
}
