/**
 * Profile page data helpers.
 *
 * The favorites join returns full `skills` rows; they are gated here so the
 * profile loader cannot serialize `content` into the SSR HTML.
 */

import { eq, desc } from "drizzle-orm";
import { favorites, skills, usageStats } from "~/lib/db/schema";
import type { Database } from "~/lib/db";
import { gateSkillRow } from "./protected-content";

export const PROFILE_USAGE_LIMIT = 50;

export async function fetchProfileData(db: Database, userId: string) {
  const [favoriteRows, usageHistory] = await Promise.all([
    db
      .select()
      .from(favorites)
      .innerJoin(skills, eq(favorites.skill_id, skills.id))
      .where(eq(favorites.user_id, userId)),
    db
      .select({
        id: usageStats.id,
        skillName: skills.name,
        skillSlug: skills.slug,
        outcome: usageStats.outcome,
        model: usageStats.model,
        duration_ms: usageStats.duration_ms,
        created_at: usageStats.created_at,
      })
      .from(usageStats)
      .innerJoin(skills, eq(usageStats.skill_id, skills.id))
      .where(eq(usageStats.user_id, userId))
      .orderBy(desc(usageStats.created_at))
      .limit(PROFILE_USAGE_LIMIT),
  ]);

  return {
    favoriteSkills: favoriteRows.map((row) => gateSkillRow(row.skills, userId)),
    usageHistory,
  };
}
