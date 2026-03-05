/**
 * Validate that an authenticated user has access to a GitHub repository.
 * Uses the user's GitHub OAuth access token from Better Auth account table.
 */

import { getDb } from "~/lib/db";
import { account } from "~/lib/db/schema";
import { eq, and } from "drizzle-orm";

interface OwnershipResult {
  valid: boolean;
  reason?: string;
}

export async function validateRepoOwnership(
  userId: string,
  owner: string,
  repo: string,
  db: ReturnType<typeof getDb>,
): Promise<OwnershipResult> {
  // Look up GitHub account for this user
  const [ghAccount] = await db
    .select()
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "github")))
    .limit(1);

  if (!ghAccount || !ghAccount.accessToken) {
    return {
      valid: false,
      reason: "No GitHub account linked. Please sign in with GitHub first.",
    };
  }

  const githubUsername = ghAccount.accountId;

  // Check if token might be expired
  if (ghAccount.accessTokenExpiresAt) {
    const expiresAt = new Date(ghAccount.accessTokenExpiresAt);
    if (expiresAt < new Date()) {
      return {
        valid: false,
        reason: "GitHub token expired. Please re-login with GitHub at https://skillx.sh/settings",
      };
    }
  }

  // Check if user is owner (fast path — username matches repo owner)
  if (githubUsername.toLowerCase() === owner.toLowerCase()) {
    return { valid: true };
  }

  // Check collaborator permission level via GitHub API (require write access)
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/collaborators/${githubUsername}/permission`,
      {
        headers: {
          Authorization: `token ${ghAccount.accessToken}`,
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "SkillX/1.0",
        },
      },
    );

    if (res.status === 401) {
      return {
        valid: false,
        reason: "GitHub token expired. Please re-login with GitHub at https://skillx.sh/settings",
      };
    }

    if (res.status === 404) {
      return {
        valid: false,
        reason: `User "${githubUsername}" does not have access to ${owner}/${repo}.`,
      };
    }

    if (res.status === 403) {
      return {
        valid: false,
        reason: "GitHub token lacks permissions. Please re-login with GitHub.",
      };
    }

    if (res.ok) {
      const data = (await res.json()) as { permission: string };
      const allowed = ["admin", "write"];
      if (allowed.includes(data.permission)) {
        return { valid: true };
      }
      return {
        valid: false,
        reason: `User "${githubUsername}" has "${data.permission}" access to ${owner}/${repo}. Write access required to publish.`,
      };
    }

    return {
      valid: false,
      reason: `GitHub API returned ${res.status} when checking repo access.`,
    };
  } catch (error) {
    return {
      valid: false,
      reason: `Failed to verify repo ownership: ${error instanceof Error ? error.message : "unknown error"}`,
    };
  }
}
