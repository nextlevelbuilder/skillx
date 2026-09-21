/**
 * POST /api/skills/register — Import listings from a GitHub repo.
 *
 * This is the **import** operation: it harvests existing SKILL.md content into
 * the catalog as listings. It does not create immutable releases (that is
 * `publish`, which arrives in Phase 2).
 *
 * Modes:
 * - { owner, repo, skill_path } → import a single skill from a subfolder
 * - { owner, repo, scan: true } → discover all SKILL.md files and import them
 * - { owner, repo } → backward compat: try root skill first, then scan
 *
 * The import mechanics live in `~/lib/github/skill-import`.
 */

import type { ActionFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { authenticateRequest } from "~/lib/auth/authenticate-request";
import { validateRepoOwnership } from "~/lib/github/validate-repo-ownership";
import { handleRegisterError, runImport } from "~/lib/github/skill-import";
import type { RegisterMode } from "~/lib/github/skill-import";

const GITHUB_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;
const SAFE_PATH_PATTERN = /^[a-zA-Z0-9._\-/]+$/;

interface RegisterBody {
  owner?: string;
  repo?: string;
  skill_path?: string;
  scan?: boolean;
}

function wantsScan(body: RegisterBody): boolean {
  return body.scan === true;
}

/** Chooses the import mode once `skill_path` and `scan` have been validated. */
function resolveMode(body: RegisterBody): RegisterMode {
  if (body.skill_path) return { mode: "single", skillPath: body.skill_path };
  if (wantsScan(body)) return { mode: "scan" };
  return { mode: "fallback" };
}

function isSafeSkillPath(skillPath: string): boolean {
  return (
    !skillPath.includes("..") &&
    !skillPath.startsWith("/") &&
    SAFE_PATH_PATTERN.test(skillPath)
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  try {
    const env = context.cloudflare.env as Env;

    const auth = await authenticateRequest(request, env);
    if (!auth) {
      return Response.json(
        { error: "Authentication required. Use API key (Authorization: Bearer) or sign in." },
        { status: 401 },
      );
    }

    // SAFETY: request bodies are untrusted; every field is validated below.
    const body = (await request.json()) as RegisterBody;
    const { owner, repo, skill_path } = body;

    if (!owner || !repo || !GITHUB_REPO_PATTERN.test(`${owner}/${repo}`)) {
      return Response.json(
        { error: "Valid owner and repo required (e.g. { owner: 'org', repo: 'name' })" },
        { status: 400 },
      );
    }

    // Prevent path traversal in skill_path
    if (skill_path && !isSafeSkillPath(skill_path)) {
      return Response.json(
        { error: "Invalid skill_path. Must be a relative path without '..' sequences." },
        { status: 400 },
      );
    }

    const ownership = await validateRepoOwnership(auth.userId, owner, repo, getDb(env.DB));
    if (!ownership.valid) {
      return Response.json(
        { error: ownership.reason || "You do not have access to this repository." },
        { status: 403 },
      );
    }

    return runImport(env, owner, repo, resolveMode(body), auth.userId);
  } catch (error) {
    return handleRegisterError(error);
  }
}
