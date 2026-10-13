/**
 * Canonical serialization and digest of `agentkit.skill-tree/v1` (contract
 * 4.8): a header line, then one `<mode> <sha256> <size> <path>` line per file,
 * sorted by the raw UTF-8 bytes of the path. The tree digest is `sha256:`
 * plus the hex SHA-256 of the whole serialization.
 */
import { createHash } from "node:crypto";

export const TREE_SCHEMA = "agentkit.skill-tree/v1";

export const MODE_REGULAR = "100644";
export const MODE_EXECUTABLE = "100755";
export type FileMode = typeof MODE_REGULAR | typeof MODE_EXECUTABLE;

export const MODE_SOURCE_RECORDED = "recorded";
export const MODE_SOURCE_ASSUMED = "assumed";
export type ModeSource = typeof MODE_SOURCE_RECORDED | typeof MODE_SOURCE_ASSUMED;

/** One regular file of a tree. `sha256` is the lowercase hex digest of its content. */
export interface TreeFile {
  path: string;
  mode: FileMode;
  size: number;
  sha256: string;
}

/** The tree manifest; `files` are sorted by raw UTF-8 path bytes. */
export interface TreeManifest {
  schema: typeof TREE_SCHEMA;
  digest: string;
  modeSource: ModeSource;
  files: TreeFile[];
}

/**
 * Compares two well-formed strings by their UTF-8 bytes, which is code point
 * order (UTF-16 code unit order differs above U+FFFF).
 */
export function compareUtf8(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ca = ia.next();
    const cb = ib.next();
    if (ca.done || cb.done) return ca.done && cb.done ? 0 : ca.done ? -1 : 1;
    const diff = ca.value.codePointAt(0)! - cb.value.codePointAt(0)!;
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
}

export function sortFiles<T extends { path: string }>(files: readonly T[]): T[] {
  return [...files].sort((a, b) => compareUtf8(a.path, b.path));
}

/**
 * Renders the canonical serialization. Only a validated file set, whose
 * paths are unique, has a defined serialization.
 */
export function serializeTree(files: readonly TreeFile[]): string {
  let out = `${TREE_SCHEMA}\n`;
  for (const f of sortFiles(files)) out += `${f.mode} ${f.sha256} ${f.size} ${f.path}\n`;
  return out;
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash("sha256").update(data).digest("hex");
}

/** `sha256:<hex>` over the canonical serialization of `files`. */
export function treeDigest(files: readonly TreeFile[]): string {
  return `sha256:${sha256Hex(serializeTree(files))}`;
}

/** An incremental SHA-256, for hashing file content as it streams. */
export interface StreamingHash {
  update(chunk: Uint8Array): void;
  hex(): string;
}

export function createSha256(): StreamingHash {
  const hash = createHash("sha256");
  return {
    update: (chunk) => void hash.update(chunk),
    hex: () => hash.digest("hex"),
  };
}
