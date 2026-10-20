import { lstatSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { sha256Hex } from './fetch-verify.js';
import { deleteReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { containedPath, isRealDir, linkFreeParents } from './safe-fs.js';

/**
 * Removes a skill directory with proof of ownership: a file is deleted only
 * when its receipt lists it, its current SHA-256 still equals the receipt's,
 * and no directory on its way (the skill directory included) is a symlink or
 * junction. Links are never followed: a linked skill directory is left alone
 * entirely and reported as unknown (`.`), a linked subdirectory keeps every
 * receipt file below it. Changed and unlisted files are kept and reported;
 * directories are removed only when they end up empty. The receipt goes last,
 * so a crash midway leaves a receipt and a rerun finishes the job.
 */

export interface RemoveResult {
  alias: string;
  removed: string[];
  /** Owned files changed locally, or reachable only through a link: kept. */
  keptModified: string[];
  /** Files the receipt never listed (`.` when the skill directory itself is a link): kept. */
  keptUnknown: string[];
}

/** SHA-256 of a regular file; '' for anything else; null when nothing is there. */
function currentSha(path: string): string | null {
  try {
    const stat = lstatSync(path);
    return stat.isFile() ? sha256Hex(readFileSync(path)) : '';
  } catch {
    return null;
  }
}

function pruneEmptyDirs(root: string, from: string): void {
  let dir = from;
  while (dir.startsWith(root) && dir.length >= root.length) {
    if (!isRealDir(dir)) return;
    try {
      if (readdirSync(dir).length > 0) return;
      rmdirSync(dir);
    } catch {
      return;
    }
    if (dir === root) return;
    dir = dirname(dir);
  }
}

/** Every non-directory entry under `root`; links are listed, never entered. */
function listFiles(root: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      const path = join(dir, name);
      if (isRealDir(path)) walk(path);
      else out.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

export function removeOwned(home: string, runtime: string, skillsDir: string, receipt: InstallReceipt): RemoveResult {
  const root = join(skillsDir, receipt.alias);
  const result: RemoveResult = { alias: receipt.alias, removed: [], keptModified: [], keptUnknown: [] };
  let rootPresent = true;
  try {
    lstatSync(root);
  } catch {
    rootPresent = false;
  }
  if (rootPresent && !isRealDir(root)) {
    result.keptUnknown = ['.'];
    deleteReceipt(home, runtime, receipt.alias);
    return result;
  }
  for (const file of receipt.files) {
    const path = containedPath(root, file.path);
    if (rootPresent && !linkFreeParents(root, file.path)) {
      result.keptModified.push(file.path);
      continue;
    }
    const sha = rootPresent ? currentSha(path) : null;
    if (sha === null || sha === file.sha256) {
      if (sha !== null) rmSync(path, { force: true });
      result.removed.push(file.path);
      if (rootPresent) pruneEmptyDirs(root, dirname(path));
    } else {
      result.keptModified.push(file.path);
    }
  }
  const owned = new Set(receipt.files.map((f) => f.path));
  if (rootPresent) {
    result.keptUnknown = listFiles(root).filter((p) => !owned.has(p));
    pruneEmptyDirs(root, root);
  }
  deleteReceipt(home, runtime, receipt.alias);
  return result;
}
