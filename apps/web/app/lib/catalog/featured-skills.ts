/**
 * Home page data helpers.
 *
 * The featured-skills query returns full `skills` rows; this module is the place
 * where they are gated, so the route cannot accidentally serialize `content` into
 * the SSR HTML.
 */

import { desc } from "drizzle-orm";
import { skills } from "~/lib/db/schema";
import type { Database } from "~/lib/db";
import { gateSkillRow } from "./protected-content";

export const FEATURED_SKILL_LIMIT = 6;

export async function fetchGatedFeaturedSkills(db: Database, userId: string | null) {
  const rows = await db
    .select()
    .from(skills)
    .orderBy(desc(skills.composite_score))
    .limit(FEATURED_SKILL_LIMIT);
  return rows.map((row) => gateSkillRow(row, userId));
}
