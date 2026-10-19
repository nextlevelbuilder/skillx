import { Command } from 'commander';
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { readTarTree } from '@skillx/skill-tree';
import { readGitPackSource } from '../lib/git-tree-tar.js';
import type { GitPackSource } from '../lib/git-tree-tar.js';
import { writeDeterministicTar } from '../lib/deterministic-tar.js';

export interface PackedRelease {
  /** Backed by a plain ArrayBuffer, so it is a valid fetch body. */
  tar: Uint8Array<ArrayBuffer>;
  /** agentkit.skill-tree/v1 digest of the files: the release identity the registry recomputes. */
  releaseDigest: string;
  /** sha256 of the tar bytes. */
  artifactDigest: string;
  commit: string;
  path: string;
  fileCount: number;
  treeSize: number;
  source: GitPackSource;
}

/**
 * Packs `<dir|git-ref>` into the deterministic release tar and reads it back
 * with the same tree reader the registry runs, so the printed `releaseDigest`
 * is the one the registry will compute (and any tree the registry would
 * reject fails here first).
 */
export async function packRelease(input: string, options: { packagePath?: string; cwd?: string } = {}): Promise<PackedRelease> {
  const source = readGitPackSource(input, options);
  const tar = writeDeterministicTar(source.files);
  const tree = await readTarTree(tar, { compression: 'none' });
  return {
    tar,
    releaseDigest: tree.digest,
    artifactDigest: `sha256:${createHash('sha256').update(tar).digest('hex')}`,
    commit: source.commit,
    path: source.path,
    fileCount: tree.files.length,
    treeSize: tree.files.reduce((sum, f) => sum + f.size, 0),
    source,
  };
}

/** Non-blocking notes about what the pack left out. */
export function warnPackNotes(packed: PackedRelease): void {
  if (packed.source.uncommitted.length > 0) {
    console.error(chalk.yellow(`warning: ${packed.source.uncommitted.length} uncommitted change(s) are not packed; the release uses commit ${packed.commit}`));
  }
  if (packed.source.excludedNoise.length > 0) {
    console.error(chalk.dim(`note: excluded ${packed.source.excludedNoise.length} noise file(s) (VCS metadata, caches, OS files)`));
  }
}

export function packSummary(packed: PackedRelease) {
  return {
    releaseDigest: packed.releaseDigest,
    artifactDigest: packed.artifactDigest,
    artifactSize: packed.tar.length,
    commit: packed.commit,
    path: packed.path,
    fileCount: packed.fileCount,
    treeSize: packed.treeSize,
  };
}

