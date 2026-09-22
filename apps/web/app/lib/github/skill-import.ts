/**
 * GitHub → SkillX listing import (the `import` operation, not `publish`).
 *
 * Orchestrates the import modes and gates every row it returns. Free and public
 * listings keep their payload because the `skillx use` CLI prints `content` from
 * this response; a protected listing never has a payload echoed back.
 */

import { getDb } from "~/lib/db";
import { fetchGitHubSkill } from "~/lib/github/fetch-github-skill";
import { scanGitHubRepo } from "~/lib/github/scan-github-repo";
import { gateSkillRow } from "~/lib/catalog/protected-content";
import { findSkillBySource } from "~/lib/db/skill-aliases";
import { planRegistration } from "~/lib/skills/registration";
import { loadClaimedSlugs } from "~/lib/skills/register-skill";
import { insertAndIndexSkill } from "./skill-insert";

/** The fields this response carries; `skillx use` reads all of them. */
interface ImportedRow {
  id: string;
  slug: string;
  name: string;
  author: string;
  is_paid: boolean | null;
  content: string;
}

/**
 * Import confirmation.
 *
 * `skillx use owner/repo/skill` (three-part) and the root-skill fallback consume
 * this as the import result and print `content`, so a free/public listing MUST
 * keep its payload — that is a named consumer contract, not a leak. The row is
 * still passed through the protected payload boundary, so a protected listing
 * would not have its payload echoed here.
 */
export function importConfirmation(
  row: ImportedRow | undefined,
  created: boolean,
  userId: string | null = null,
): Response {
  if (!row) {
    // The post-insert re-fetch failed; report the write without echoing a row.
    return Response.json({ skill: null, created });
  }
  return Response.json({ skill: gateSkillRow(row, userId), created });
}

/** Import a single listing from a specific subfolder path. */
async function registerSingleSkill(
  env: Env,
  owner: string,
  repo: string,
  skillPath: string,
  userId: string | null,
): Promise<Response> {
  const ghSkill = await fetchGitHubSkill(owner, repo, skillPath);
  const db = getDb(env.DB);

  // Identity, not the display name: two skills that share a folder name inside one repository are
  // two listings, so a stored row only short-circuits the import when repository AND path match.
  const existing = await findSkillBySource(db, ghSkill.source_repo, ghSkill.source_path);
  if (existing) return importConfirmation(existing, false, userId);

  const decision = planRegistration({
    owner,
    repo,
    sourcePath: ghSkill.source_path,
    slugBase: ghSkill.slug,
    existing,
    takenSlugs: await loadClaimedSlugs(db, ghSkill.slug),
  });

  const created = await insertAndIndexSkill(env, db, ghSkill, decision.slug);
  return importConfirmation(created, true, userId);
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

      const existing = await findSkillBySource(db, ghSkill.source_repo, ghSkill.source_path);
      if (existing) {
        registeredSkills.push({ slug: existing.slug, name: existing.name, author: existing.author });
        skipped++;
        continue;
      }

      const decision = planRegistration({
        owner,
        repo,
        sourcePath: ghSkill.source_path,
        slugBase: ghSkill.slug,
        existing,
        takenSlugs: await loadClaimedSlugs(db, ghSkill.slug),
      });
      const created = await insertAndIndexSkill(env, db, ghSkill, decision.slug);
      registeredSkills.push({ slug: created.slug, name: created.name, author: created.author });
      registered++;
    } catch (err) {
      console.warn(`Skipping skill ${disc.skillName}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return Response.json({ skills: registeredSkills, registered, skipped });
}

/** Backward compat: try a root-level skill first, then fall back to a scan. */
async function registerWithFallback(
  env: Env,
  owner: string,
  repo: string,
  userId: string | null,
): Promise<Response> {
  const db = getDb(env.DB);

  // A root-level skill is stored with an empty path, which is what the writer uses for repo root.
  const existing = await findSkillBySource(db, `${owner}/${repo}`.toLowerCase(), "");
  if (existing) return importConfirmation(existing, false, userId);

  try {
    const ghSkill = await fetchGitHubSkill(owner, repo);
    const decision = planRegistration({
      owner,
      repo,
      sourcePath: ghSkill.source_path,
      slugBase: ghSkill.slug,
      existing: null,
      takenSlugs: await loadClaimedSlugs(db, ghSkill.slug),
    });
    const created = await insertAndIndexSkill(env, db, ghSkill, decision.slug);
    return importConfirmation(created, true, userId);
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
  userId: string | null = null,
): Promise<Response> {
  switch (request.mode) {
    case "single":
      return registerSingleSkill(env, owner, repo, request.skillPath, userId);
    case "scan":
      return registerScannedSkills(env, owner, repo);
    default:
      return registerWithFallback(env, owner, repo, userId);
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
