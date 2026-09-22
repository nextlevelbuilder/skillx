import { and, eq } from "drizzle-orm";
import { skills, skillAliases } from "./schema";
import type { Database } from "./index";

export type SkillRow = typeof skills.$inferSelect;

/** Row registered for this exact source identity, if any. */
export async function findSkillBySource(
  db: Database,
  sourceRepo: string,
  sourcePath: string,
): Promise<SkillRow | null> {
  const [existing] = await db
    .select()
    .from(skills)
    .where(and(eq(skills.source_repo, sourceRepo), eq(skills.source_path, sourcePath)))
    .limit(1);

  return existing ?? null;
}

/**
 * Resolve a public slug to a skill row.
 *
 * Canonical slugs live in `skills.slug`. Every slug a skill used to have (the mangled
 * `-ill-md` imports and the duplicates collapsed onto the same source identity) is kept
 * in `skill_aliases`, so old URLs, favorites and external links keep working after a
 * slug change. A direct hit on `skills.slug` always wins over an alias.
 */
export async function resolveSkillBySlug(
  db: Database,
  slug: string,
): Promise<SkillRow | null> {
  const [direct] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, slug))
    .limit(1);

  if (direct) return direct;

  const [alias] = await db
    .select({ skillId: skillAliases.skill_id })
    .from(skillAliases)
    .where(eq(skillAliases.slug, slug))
    .limit(1);

  if (!alias) return null;

  const [target] = await db
    .select()
    .from(skills)
    .where(eq(skills.id, alias.skillId))
    .limit(1);

  return target ?? null;
}

export interface SkillAliasInput {
  slug: string;
  skillId: string;
  reason?: "legacy" | "duplicate-source" | "renamed";
  createdAt?: Date;
}

/**
 * Record a slug as an alias of a skill. Idempotent: re-running a backfill never
 * overwrites an alias that already points somewhere.
 */
export async function recordSkillAlias(
  db: Database,
  { slug, skillId, reason = "legacy", createdAt = new Date() }: SkillAliasInput,
): Promise<void> {
  await db
    .insert(skillAliases)
    .values({ slug, skill_id: skillId, reason, created_at: createdAt })
    .onConflictDoNothing();
}

/**
 * Rows in one repository whose source path ends with `leaf`.
 *
 * The CLI's short `owner/repo/leaf` form names a skill by the folder the user typed, while the
 * stored path can be much deeper (`skills/_local/foo/leaf`). Only the last segment is compared, and
 * the caller must require a unique match before using one of these rows.
 */
export async function findSkillsByLeaf(
  db: Database,
  sourceRepo: string,
  leaf: string,
): Promise<Array<{ id: string; slug: string; source_path: string | null }>> {
  if (!leaf) return [];

  const rows = await db
    .select({ id: skills.id, slug: skills.slug, source_path: skills.source_path })
    .from(skills)
    .where(eq(skills.source_repo, sourceRepo));

  return rows.filter((row) => {
    const path = row.source_path ?? "";
    return path === leaf || path.endsWith(`/${leaf}`);
  });
}
