/**
 * Collects the entries an archive reader presents, enforcing the contract
 * limits while content streams (contract 4.6): bytes are counted as they are
 * read, header sizes are never trusted, and reading stops at the first limit.
 */
import { ERROR_CODES, treeError } from "./errors";
import { createSha256 } from "./serialize";
import type { TreeManifest } from "./serialize";
import { LIMITS, buildTree } from "./tree";
import type { TreeEntry, TreeLimits } from "./tree";

export class EntryCollector {
  readonly entries: TreeEntry[] = [];
  private listed = 0;
  private files = 0;
  private total = 0;

  constructor(private readonly limits: TreeLimits = LIMITS) {}

  /** Counts one presented entry of any kind toward the entry limit. */
  present(): void {
    if (++this.listed > this.limits.maxEntries) {
      throw treeError(ERROR_CODES.limitExceeded, "", `archive has more than ${this.limits.maxEntries} entries`);
    }
  }

  /** Hashes one regular file's content as it streams, counting it toward the file and byte limits. */
  async hashFile(path: string, content: AsyncIterable<Uint8Array>): Promise<{ size: number; sha256: string }> {
    if (++this.files > this.limits.maxFiles) {
      throw treeError(ERROR_CODES.limitExceeded, path, `tree has more than ${this.limits.maxFiles} files`);
    }
    const hash = createSha256();
    let size = 0;
    for await (const chunk of content) {
      size += chunk.length;
      this.total += chunk.length;
      if (size > this.limits.maxFileSize) {
        throw treeError(ERROR_CODES.limitExceeded, path, `file exceeds ${this.limits.maxFileSize} bytes`);
      }
      if (this.total > this.limits.maxTreeSize) {
        throw treeError(ERROR_CODES.limitExceeded, path, `tree exceeds ${this.limits.maxTreeSize} bytes`);
      }
      hash.update(chunk);
    }
    return { size, sha256: hash.hex() };
  }

  add(entry: TreeEntry): void {
    this.entries.push(entry);
  }

  build(): TreeManifest {
    return buildTree(this.entries, { listed: this.listed, limits: this.limits });
  }
}

const utf8Strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
const utf8Lossy = new TextDecoder("utf-8", { ignoreBOM: true });

/**
 * Decodes raw entry name bytes. Invalid UTF-8 (including WTF-8 surrogates)
 * is never repaired: the lossy text only serves noise matching and messages,
 * and the entry fails with `tree.unsafe_path`.
 */
export function decodeName(raw: Uint8Array): { path: string; utf8Valid: boolean } {
  try {
    return { path: utf8Strict.decode(raw), utf8Valid: true };
  } catch {
    return { path: utf8Lossy.decode(raw), utf8Valid: false };
  }
}
