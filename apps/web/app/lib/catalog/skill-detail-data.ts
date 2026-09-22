/**
 * Data loading for the skill detail page (SSR) and the detail API.
 *
 * Extracted from the route module to keep `skill-detail.tsx` within the project's
 * 200 LOC rule, and to keep the protected payload boundary in one place: the
 * resolver is applied here, so no route may forward `skills.content` directly.
 */

import type { CompatibilitySummary } from "@skillx/contracts";
import { getSession } from "~/lib/auth/session-helpers";
import {
  fetchSkillBySlug,
  fetchSkillReferences,
  fetchSkillReviews,
  fetchRatingSummary,
  fetchRatingBreakdown,
  fetchFavoriteCount,
  fetchUsageStats,
  fetchUserSkillData,
} from "~/lib/db/skill-detail-queries";
import type { Database } from "~/lib/db";
import { gateSkillRow } from "./protected-content";
import { summarizeRowRuntimes } from "~/lib/compatibility/catalog-compatibility";

type SkillRow = NonNullable<Awaited<ReturnType<typeof fetchSkillBySlug>>>;

/** Scripts as stored on the row and rendered by the SSR page. */
export interface StoredScript {
  name: string;
  command: string;
  url: string;
}

/**
 * Parses the persisted `skills.scripts` JSON.
 *
 * Distinct from the public DTO's `PublicScriptDto`: this mirrors the stored
 * shape (name/command/url) that the detail page renders.
 */
export function parseStoredScripts(scriptsJson: string | null | undefined): StoredScript[] {
  if (!scriptsJson) return [];
  try {
    const parsed: unknown = JSON.parse(scriptsJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is StoredScript =>
        typeof entry === "object" && entry !== null && typeof (entry as StoredScript).name === "string",
    );
  } catch {
    return [];
  }
}

export interface SkillDetailData {
  skill: Omit<SkillRow, "content"> & { content?: string };
  reviews: Awaited<ReturnType<typeof fetchSkillReviews>>;
  isFavorited: boolean;
  userRating: number | null;
  isAuthenticated: boolean;
  ratingSummary: Awaited<ReturnType<typeof fetchRatingSummary>>;
  ratingBreakdown: Awaited<ReturnType<typeof fetchRatingBreakdown>>;
  favoriteCount: number;
  usage: Awaited<ReturnType<typeof fetchUsageStats>>;
  references: Awaited<ReturnType<typeof fetchSkillReferences>>;
  scripts: StoredScript[];
  /**
   * Every runtime the listing declares. Empty when it declares none, which an
   * agent must read as "unknown", never as "works everywhere".
   */
  compatibility: CompatibilitySummary[];
}

export async function loadSkillDetailData(
  db: Database,
  env: Env,
  request: Request,
  slug: string,
): Promise<SkillDetailData> {
  const skill = await fetchSkillBySlug(db, slug);
  if (!skill) throw new Response("Skill not found", { status: 404 });

  const [reviews, ratingSummary, ratingBreakdown, favoriteCount, usage, session, references] =
    await Promise.all([
      fetchSkillReviews(db, skill.id),
      fetchRatingSummary(db, skill.id),
      fetchRatingBreakdown(db, skill.id),
      fetchFavoriteCount(db, skill.id),
      fetchUsageStats(db, skill.id),
      getSession(request, env),
      fetchSkillReferences(db, skill.id),
    ]);

  const userData = session?.user?.id
    ? await fetchUserSkillData(db, session.user.id, skill.id)
    : { isFavorited: false, userRating: null };

  // Protected payload boundary: free/public listings keep their payload so the
  // page is unchanged; a protected listing is never handed a payload here.
  const skillView = gateSkillRow(skill, session?.user?.id ?? null);

  return {
    skill: skillView,
    reviews,
    ...userData,
    isAuthenticated: !!session?.user?.id,
    ratingSummary,
    ratingBreakdown,
    favoriteCount,
    usage,
    references,
    scripts: parseStoredScripts(skill.scripts),
    compatibility: summarizeRowRuntimes(skill),
  };
}
