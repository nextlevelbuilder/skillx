/**
 * D1 insert + Vectorize indexing for the GitHub import path.
 *
 * Split out of `skill-import.ts` to keep that module within the project's
 * 200 LOC rule. This module returns the inserted row to its caller, which is
 * responsible for gating it before it reaches a response.
 */

import { eq } from "drizzle-orm";
import type { Database } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { fetchGitHubSkill } from "~/lib/github/fetch-github-skill";
import { indexSkill } from "~/lib/vectorize/index-skill";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";

/** Insert a listing into D1 and index it in Vectorize. */
export async function insertAndIndexSkill(
  env: Env,
  db: Database,
  ghSkill: Awaited<ReturnType<typeof fetchGitHubSkill>>,
) {
  const skillId = crypto.randomUUID();
  const now = new Date();

  // Sanitize first, then scan the clean version so the label reflects stored content
  const cleanContent = sanitizeContent(ghSkill.content);
  const scanResult = scanContent(cleanContent);

  await db.insert(skills).values({
    id: skillId,
    name: ghSkill.name,
    slug: ghSkill.slug,
    description: ghSkill.description,
    content: cleanContent,
    author: ghSkill.author,
    source_url: ghSkill.source_url,
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

  // Index in Vectorize (best effort; a failure must not fail the import)
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
      `Vectorize indexing failed for ${ghSkill.slug}:`,
      vecError instanceof Error ? vecError.message : vecError,
    );
  }

  const [created] = await db.select().from(skills).where(eq(skills.slug, ghSkill.slug)).limit(1);
  return created;
}
