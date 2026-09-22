import { eq, like, or } from "drizzle-orm";
import { skills, skillAliases } from "~/lib/db/schema";
import { indexSkill } from "~/lib/vectorize/index-skill";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";
import type { getDb } from "~/lib/db";
import type { GitHubSkillData } from "~/lib/github/fetch-github-skill";
import type { RegistrationDecision } from "./registration";

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

/** Insert a newly discovered skill and index it in Vectorize. Returns the inserted row. */
export async function insertAndIndexSkill(
  env: Env,
  db: Database,
  ghSkill: GitHubSkillData,
  decision: RegistrationDecision,
) {
  const skillId = crypto.randomUUID();
  const now = new Date();

  // Sanitize first, then scan the clean version so the label reflects stored content
  const cleanContent = sanitizeContent(ghSkill.content);
  const scanResult = scanContent(cleanContent);

  await db.insert(skills).values({
    id: skillId,
    name: ghSkill.name,
    slug: decision.slug,
    description: ghSkill.description,
    content: cleanContent,
    author: ghSkill.author,
    source_url: ghSkill.source_url,
    source_repo: decision.source_repo,
    source_path: decision.source_path,
    category: ghSkill.category,
    install_command: ghSkill.install_command,
    version: "1.0.0",
    is_paid: false,
    price_cents: 0,
    avg_rating: 0,
    rating_count: 0,
    github_stars: ghSkill.github_stars,
    install_count: 0,
    risk_label: scanResult.label,
    created_at: now,
    updated_at: now,
  });

  // Index in Vectorize (non-blocking)
  try {
    await indexSkill(env.VECTORIZE, env.AI, {
      id: skillId,
      name: ghSkill.name,
      description: ghSkill.description,
      content: cleanContent,
      category: ghSkill.category,
      is_paid: false,
      avg_rating: 0,
    });
  } catch (vecError) {
    console.warn(
      `Vectorize indexing failed for ${decision.slug}:`,
      vecError instanceof Error ? vecError.message : vecError,
    );
  }

  const [created] = await db.select().from(skills).where(eq(skills.id, skillId)).limit(1);

  return created;
}
