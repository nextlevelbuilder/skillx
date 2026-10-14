/**
 * In-memory trees of the personal-kit engine. A base tree is a release's
 * file list plus a byte reader (the caller verifies bytes against
 * `sha256`); a composed tree keeps the bytes an overlay produced and reads
 * every other file from its base. The digest of any tree is the
 * `agentkit.skill-tree/v1` digest of its file list, so `compositionDigest`
 * of an empty overlay equals the base `treeDigest`.
 */
import { checkCollisions, checkFileDirs, compareUtf8, serializeTree } from "@skillx/skill-tree/rules";
import type { FileMode } from "@skillx/skill-tree/rules";
import { RELEASE_TREE_LIMITS } from "../release-manifest";
import { kitError } from "./codes";
import { sha256Hex, utf8 } from "./bytes";

export interface KitTreeFile {
  path: string;
  mode: FileMode;
  size: number;
  /** Lowercase hex SHA-256 of the content. */
  sha256: string;
}

export interface KitTree {
  /** `sha256:<hex>` tree digest of `files`. */
  digest: string;
  /** Sorted by the raw UTF-8 bytes of `path`. */
  files: readonly KitTreeFile[];
  /** Verified bytes of one file of `files`. */
  read(path: string): Promise<Uint8Array>;
  /** Release-declared script paths, when known. */
  declaredScripts?: readonly string[];
}

/** The `agentkit.skill-tree/v1` digest of a file list (sorted here). */
export async function kitTreeDigest(files: readonly KitTreeFile[]): Promise<string> {
  const sorted = [...files].sort((a, b) => compareUtf8(a.path, b.path));
  return `sha256:${await sha256Hex(utf8(serializeTree(sorted)))}`;
}

/** Contract 4 checks a composed file list must pass: limits, file/directory clashes, case collisions, non-empty. */
export function checkComposedFiles(files: readonly KitTreeFile[]): void {
  if (files.length === 0) throw kitError("tree.empty", "", "the composition contains no files");
  if (files.length > RELEASE_TREE_LIMITS.maxFiles) throw kitError("tree.limit_exceeded", "", `composition has more than ${RELEASE_TREE_LIMITS.maxFiles} files`);
  let total = 0;
  for (const f of files) {
    if (f.size > RELEASE_TREE_LIMITS.maxFileSize) throw kitError("tree.limit_exceeded", f.path, "file exceeds 32 MiB");
    total += f.size;
  }
  if (total > RELEASE_TREE_LIMITS.maxTreeSize) throw kitError("tree.limit_exceeded", "", "composition exceeds 256 MiB");
  const paths = files.map((f) => f.path);
  const failure = checkFileDirs(paths, []) ?? checkCollisions(paths, []);
  if (failure !== null) throw kitError(failure.code, failure.path, failure.detail);
}

/** A tree held fully in memory (tests, fixtures, small compositions). */
export async function memoryTree(entries: ReadonlyArray<{ path: string; text?: string; bytes?: Uint8Array; mode?: FileMode }>): Promise<KitTree> {
  const bytesByPath = new Map<string, Uint8Array>();
  const files: KitTreeFile[] = [];
  for (const e of entries) {
    const bytes = e.bytes ?? utf8(e.text ?? "");
    bytesByPath.set(e.path, bytes);
    files.push({ path: e.path, mode: e.mode ?? "100644", size: bytes.length, sha256: await sha256Hex(bytes) });
  }
  files.sort((a, b) => compareUtf8(a.path, b.path));
  return {
    digest: await kitTreeDigest(files),
    files,
    read: async (path) => {
      const bytes = bytesByPath.get(path);
      if (bytes === undefined) throw kitError("tree.read_failed", path, "no such file");
      return bytes;
    },
  };
}

export const fileMap = (tree: KitTree) => new Map(tree.files.map((f) => [f.path, f]));
