/**
 * GitHub → SkillX listing import (the `import` operation, not `publish`).
 *
 * Extracted from `api.skill-register.ts` to keep that route within the project's
 * 200 LOC rule. This module performs authenticated catalog writes: it stores
 * listings, and it never returns a stored row (including `content`) to a caller.
 */

import { eq } from "drizzle-orm";
import { getDb } from "~/lib/db";
import type { Database } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { fetchGitHubSkill } from "~/lib/github/fetch-github-skill";
import { scanGitHubRepo } from "~/lib/github/scan-github-repo";
import { indexSkill } from "~/lib/vectorize/index-skill";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";

/**
 * Import responses expose package identity only.
 *
 * Never echo the stored SKILL.md payload back to the caller, even though this
 * route is authenticated: a write confirmation is not a payload read.
 */
function importSummary(
  skill: { id: string; slug: string; name: string; author: string },
  created: boolean,
): Response {
  return Response.json({
    skill: { id: skill.id, slug: skill.slug, name: skill.name, author: skill.author },
    created,
  });
}

/** Insert a listing into D1 and index it in Vectorize. */
async function insertAndIndexSkill(
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

  // Index in Vectorize (non-blocking best effort)
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

/** Register a single listing from a specific subfolder path. */
async function registerSingleSkill(
  env: Env,
  owner: string,
  repo: string,
  skillPath: string,
): Promise<Response> {
  const ghSkill = await fetchGitHubSkill(owner, repo, skillPath);
  const db = getDb(env.DB);

  const [existing] = await db.select().from(skills).where(eq(skills.slug, ghSkill.slug)).limit(1);
  if (existing) return importSummary(existing, false);

  const created = await insertAndIndexSkill(env, db, ghSkill);
  return importSummary(created, true);
}

/** Scan a repo for all SKILL.md files and import each discovered listing. */
async function registerScannedSkills(env: Env, owner: string, repo: string): Promise<Response> {
  const discovered = await scanGitHubRepo(owner, repo);

  if (discovered.length === 0) {
    return Response.json(
      { error: `No SKILL.md files found in ${owner}/${repo}` },
      { status: 404 },
    );
  }

  const db = getDb(env.DB);
  const registeredSkills: Array<{ slug: string; name: string; author: string }> = [];
  let registered = 0;
  let skipped = 0;

  for (const disc of discovered) {
    const skillPath = disc.skillPath || undefined;
    try {
      const ghSkill = await fetchGitHubSkill(owner, repo, skillPath);

      const [existing] = await db.select().from(skills).where(eq(skills.slug, ghSkill.slug)).limit(1);
      if (existing) {
        registeredSkills.push({ slug: existing.slug, name: existing.name, author: existing.author });
        skipped++;
        continue;
      }

      const created = await insertAndIndexSkill(env, db, ghSkill);
      registeredSkills.push({ slug: created.slug, name: created.name, author: created.author });
      registered++;
    } catch (err) {
      console.warn(`Skipping skill ${disc.skillName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return Response.json({ skills: registeredSkills, registered, skipped });
}

/** Backward compat: try a root-level skill first, then fall back to a scan. */
async function registerWithFallback(env: Env, owner: string, repo: string): Promise<Response> {
  const db = getDb(env.DB);
  const rootSlug = `${owner}-${repo}`.toLowerCase();

  const [existing] = await db.select().from(skills).where(eq(skills.slug, rootSlug)).limit(1);
  if (existing) return importSummary(existing, false);

  try {
    const ghSkill = await fetchGitHubSkill(owner, repo);
    const created = await insertAndIndexSkill(env, db, ghSkill);
    return importSummary(created, true);
  } catch {
    return registerScannedSkills(env, owner, repo);
  }
}

export type RegisterMode =
  | { mode: "single"; skillPath: string }
  | { mode: "scan" }
  | { mode: "fallback" };

export async function runImport(
  env: Env,
  owner: string,
  repo: string,
  request: RegisterMode,
): Promise<Response> {
  switch (request.mode) {
    case "single":
      return registerSingleSkill(env, owner, repo, request.skillPath);
    case "scan":
      return registerScannedSkills(env, owner, repo);
    default:
      return registerWithFallback(env, owner, repo);
  }
}

export function handleRegisterError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message.includes("not found")) {
    return Response.json({ error: message }, { status: 404 });
  }
  if (message.includes("rate limit")) {
    return Response.json({ error: message }, { status: 429 });
  }

  console.error("Skill register error:", error);
  return Response.json({ error: "Failed to register skill", details: message }, { status: 500 });
}
