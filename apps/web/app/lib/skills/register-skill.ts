import { eq, like, or } from "drizzle-orm";
import { skills, skillAliases } from "~/lib/db/schema";
import type { getDb } from "~/lib/db";

type Database = ReturnType<typeof getDb>;

/**
 * Slugs already claimed by a skill or a legacy alias for this base slug.
 *
 * Aliases count as claimed: a slug that old links still resolve must never be handed to a
 * second skill. Base slugs only contain `[a-z0-9-]`, so the LIKE pattern needs no escaping.
 */
export async function loadClaimedSlugs(db: Database, base: string): Promise<Set<string>> {
  const prefix = `${base}-%`;

  const [skillRows, aliasRows] = await Promise.all([
    db
      .select({ slug: skills.slug })
      .from(skills)
      .where(or(eq(skills.slug, base), like(skills.slug, prefix))),
    db
      .select({ slug: skillAliases.slug })
      .from(skillAliases)
      .where(or(eq(skillAliases.slug, base), like(skillAliases.slug, prefix))),
  ]);

  return new Set([...skillRows, ...aliasRows].map((row) => row.slug));
}
