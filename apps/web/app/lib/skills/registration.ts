import { identityKey, pickSlug } from "@skillx/skill-identity";

/** `owner/repo`, as GitHub spells it. */
export const GITHUB_REPO_PATTERN = /^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._-]+$/;

/** Identity columns of a stored skill. */
export interface SkillSourceRef {
  id: string;
  slug: string;
  source_repo: string | null;
  source_path: string | null;
}

export interface RegistrationDecision {
  action: "existing" | "create";
  slug: string;
  source_repo: string;
  source_path: string;
  existingId?: string;
}

export interface RegistrationPlanInput {
  owner: string;
  repo: string;
  /** Full path of the skill inside the repo; "" for a repo-root skill. */
  sourcePath: string;
  /** Readable slug produced by the GitHub fetch. */
  slugBase: string;
  /** Row already registered for this identity, when one exists. */
  existing?: SkillSourceRef | null;
  /** Slugs already claimed by any skill or legacy alias. */
  takenSlugs: Set<string>;
}

/**
 * Decide what registration does with a fetched skill.
 *
 * Identity is `(owner/repo, full path inside the repo)`, never the display name. A second skill
 * with the same folder name in the same repository is therefore a different skill: it gets its
 * own canonical slug instead of being reported as "existing" and skipped.
 */
export function planRegistration({
  owner,
  repo,
  sourcePath,
  slugBase,
  existing = null,
  takenSlugs,
}: RegistrationPlanInput): RegistrationDecision {
  const sourceRepo = `${owner}/${repo}`;

  if (existing) {
    return {
      action: "existing",
      slug: existing.slug,
      source_repo: existing.source_repo ?? sourceRepo,
      source_path: existing.source_path ?? sourcePath,
      existingId: existing.id,
    };
  }

  return {
    action: "create",
    slug: pickSlug(slugBase, identityKey(sourceRepo, sourcePath), takenSlugs),
    source_repo: sourceRepo.toLowerCase(),
    source_path: sourcePath,
  };
}
