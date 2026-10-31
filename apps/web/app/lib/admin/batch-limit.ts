/**
 * Bounds for the `batch` query parameter on the admin endpoints.
 *
 * `batch` reaches `.limit()` on a D1 query, so an unbounded value both wastes a
 * Worker CPU budget and lets one request ask for an arbitrarily large result.
 * A value of `0` is worse than useless: `LIMIT 0` returns an empty batch, the
 * completion test `batch.length < batchSize` is false, and the `all=true` loop
 * keeps re-reading the same offset until `MAX_BATCHES_PER_REQUEST` runs out.
 *
 * Only positive integers are accepted. Anything absent, blank, non-numeric, or
 * below 1 yields the fallback; anything above the cap is clamped to the cap.
 */

export interface BatchLimit {
  /** Largest accepted batch size. */
  max: number;
  /** Value used when the parameter is absent or unusable. */
  fallback: number;
}

export const RECOMPUTE_BATCH_LIMIT: BatchLimit = { max: 500, fallback: 100 };

/**
 * Resolves a raw `batch` value to a usable batch size.
 *
 * `Number` is used rather than `parseInt` so a value like `"1e9"` is read as a
 * magnitude and clamped, instead of being truncated to `1` by `parseInt`. The
 * result is floored to an integer because `.limit()` requires one.
 */
export function parseBatchSize(
  raw: string | null | undefined,
  limits: BatchLimit = RECOMPUTE_BATCH_LIMIT,
): number {
  if (raw == null) return limits.fallback;
  const trimmed = raw.trim();
  if (trimmed === "") return limits.fallback;

  const value = Number(trimmed);
  if (!Number.isFinite(value)) return limits.fallback;

  const floored = Math.floor(value);
  if (floored < 1) return limits.fallback;
  if (floored > limits.max) return limits.max;
  return floored;
}
