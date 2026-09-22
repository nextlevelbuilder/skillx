/**
 * Bounds for the agent-facing text documents.
 *
 * The catalog holds six figures of skills, so a document that renders "everything"
 * is not an option: `llms-full.txt` would be megabytes and would have to be
 * rendered per request. Both documents therefore default to a bounded slice and
 * are honest about it, and `?limit=` lets an agent take a larger or smaller slice
 * without a deployment.
 *
 * Unusable input falls back to the default rather than erroring. A malformed
 * query parameter should not turn a readable document into a 400, and silently
 * clamping to something surprising would be worse than the default.
 */

export const LLMS_INDEX_DEFAULT = 1000;
export const LLMS_INDEX_MAX = 5000;
export const LLMS_FULL_DEFAULT = 200;
export const LLMS_FULL_MAX = 1000;

export interface LlmsLimits {
  fallback: number;
  max: number;
}

export const INDEX_LIMITS: LlmsLimits = { fallback: LLMS_INDEX_DEFAULT, max: LLMS_INDEX_MAX };
export const FULL_LIMITS: LlmsLimits = { fallback: LLMS_FULL_DEFAULT, max: LLMS_FULL_MAX };

/**
 * Resolves a `?limit=` value to a usable count.
 *
 * Absent, blank, non-numeric, and non-positive values all yield the fallback; a
 * value above the cap is clamped to the cap. The cap exists because the document
 * is rendered and cached as one string.
 *
 * `Number` is used rather than `parseInt` on purpose: `parseInt("1e9")` is `1`, so a
 * caller asking for far more than the cap would silently receive less than the
 * default. Clamping honours the magnitude the caller asked for.
 */
export function parseLlmsLimit(raw: string | null | undefined, limits: LlmsLimits): number {
  const trimmed = raw?.trim();
  if (!trimmed) return limits.fallback;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return limits.fallback;

  return Math.min(Math.floor(parsed), limits.max);
}
