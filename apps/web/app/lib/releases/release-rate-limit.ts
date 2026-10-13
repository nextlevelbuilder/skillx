/**
 * Per-caller rate limit of the release read API through the Workers Rate
 * Limiting binding `RELEASE_READ_LIMITER` (`ratelimits` in wrangler.jsonc:
 * 300 requests per 60 seconds), keyed by the authenticated user or, for
 * anonymous callers, the client IP. The binding counts in memory at each
 * Cloudflare location, so the limit is per location and approximate; it
 * costs no KV or D1 write.
 *
 * A missing binding (local dev without it, a misconfigured deploy) or a
 * failing binding lets the request through and is logged once per isolate:
 * the limit protects cost, not confidentiality.
 */

/** Requests one caller may make per window; must match `ratelimits[].simple.limit` in wrangler.jsonc. */
export const RELEASE_READ_RATE_LIMIT = 300;
/** Window length in seconds; must match `ratelimits[].simple.period` in wrangler.jsonc (10 or 60). */
export const RELEASE_READ_RATE_WINDOW_SECONDS = 60;

const MAX_CALLER_LENGTH = 128;

/** The part of the Workers `RateLimit` binding this module uses. */
export interface ReleaseReadLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

let warnedUnavailable = false;

function warnOnce(message: string): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(`release read API: ${message}; rate limiting is off`);
}

/** Test hook: lets the next missing or failing binding log again. */
export function resetRateLimitWarning(): void {
  warnedUnavailable = false;
}

/** Rate-limit identity of a request: `user:<id>` when authenticated, else `ip:<client ip>`. */
export function rateLimitCaller(request: Request, userId: string | null): string {
  const caller = userId !== null ? `user:${userId}` : `ip:${request.headers.get("CF-Connecting-IP")?.trim() || "unknown"}`;
  return caller.slice(0, MAX_CALLER_LENGTH);
}

/**
 * Counts one request of `caller`. The binding does not say when the window
 * ends, so a refusal asks the caller to retry after one full window.
 */
export async function checkReleaseRateLimit(limiter: ReleaseReadLimiter | undefined, caller: string): Promise<RateLimitDecision> {
  if (limiter === undefined || typeof limiter.limit !== "function") {
    warnOnce("no RELEASE_READ_LIMITER binding");
    return { allowed: true };
  }
  try {
    const { success } = await limiter.limit({ key: caller });
    return success ? { allowed: true } : { allowed: false, retryAfterSeconds: RELEASE_READ_RATE_WINDOW_SECONDS };
  } catch (error) {
    warnOnce(`rate limit check failed (${error instanceof Error ? error.message : String(error)})`);
    return { allowed: true };
  }
}
