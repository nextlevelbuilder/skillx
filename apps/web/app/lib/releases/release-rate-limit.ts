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
 * the read limit protects cost, not confidentiality. A caller may ask to fail
 * closed instead (`failClosed`), as the state write routes do for accounts.
 */

/** Requests one caller may make per window; must match `ratelimits[].simple.limit` in wrangler.jsonc. */
export const RELEASE_READ_RATE_LIMIT = 300;
/** Window length in seconds; must match `ratelimits[].simple.period` in wrangler.jsonc (10 or 60). */
export const RELEASE_READ_RATE_WINDOW_SECONDS = 60;

/**
 * Per-caller limit of the release state write routes through the separate
 * binding `RELEASE_WRITE_LIMITER` (30 requests per 60 seconds). Every write
 * appends an audit row, so it is much tighter than the read limit; keep it in
 * sync with `ratelimits[]` in wrangler.jsonc.
 */
export const RELEASE_WRITE_RATE_LIMIT = 30;
export const RELEASE_WRITE_RATE_WINDOW_SECONDS = 60;

const MAX_CALLER_LENGTH = 128;

/** The part of the Workers `RateLimit` binding this module uses. */
export interface ReleaseReadLimiter {
  limit(options: { key: string }): Promise<{ success: boolean }>;
}

/** `unavailable` marks a refusal because a fail-closed limiter is missing or failing. */
export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number; unavailable?: true };

export interface RateLimitOptions {
  /** Binding name used in the log line. */
  binding?: string;
  /** Window length in seconds, sent as the retry delay of a refusal. */
  windowSeconds?: number;
  /** Refuse instead of letting the request through when the binding is missing or failing. */
  failClosed?: boolean;
}

let warnedUnavailable = false;

function warnOnce(message: string, failClosed: boolean): void {
  if (warnedUnavailable) return;
  warnedUnavailable = true;
  console.warn(`release API: ${message}; ${failClosed ? "requests are refused" : "rate limiting is off"}`);
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
export async function checkReleaseRateLimit(
  limiter: ReleaseReadLimiter | undefined,
  caller: string,
  options: RateLimitOptions = {},
): Promise<RateLimitDecision> {
  const { binding = "RELEASE_READ_LIMITER", windowSeconds = RELEASE_READ_RATE_WINDOW_SECONDS, failClosed = false } = options;
  const unavailable = (message: string): RateLimitDecision => {
    warnOnce(message, failClosed);
    return failClosed ? { allowed: false, retryAfterSeconds: windowSeconds, unavailable: true } : { allowed: true };
  };
  if (limiter === undefined || typeof limiter.limit !== "function") return unavailable(`no ${binding} binding`);
  try {
    const { success } = await limiter.limit({ key: caller });
    return success ? { allowed: true } : { allowed: false, retryAfterSeconds: windowSeconds };
  } catch (error) {
    return unavailable(`${binding} check failed (${error instanceof Error ? error.message : String(error)})`);
  }
}
