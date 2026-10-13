/**
 * Per-caller rate limit of the release read API: a fixed-window counter in
 * Workers KV (binding `KV`), keyed by the authenticated user or, for
 * anonymous callers, the client IP.
 *
 * KV is eventually consistent and accepts about one write per second per
 * key, so the count is approximate under bursts and across locations. A KV
 * failure is logged and lets the request through: the limit protects cost,
 * not confidentiality, and Cloudflare's edge DDoS protection still applies.
 */

/** Requests one caller may make per window. */
export const RELEASE_READ_RATE_LIMIT = 300;
/** Window length; also the smallest TTL Workers KV accepts. */
export const RELEASE_READ_RATE_WINDOW_SECONDS = 60;

const MAX_CALLER_LENGTH = 128;

export type RateLimitDecision = { allowed: true } | { allowed: false; retryAfterSeconds: number };

/** Rate-limit identity of a request: `user:<id>` when authenticated, else `ip:<client ip>`. */
export function rateLimitCaller(request: Request, userId: string | null): string {
  const caller = userId !== null ? `user:${userId}` : `ip:${request.headers.get("CF-Connecting-IP")?.trim() || "unknown"}`;
  return caller.slice(0, MAX_CALLER_LENGTH);
}

/** KV key of the counter of `caller` in the window containing `nowMs`. */
export function rateLimitKey(caller: string, nowMs: number): string {
  return `releases-read-rl:${caller}:${Math.floor(nowMs / 1000 / RELEASE_READ_RATE_WINDOW_SECONDS)}`;
}

/** Counts one request of `caller`; refuses it once the window already holds `limit` requests. */
export async function checkReleaseRateLimit(
  kv: KVNamespace | undefined,
  caller: string,
  limit = RELEASE_READ_RATE_LIMIT,
  nowMs = Date.now(),
): Promise<RateLimitDecision> {
  if (kv === undefined) {
    console.warn("release read API: no KV binding; rate limiting is off");
    return { allowed: true };
  }
  const key = rateLimitKey(caller, nowMs);
  const windowEndSeconds = (Math.floor(nowMs / 1000 / RELEASE_READ_RATE_WINDOW_SECONDS) + 1) * RELEASE_READ_RATE_WINDOW_SECONDS;
  try {
    const count = Number.parseInt((await kv.get(key)) ?? "0", 10) || 0;
    if (count >= limit) {
      return { allowed: false, retryAfterSeconds: Math.max(1, windowEndSeconds - Math.floor(nowMs / 1000)) };
    }
    await kv.put(key, String(count + 1), { expirationTtl: RELEASE_READ_RATE_WINDOW_SECONDS * 2 });
    return { allowed: true };
  } catch (error) {
    console.warn("release read API: rate limit check failed:", error instanceof Error ? error.message : String(error));
    return { allowed: true };
  }
}
