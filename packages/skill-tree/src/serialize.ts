/**
 * Digest of `agentkit.skill-tree/v1` (contract 4.8): `sha256:` plus the hex
 * SHA-256 of the canonical serialization rendered by `tree-format.ts`.
 */
import { createHash } from "node:crypto";
import { serializeTree } from "./tree-format";
import type { TreeFile } from "./tree-format";

export {
  MODE_EXECUTABLE,
  MODE_REGULAR,
  MODE_SOURCE_ASSUMED,
  MODE_SOURCE_RECORDED,
  TREE_SCHEMA,
  compareUtf8,
  serializeTree,
  sortFiles,
} from "./tree-format";
export type { FileMode, ModeSource, TreeFile, TreeManifest } from "./tree-format";

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
