import { cpSync, existsSync, lstatSync, mkdirSync, readlinkSync, rmdirSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { scanDir } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { containedPath } from './safe-fs.js';

/**
 * Proof that replacing a skill directory loses nothing. Every entry of the
 * old directory must be accounted for: an owned file still matching the
 * previous receipt, a file carried into the new tree with the same content,
 * or a file already copied to the backup area. Anything else (a file the
 * user created or edited after the plan was made) is unproven.
 */

export interface ProofInput {
  /** The directory about to be (or just) replaced. */
  dir: string;
  previous: InstallReceipt | null;
  /** Where preserved files were carried: the stage before the swap, the target after. */
  carried: string;
  /** The backup root of this change (may not exist). */
  saved: string;
}

export function unprovenFiles(input: ProofInput): string[] {
  const owned = new Map((input.previous?.files ?? []).map((f) => [f.path, f.sha256]));
  const carried = existsSync(input.carried) ? new Map(scanDir(input.carried).map((f) => [f.path, f.sha256])) : new Map<string, string>();
  const saved = existsSync(input.saved) ? new Map(scanDir(input.saved).map((f) => [f.path, f.sha256])) : new Map<string, string>();
  return scanDir(input.dir)
    .filter((f) => !((f.sha256 !== '' && owned.get(f.path) === f.sha256) || carried.get(f.path) === f.sha256 || saved.get(f.path) === f.sha256))
    .map((f) => f.path);
}

/** Removes a link (symlink or junction) itself, never what it points to. */
function unlinkEntry(path: string): void {
  try {
    unlinkSync(path);
  } catch {
    rmdirSync(path); // a Windows junction or directory symlink
  }
}

/**
 * Drops the old directory after a swap. Unproven files are first copied to
 * the backup root (next to any earlier copy of the same path, as
 * `<path>.displaced`), so a file that appeared after the last check is never
 * deleted. A link is never followed: its target path is saved as
 * `<path>.link` and the link itself is removed. Returns the paths it saved.
 */
export function retireOld(input: ProofInput): string[] {
  if (!existsSync(input.dir)) return [];
  const displaced = unprovenFiles(input);
  for (const path of displaced) {
    const from = containedPath(input.dir, path);
    const isLink = !lstatSync(from).isFile();
    let dest = containedPath(input.saved, path) + (isLink ? '.link' : '');
    if (existsSync(dest)) dest = `${dest}.displaced`;
    mkdirSync(dirname(dest), { recursive: true });
    if (!isLink) {
      cpSync(from, dest);
      continue;
    }
    let pointsTo = '';
    try {
      pointsTo = readlinkSync(from);
    } catch {
      // another special entry: there is no target to record
    }
    writeFileSync(dest, `${pointsTo}\n`);
    unlinkEntry(from);
  }
  rmSync(input.dir, { recursive: true, force: true });
  return displaced;
}
