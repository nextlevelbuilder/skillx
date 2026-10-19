import { lstatSync, readFileSync, readdirSync, rmdirSync, rmSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { sha256Hex } from './fetch-verify.js';
import { deleteReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';

/**
 * Removes a skill directory with proof of ownership: a file is deleted only
 * when its receipt lists it and its current SHA-256 still equals the
 * receipt's. Changed files and files the receipt does not list are kept and
 * reported; directories are removed only when they end up empty. The
 * receipt goes last, so a crash midway leaves a receipt and a rerun finishes
 * the job (already deleted files count as removed).
 */

export interface RemoveResult {
  alias: string;
  removed: string[];
  /** Owned files changed locally: kept. */
  keptModified: string[];
  /** Files the receipt never listed: kept. */
  keptUnknown: string[];
}

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
      if (lstatSync(path).isDirectory()) walk(path);
      else out.push(relative(root, path).split(sep).join('/'));
    }
  };
  walk(root);
  return out.sort();
}

export function removeOwned(home: string, runtime: string, skillsDir: string, receipt: InstallReceipt): RemoveResult {
  const root = join(skillsDir, receipt.alias);
  const result: RemoveResult = { alias: receipt.alias, removed: [], keptModified: [], keptUnknown: [] };
  for (const file of receipt.files) {
    const path = join(root, ...file.path.split('/'));
    const sha = currentSha(path);
    if (sha === null || sha === file.sha256) {
      rmSync(path, { force: true });
      result.removed.push(file.path);
      pruneEmptyDirs(root, dirname(path));
    } else {
      result.keptModified.push(file.path);
    }
  }
  const owned = new Set(receipt.files.map((f) => f.path));
  result.keptUnknown = listFiles(root).filter((p) => !owned.has(p));
  pruneEmptyDirs(root, root);
  deleteReceipt(home, runtime, receipt.alias);
  return result;
}
