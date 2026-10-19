import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { VerifiedTree } from './fetch-verify.js';
import { conflictError } from './install-errors.js';
import { writeJsonAtomic, writeReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { containedPath, isRealDir, renameWithRetry } from './safe-fs.js';
import type { RenameHooks } from './safe-fs.js';
import { retireOld, unprovenFiles } from './tree-proof.js';

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
 * `recoverJournals` runs before every change. While the stage still exists
 * the swap has not happened, so it rolls back (restores the old tree, drops
 * the stage); once the stage is gone the new tree is in place, so it rolls
 * forward (writes the receipt, retires the old tree). Staging entries no
 * journal names are leftovers of a crash before the journal was written.
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

interface Journal {
  schema: 'skillx.install-journal/v2';
  alias: string;
  target: string;
  stage: string;
  backup: string;
  /** Backup area of this change: displaced files land here. */
  saved: string;
  previous: InstallReceipt | null;
  receipt: InstallReceipt;
}

const journalDir = (ctx: Pick<TxContext, 'home' | 'runtime'>) => join(ctx.home, 'journal', ctx.runtime);
const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');
const savedRoot = (ctx: TxContext, alias: string) => join(ctx.home, 'backups', ctx.runtime, alias, stamp(ctx.now));

function copyInto(fromRoot: string, toRoot: string, paths: readonly string[]): void {
  for (const path of paths) {
    const dest = containedPath(toRoot, path);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(containedPath(fromRoot, path), dest, { verbatimSymlinks: true });
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

const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

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
  if (toBackUp.length > 0) copyInto(target, saved, toBackUp);
  copyInto(target, stage, preserved);
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
    try {
      recoverJournals(ctx);
    } catch {
      // The journal stays; the next run recovers.
    }
    const code = (error as NodeJS.ErrnoException).code ?? 'unknown';
    throw conflictError(`${target} is in use (${code}); close programs using it and run again`, { alias: change.alias, code });
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

export interface Recovery {
  rolledBack: string[];
  rolledForward: string[];
  sweptStaging: number;
}

export function recoverJournals(ctx: Pick<TxContext, 'home' | 'runtime' | 'stagingDir' | 'hooks'>): Recovery {
  const result: Recovery = { rolledBack: [], rolledForward: [], sweptStaging: 0 };
  const dir = journalDir(ctx);
  const referenced = new Set<string>();
  for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')) : []) {
    const path = join(dir, name);
    let journal: Journal;
    try {
      journal = JSON.parse(readFileSync(path, 'utf8')) as Journal;
    } catch {
      // A journal is written atomically, so an unreadable one is a temp leftover.
      rmSync(path, { force: true });
      continue;
    }
    if (exists(journal.stage)) {
      if (!exists(journal.target) && exists(journal.backup)) renameWithRetry(journal.backup, journal.target, ctx.hooks);
      rmSync(journal.stage, { recursive: true, force: true });
      result.rolledBack.push(journal.alias);
    } else if (exists(journal.target)) {
      writeReceipt(ctx.home, journal.receipt);
      retireOld({ dir: journal.backup, previous: journal.previous ?? null, carried: journal.target, saved: journal.saved });
      result.rolledForward.push(journal.alias);
    } else if (exists(journal.backup)) {
      renameWithRetry(journal.backup, journal.target, ctx.hooks);
      result.rolledBack.push(journal.alias);
    }
    referenced.add(journal.stage).add(journal.backup);
    rmSync(path, { force: true });
  }
  for (const name of existsSync(ctx.stagingDir) ? readdirSync(ctx.stagingDir) : []) {
    const path = join(ctx.stagingDir, name);
    if (referenced.has(path)) continue;
    rmSync(path, { recursive: true, force: true });
    result.sweptStaging += 1;
  }
  for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.tmp')) : []) rmSync(join(dir, name), { force: true });
  return result;
}
