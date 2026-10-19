import { randomUUID } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { VerifiedTree } from './fetch-verify.js';
import { writeJsonAtomic, writeReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';

/**
 * Atomic replacement of one skill directory, recoverable after a crash at
 * any point:
 *
 *   stage files → write journal → target → backup → stage → target
 *   → write receipt → drop backup → drop journal
 *
 * `recoverJournals` runs before every change. While the stage still exists
 * the swap has not happened, so it rolls back (restores the backup, drops
 * the stage); once the stage is gone the new tree is in place, so it rolls
 * forward (writes the receipt from the journal, drops the backup). Staging
 * entries no journal names are leftovers of a crash before the journal was
 * written and are removed.
 */

export type CrashPoint = 'staged' | 'journaled' | 'moved-old' | 'swapped' | 'receipt-written';

export interface TxContext {
  home: string;
  runtime: string;
  skillsDir: string;
  stagingDir: string;
  /** Test hook: throwing here simulates a crash at that point. */
  hooks?: { at?(point: CrashPoint, alias: string): void };
  now: Date;
}

interface Journal {
  schema: 'skillx.install-journal/v1';
  alias: string;
  target: string;
  stage: string;
  backup: string;
  receipt: InstallReceipt;
}

const journalDir = (ctx: Pick<TxContext, 'home' | 'runtime'>) => join(ctx.home, 'journal', ctx.runtime);
const stamp = (now: Date) => now.toISOString().replace(/[:.]/g, '-');

/** Copies local files the new tree would overwrite to `<skillxHome>/backups/<runtime>/<alias>/<time>/`. */
export function backupFiles(ctx: TxContext, alias: string, from: string, paths: readonly string[]): string | null {
  if (paths.length === 0) return null;
  const root = join(ctx.home, 'backups', ctx.runtime, alias, stamp(ctx.now));
  for (const path of paths) {
    const dest = join(root, ...path.split('/'));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(from, ...path.split('/')), dest, { verbatimSymlinks: true });
  }
  return root;
}

export interface TreeChange {
  alias: string;
  tree: VerifiedTree;
  receipt: InstallReceipt;
  /** Local files that are not part of the release; carried into the new directory. */
  preserve: readonly string[];
  /** Owned files changed locally; saved to the backup area before the swap. */
  backup: readonly string[];
}

export function applyTreeChange(ctx: TxContext, change: TreeChange): { backupDir: string | null; preserved: string[] } {
  const hit = (point: CrashPoint) => ctx.hooks?.at?.(point, change.alias);
  const target = join(ctx.skillsDir, change.alias);
  const id = `${change.alias}.${randomUUID()}`;
  const stage = join(ctx.stagingDir, id);
  const backup = join(ctx.stagingDir, `${id}.old`);
  mkdirSync(ctx.skillsDir, { recursive: true });

  for (const file of change.tree.files) {
    const dest = join(stage, ...file.path.split('/'));
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, file.bytes, { mode: file.mode === '100755' ? 0o755 : 0o644 });
  }
  const releasePaths = new Set(change.tree.files.map((f) => f.path));
  const collide = change.preserve.filter((p) => releasePaths.has(p));
  const preserved = change.preserve.filter((p) => !releasePaths.has(p));
  const backupDir = backupFiles(ctx, change.alias, target, [...change.backup, ...collide]);
  for (const path of preserved) {
    const dest = join(stage, ...path.split('/'));
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(target, ...path.split('/')), dest, { verbatimSymlinks: true });
  }
  hit('staged');

  const journal: Journal = { schema: 'skillx.install-journal/v1', alias: change.alias, target, stage, backup, receipt: change.receipt };
  const journalPath = join(journalDir(ctx), `${change.alias}.json`);
  writeJsonAtomic(journalPath, journal);
  hit('journaled');
  if (existsSync(target)) renameSync(target, backup);
  hit('moved-old');
  renameSync(stage, target);
  hit('swapped');
  writeReceipt(ctx.home, change.receipt);
  hit('receipt-written');
  rmSync(backup, { recursive: true, force: true });
  rmSync(journalPath, { force: true });
  return { backupDir, preserved };
}

export interface Recovery {
  rolledBack: string[];
  rolledForward: string[];
  sweptStaging: number;
}

export function recoverJournals(ctx: Pick<TxContext, 'home' | 'runtime' | 'stagingDir'>): Recovery {
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
    if (existsSync(journal.stage)) {
      if (!existsSync(journal.target) && existsSync(journal.backup)) renameSync(journal.backup, journal.target);
      rmSync(journal.stage, { recursive: true, force: true });
      result.rolledBack.push(journal.alias);
    } else if (existsSync(journal.target)) {
      writeReceipt(ctx.home, journal.receipt);
      rmSync(journal.backup, { recursive: true, force: true });
      result.rolledForward.push(journal.alias);
    } else if (existsSync(journal.backup)) {
      renameSync(journal.backup, journal.target);
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
