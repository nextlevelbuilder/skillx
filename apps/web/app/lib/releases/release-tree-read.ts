/** Reading an uploaded release tar into its tree manifest and file contents, before anything is stored. */
import { ERROR_CODES, SkillTreeError, readTarTree } from "@skillx/skill-tree";
import type { TreeManifest } from "@skillx/skill-tree";
import { releaseError } from "./release-http";
import { RELEASE_SERVER_TREE_LIMITS } from "./release-limits";

export interface ReadTree {
  tree: TreeManifest;
  contents: Map<string, Uint8Array>;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/** Streams the uncompressed tar through the shared reader; every unsafe entry fails here, before storage. */
export async function readTree(body: Uint8Array): Promise<ReadTree> {
  const seen = new Map<string, Uint8Array>();
  try {
    const tree = await readTarTree(body, {
      compression: "none",
      limits: RELEASE_SERVER_TREE_LIMITS,
      onFileContent: (path, content) => void seen.set(path, content),
    });
    const contents = new Map<string, Uint8Array>();
    for (const file of tree.files) {
      const bytes = seen.get(file.path);
      if (bytes === undefined || bytes.length !== file.size) throw new Error(`tree reader lost the content of ${file.path}`);
      contents.set(file.path, bytes);
    }
    return { tree, contents };
  } catch (error) {
    if (!(error instanceof SkillTreeError)) throw error;
    throw releaseError(error.code === ERROR_CODES.limitExceeded ? 413 : 422, error.code, error.message);
  }
}
