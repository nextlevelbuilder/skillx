/**
 * In-memory stand-in for the Workers Rate Limiting binding: a fixed budget
 * of calls per key, with no window (tests drive the count directly).
 */
export class FakeRateLimiter {
  readonly counts = new Map<string, number>();
  failing = false;

  constructor(public budget: number) {}

  /** Same shape as `RateLimit.limit` of `env.RELEASE_READ_LIMITER`. */
  async limit({ key }: { key: string }): Promise<{ success: boolean }> {
    if (this.failing) throw new Error("rate limiter unavailable");
    const next = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, next);
    return { success: next <= this.budget };
  }
}
