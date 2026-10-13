/**
 * An in-memory KVNamespace stand-in with the text get/put subset the release
 * read rate limit uses. `failing` makes every call throw, like a KV outage.
 */
export class FakeKV {
  readonly values = new Map<string, string>();
  failing = false;

  async get(key: string): Promise<string | null> {
    if (this.failing) throw new Error("KV unavailable");
    return this.values.get(key) ?? null;
  }

  async put(key: string, value: string, _options?: { expirationTtl?: number }): Promise<void> {
    if (this.failing) throw new Error("KV unavailable");
    this.values.set(key, value);
  }

  asKV(): KVNamespace {
    return this as unknown as KVNamespace;
  }
}
