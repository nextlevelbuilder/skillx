import { describe, expect, it } from "vitest";
import * as root from "../src/index";
import * as rules from "../src/rules";
import { LIMITS, treeDigest } from "../src/index";
import type { TreeFile } from "../src/index";
import { sha256Hex } from "../src/serialize";
// The release contract lives in @skillx/contracts, which depends on this package, so the
// guard that both packages agree on the tree imports it by path instead of by name.
import { RELEASE_TREE_LIMITS } from "../../contracts/src/release-manifest";
import vectorFile from "../../contracts/src/fixtures/release-manifest-v1.json";

interface ReleaseVector {
  name: string;
  manifest: { releaseDigest: string; files: TreeFile[]; fileCount: number; treeSize: number };
  fileContentsBase64: Record<string, string>;
}

const vectors = (vectorFile as unknown as { valid: ReleaseVector[] }).valid;

describe("skillx.release/v1 vectors against agentkit.skill-tree/v1", () => {
  it("has vectors to check", () => {
    expect(vectors.length).toBeGreaterThan(0);
  });

  it.each(vectors.map((v) => [v.name, v] as const))("%s: releaseDigest is the tree digest of its files", (_name, vector) => {
    const files: TreeFile[] = vector.manifest.files.map((f) => {
      const bytes = Buffer.from(vector.fileContentsBase64[f.path] ?? "", "base64");
      return { path: f.path, mode: f.mode, size: bytes.length, sha256: sha256Hex(bytes) };
    });
    expect(files).toEqual(vector.manifest.files);
    expect(treeDigest(files)).toBe(vector.manifest.releaseDigest);
    expect(vector.manifest.fileCount).toBe(files.length);
    expect(vector.manifest.treeSize).toBe(files.reduce((sum, f) => sum + f.size, 0));
  });

  it("keeps the release limits equal to the tree limits", () => {
    expect(RELEASE_TREE_LIMITS).toEqual({ maxFiles: LIMITS.maxFiles, maxFileSize: LIMITS.maxFileSize, maxTreeSize: LIMITS.maxTreeSize });
  });

  it("exposes the same rule implementations from the rules entry point", () => {
    expect(rules.validatePath).toBe(root.validatePath);
    expect(rules.checkPublisher).toBe(root.checkPublisher);
    expect(rules.foldKey).toBe(root.foldKey);
    expect(rules.SkillTreeError).toBe(root.SkillTreeError);
  });
});
