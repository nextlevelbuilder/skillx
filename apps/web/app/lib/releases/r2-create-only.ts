/**
 * Create-only, content-addressed R2 writes for releases. Every key ends in
 * the SHA-256 of its bytes, every put carries that SHA-256 so R2 rejects a
 * corrupted upload, and `If-None-Match: *` makes R2 refuse to replace an
 * existing object. An existing object under a content key therefore already
 * holds the same bytes; this module never overwrites or deletes.
 */

export const artifactKey = (hex: string) => `artifacts/sha256/${hex}.tar`;
export const blobKey = (hex: string) => `blobs/sha256/${hex}`;
export const manifestKey = (hex: string) => `manifests/sha256/${hex}.json`;
/** Signed skillx.release-status/v1 documents; each new one is a new object, so none is ever overwritten. */
export const statusKey = (hex: string) => `statuses/sha256/${hex}.json`;

const HEX64 = /^[0-9a-f]{64}$/;

export type CreateOnlyResult = "created" | "exists";

export interface CreateOnlyOptions {
  sha256Hex: string;
  contentType: string;
  /** Check size and stored checksum of an object that already exists. */
  verifyExisting?: boolean;
}

function hexOf(buffer: ArrayBuffer): string {
  return Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function putCreateOnly(bucket: R2Bucket, key: string, bytes: Uint8Array, options: CreateOnlyOptions): Promise<CreateOnlyResult> {
  if (!HEX64.test(options.sha256Hex)) throw new Error(`invalid sha256 for R2 key ${key}`);
  const stored = await bucket.put(key, bytes, {
    onlyIf: new Headers({ "If-None-Match": "*" }),
    sha256: options.sha256Hex,
    httpMetadata: { contentType: options.contentType },
  });
  if (stored !== null) return "created";
  if (!options.verifyExisting) return "exists";
  const existing = await bucket.head(key);
  if (existing === null) throw new Error(`R2 refused to create ${key} but no object exists`);
  const checksum = existing.checksums?.sha256;
  if (existing.size !== bytes.length || (checksum !== undefined && hexOf(checksum) !== options.sha256Hex)) {
    throw new Error(`R2 object ${key} exists with different content`);
  }
  return "exists";
}

/** Runs `task` over `items` with at most `limit` in flight; the first failure rejects. */
export async function forEachLimited<T>(items: readonly T[], limit: number, task: (item: T) => Promise<unknown>): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++]!;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
