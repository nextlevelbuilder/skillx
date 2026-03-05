/**
 * POST /api/skills/register — Auto-register skills from a GitHub repo.
 *
 * Modes:
 * - { owner, repo, skill_path } → register single skill from subfolder
 * - { owner, repo, scan: true } → discover all SKILL.md files, register all
 * - { owner, repo } → backward compat: try root skill, fallback to scan
 */

import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { skills } from "~/lib/db/schema";
import { eq } from "drizzle-orm";
import { fetchGitHubSkill } from "~/lib/github/fetch-github-skill";
import { scanGitHubRepo } from "~/lib/github/scan-github-repo";
import { indexSkill } from "~/lib/vectorize/index-skill";
import { authenticateRequest } from "~/lib/auth/authenticate-request";
import { validateRepoOwnership } from "~/lib/github/validate-repo-ownership";
import { scanContent, sanitizeContent } from "~/lib/security/content-scanner";

const GITHUB_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

interface RegisterBody {
  owner?: string;
  repo?: string;
  skill_path?: string;
  scan?: boolean;
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;

    // Require authentication
    const auth = await authenticateRequest(request, env);
    if (!auth) {
      return Response.json(
        { error: "Authentication required. Use API key (Authorization: Bearer) or sign in." },
        { status: 401 },
      );
    }

    const body = (await request.json()) as RegisterBody;
    const { owner, repo, skill_path, scan } = body;

    if (!owner || !repo || !GITHUB_REPO_PATTERN.test(`${owner}/${repo}`)) {
      return Response.json(
        { error: "Valid owner and repo required (e.g. { owner: 'org', repo: 'name' })" },
        { status: 400 },
      );
    }

    // Validate skill_path if provided (prevent path traversal)
    if (skill_path) {
      if (skill_path.includes("..") || skill_path.startsWith("/") || !SAFE_PATH_PATTERN.test(skill_path)) {
        return Response.json(
          { error: "Invalid skill_path. Must be a relative path without '..' sequences." },
          { status: 400 },
        );
      }
    }

    // Validate GitHub repo ownership
    const db = getDb(env.DB);
    const ownership = await validateRepoOwnership(auth.userId, owner, repo, db);
    if (!ownership.valid) {
      return Response.json(
        { error: ownership.reason || "You do not have access to this repository." },
        { status: 403 },
      );
    }

    // Mode: specific skill_path → register single subfolder skill
    if (skill_path) {
      return registerSingleSkill(env, owner, repo, skill_path);
    }

    // Mode: scan → discover and register all SKILL.md skills
    if (scan) {
      return registerScannedSkills(env, owner, repo);
    }

    // Mode: backward compat — try root skill first
    return registerWithFallback(env, owner, repo);
  } catch (error) {
    return handleError(error);
  }
}

/** Register a single skill from a specific subfolder path */
async function registerSingleSkill(
  env: Env,
  owner: string,
  repo: string,
  skillPath: string,
): Promise<Response> {
  const ghSkill = await fetchGitHubSkill(owner, repo, skillPath);
  const db = getDb(env.DB);

  // Check if already exists
  const [existing] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, ghSkill.slug))
    .limit(1);

  if (existing) {
    return Response.json({ skill: existing, created: false });
  }

  const created = await insertAndIndexSkill(env, db, ghSkill);
  return Response.json({ skill: created, created: true });
}

/** Scan repo for all SKILL.md files, register all discovered skills */
async function registerScannedSkills(
  env: Env,
  owner: string,
  repo: string,
): Promise<Response> {
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

      // Check existing
      const [existing] = await db
        .select()
        .from(skills)
        .where(eq(skills.slug, ghSkill.slug))
        .limit(1);

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

/** Backward compat: try root skill first, fallback to scan */
async function registerWithFallback(
  env: Env,
  owner: string,
  repo: string,
): Promise<Response> {
  const db = getDb(env.DB);
  const rootSlug = `${owner}-${repo}`.toLowerCase();

  // Check if root slug already exists
  const [existing] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, rootSlug))
    .limit(1);

  if (existing) {
    return Response.json({ skill: existing, created: false });
  }

  // Try fetching as root-level skill
  try {
    const ghSkill = await fetchGitHubSkill(owner, repo);
    const created = await insertAndIndexSkill(env, db, ghSkill);
    return Response.json({ skill: created, created: true });
  } catch {
    // Root fetch failed — fallback to scan
    return registerScannedSkills(env, owner, repo);
  }
}

/** Insert a skill into D1 and index in Vectorize. Returns the inserted row. */
async function insertAndIndexSkill(
  env: Env,
  db: ReturnType<typeof getDb>,
  ghSkill: Awaited<ReturnType<typeof fetchGitHubSkill>>,
) {
  const skillId = crypto.randomUUID();
  const now = new Date();

  // Sanitize first, then scan the clean version so label reflects stored content
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
      `Vectorize indexing failed for ${ghSkill.slug}:`,
      vecError instanceof Error ? vecError.message : vecError,
    );
  }

  // Re-fetch inserted skill
  const [created] = await db
    .select()
    .from(skills)
    .where(eq(skills.slug, ghSkill.slug))
    .limit(1);

  return created;
}

function handleError(error: unknown): Response {
  const message = error instanceof Error ? error.message : "Unknown error";

  if (message.includes("not found")) {
    return Response.json({ error: message }, { status: 404 });
  }
  if (message.includes("rate limit")) {
    return Response.json({ error: message }, { status: 429 });
  }

  console.error("Skill register error:", error);
  return Response.json(
    { error: "Failed to register skill", details: message },
    { status: 500 },
  );
}
