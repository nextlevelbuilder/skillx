import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { VerifiedTree } from './fetch-verify.js';
import { conflictError } from './install-errors.js';
import { writeJsonAtomic, writeReceipt } from './install-state.js';
import { exists, journalDir, recoverJournals } from './journal-recovery.js';
import type { Journal } from './journal-recovery.js';
import type { InstallReceipt } from './install-state.js';
import { containedPath, isRealDir, renameWithRetry } from './safe-fs.js';
import type { RenameHooks } from './safe-fs.js';
import { retireOld, unprovenFiles } from './tree-proof.js';

export { recoverJournals } from './journal-recovery.js';
export type { Recovery } from './journal-recovery.js';

/**
 * Atomic replacement of one skill directory, recoverable after a crash at
 * any point:
 *
 *   stage files → prove the old tree → write journal → target → old
 *   → stage → target → write receipt → retire old → drop journal
 *
 * Before the journal is written, every file of the current directory must be
 * accounted for (owned and unchanged, carried into the stage, or backed up);
 * a file created or edited since the plan aborts the change. The old tree is
 * then never deleted blindly: anything in it still unproven at retire time
 * is copied to the backup area first.
 *
 * `recoverJournals` (journal-recovery.ts) runs before every change and when a
 * rename is refused, and finishes or rolls back the transaction.
 */

export type CrashPoint = 'staged' | 'journaled' | 'moved-old' | 'swapped' | 'receipt-written';

export interface TxHooks extends RenameHooks {
  /** Test hook: throwing here simulates a crash at that point. */
  at?(point: CrashPoint, alias: string): void;
}

export interface TxContext {
  home: string;
  runtime: string;
  skillsDir: string;
  stagingDir: string;
  hooks?: TxHooks;
  now: Date;
}

const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');
const savedRoot = (ctx: TxContext, alias: string) => join(ctx.home, 'backups', ctx.runtime, alias, stamp(ctx.now));

/** Copies regular files only: a link or other entry that appeared since the plan is a conflict, never followed. */
function copyInto(alias: string, fromRoot: string, toRoot: string, paths: readonly string[]): void {
  for (const path of paths) {
    const from = containedPath(fromRoot, path);
    if (!lstatSync(from).isFile()) throw conflictError(`${alias}/${path} is a link or not a regular file; nothing was replaced`, { conflicts: [{ alias, reason: 'contains_link', files: [path] }] });
    const dest = containedPath(toRoot, path);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(from, dest);
  }
}

export interface TreeChange {
  alias: string;
  tree: VerifiedTree;
  receipt: InstallReceipt;
  /** The receipt of the directory being replaced; null for a first install. */
  previous: InstallReceipt | null;
  /** Local files that are not part of the release; carried into the new directory. */
  preserve: readonly string[];
  /** Owned files changed locally; saved to the backup area before the swap. */
  backup: readonly string[];
}


export function applyTreeChange(ctx: TxContext, change: TreeChange): { backupDir: string | null; preserved: string[]; displaced: string[] } {
  const hit = (point: CrashPoint) => ctx.hooks?.at?.(point, change.alias);
  const target = join(ctx.skillsDir, change.alias);
  if (exists(target) && !isRealDir(target)) throw conflictError(`${target} is a link or a file, not a skill directory; nothing was changed`, { alias: change.alias });
  const id = `${change.alias}.${randomUUID()}`;
  const stage = join(ctx.stagingDir, id);
  const backup = join(ctx.stagingDir, `${id}.old`);
  const saved = savedRoot(ctx, change.alias);
  mkdirSync(ctx.skillsDir, { recursive: true });

  for (const file of change.tree.files) {
    const dest = containedPath(stage, file.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.bytes, { mode: file.mode === '100755' ? 0o755 : 0o644 });
  }
  const releasePaths = new Set(change.tree.files.map((f) => f.path));
  const preserved = change.preserve.filter((p) => !releasePaths.has(p));
  const toBackUp = [...change.backup, ...change.preserve.filter((p) => releasePaths.has(p))];
  try {
    if (toBackUp.length > 0) copyInto(change.alias, target, saved, toBackUp);
    copyInto(change.alias, target, stage, preserved);
  } catch (error) {
    rmSync(stage, { recursive: true, force: true });
    throw error;
  }
  hit('staged');

  const drift = unprovenFiles({ dir: target, previous: change.previous, carried: stage, saved });
  if (drift.length > 0) {
    rmSync(stage, { recursive: true, force: true });
    throw conflictError(`${change.alias} changed on disk since it was planned; nothing was replaced`, { conflicts: [{ alias: change.alias, reason: 'local_modified', files: drift }] });
  }

  const journal: Journal = { schema: 'skillx.install-journal/v2', alias: change.alias, target, stage, backup, saved, previous: change.previous, receipt: change.receipt };
  const journalPath = join(journalDir(ctx), `${change.alias}.json`);
  writeJsonAtomic(journalPath, journal);
  hit('journaled');
  const busy = (error: unknown): never => {
    let parked: Array<{ alias: string; savedTo: string }> = [];
    try {
      parked = recoverJournals(ctx).parked;
    } catch {
      // The journal stays; the next run recovers.
    }
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
    throw conflictError(`${target} is in use (${code}); close programs using it and run again`, { alias: change.alias, code, parked });
  };
  try {
    if (exists(target)) renameWithRetry(target, backup, ctx.hooks);
  } catch (error) {
    busy(error);
  }
  hit('moved-old');
  try {
    renameWithRetry(stage, target, ctx.hooks);
  } catch (error) {
    busy(error);
  }
  hit('swapped');
  writeReceipt(ctx.home, change.receipt);
  hit('receipt-written');
  const displaced = retireOld({ dir: backup, previous: change.previous, carried: target, saved });
  rmSync(journalPath, { force: true });
  return { backupDir: existsSync(saved) ? saved : null, preserved, displaced };
}
