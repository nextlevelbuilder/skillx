/**
 * An in-memory R2Bucket stand-in with the semantics the release path relies
 * on: `onlyIf` `If-None-Match: *` refuses to replace an object (put returns
 * null), and a `sha256` option is checked against the bytes. `holdPuts`
 * parks matching puts until N of them are waiting, to force a race.
 */
import { createHash } from "node:crypto";

interface Stored {
  bytes: Uint8Array;
  sha256: string;
  contentType?: string;
}

export class FakeR2 {
  readonly objects = new Map<string, Stored>();
  readonly putLog: string[] = [];
  private held: Array<() => void> = [];
  private hold: { prefix: string; count: number } | null = null;

  /** Parks puts under `prefix` until `count` are waiting, then releases them together. */
  holdPuts(prefix: string, count: number): void {
    this.hold = { prefix, count };
  }

  private async gate(key: string): Promise<void> {
    if (this.hold === null || !key.startsWith(this.hold.prefix)) return;
    await new Promise<void>((resolve) => {
      this.held.push(resolve);
      if (this.held.length >= this.hold!.count) {
        const release = this.held;
        this.held = [];
        this.hold = null;
        for (const resume of release) resume();
      }
    });
  }

  async put(key: string, value: Uint8Array, options: { onlyIf?: Headers; sha256?: string; httpMetadata?: { contentType?: string } } = {}) {
    await this.gate(key);
    this.putLog.push(key);
    const bytes = new Uint8Array(value);
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    if (options.sha256 !== undefined && options.sha256 !== sha256) throw new Error(`put ${key}: sha256 mismatch`);
    if (options.onlyIf?.get("If-None-Match") === "*" && this.objects.has(key)) return null;
    this.objects.set(key, { bytes, sha256, contentType: options.httpMetadata?.contentType });
    return { key, size: bytes.length };
  }

  async head(key: string) {
    const stored = this.objects.get(key);
    if (stored === undefined) return null;
    const checksum = Uint8Array.from(Buffer.from(stored.sha256, "hex"));
    return { key, size: stored.bytes.length, checksums: { sha256: checksum.buffer } };
  }

  async get(key: string) {
    const stored = this.objects.get(key);
    return stored === undefined ? null : { key, size: stored.bytes.length, bytes: stored.bytes };
  }

  keys(prefix = ""): string[] {
    return [...this.objects.keys()].filter((k) => k.startsWith(prefix)).sort();
  }

  asR2(): R2Bucket {
    return this as unknown as R2Bucket;
  }
}
