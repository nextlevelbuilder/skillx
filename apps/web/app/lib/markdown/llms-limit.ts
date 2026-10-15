/**
 * Bounds for the agent-facing text documents.
 *
 * The catalog holds six figures of skills, so a document that renders "everything"
 * is not an option: `llms-full.txt` would be megabytes and would have to be
 * rendered per request. Both documents therefore render a bounded slice and are
 * honest about it.
 *
 * `?limit=` selects one of a few fixed sizes rather than any number. Each size is
 * a separately cached document, so a free-form limit would let an anonymous
 * caller mint a new cache entry (and a fresh D1 read) per request. Snapping to an
 * allowlist keeps the cache to a handful of entries per document, and the cache
 * key is built from the snapped value, never from the raw parameter.
 *
 * Unusable input falls back to the default rather than erroring: a malformed
 * query parameter should not turn a readable document into a 400.
 */

export interface LlmsLimits {
  /** Allowed slice sizes, ascending. */
  sizes: readonly number[];
  fallback: number;
}

export const INDEX_LIMITS: LlmsLimits = { sizes: [100, 250, 500, 1000], fallback: 1000 };
export const FULL_LIMITS: LlmsLimits = { sizes: [25, 50, 100, 200], fallback: 100 };

export const LLMS_INDEX_MAX = INDEX_LIMITS.sizes[INDEX_LIMITS.sizes.length - 1];
export const LLMS_FULL_MAX = FULL_LIMITS.sizes[FULL_LIMITS.sizes.length - 1];

/**
 * Resolves a `?limit=` value to one of the allowed sizes.
 *
 * Absent, blank, non-numeric, and non-positive values yield the fallback. Any
 * other value snaps up to the smallest allowed size that holds it, and a value
 * above the largest size gets the largest. `Number` is used rather than
 * `parseInt` on purpose: `parseInt("1e9")` is `1`, which would hand a caller
 * asking for far more than the cap the smallest slice instead.
 */
export function parseLlmsLimit(raw: string | null | undefined, limits: LlmsLimits): number {
  const trimmed = raw?.trim();
  if (!trimmed) return limits.fallback;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return limits.fallback;

  const largest = limits.sizes[limits.sizes.length - 1];
  return limits.sizes.find((size) => size >= parsed) ?? largest;
}

/** KV key for one rendered document. Only normalized inputs reach it. */
export function llmsCacheKey(document: "llms-txt" | "llms-full-txt", origin: string, limit: number): string {
  return `${document}:v5:${origin}:${limit}`;
}
