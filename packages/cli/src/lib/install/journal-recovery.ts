import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { renameWithRetry } from './safe-fs.js';
import type { RenameHooks } from './safe-fs.js';
import { retireOld } from './tree-proof.js';

/**
 * Finishes skill-directory transactions a crash or a refused rename left
 * open. While the stage still exists the swap has not happened, so it rolls
 * back (restores the old tree, drops the stage); once the stage is gone the
 * new tree is in place, so it rolls forward (writes the receipt, retires the
 * old tree). An old tree is never deleted unproven: when it cannot go back
 * because something else now sits at the target, it is parked in the backup
 * area and reported. Staging entries no journal names are leftovers of a
 * crash before the journal was written; an old tree among them is parked too.
 */

export interface Journal {
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

export interface Recovery {
  rolledBack: string[];
  rolledForward: string[];
  sweptStaging: number;
  /** Old trees that could not be restored, and where they were saved. */
  parked: Array<{ alias: string; savedTo: string }>;
}

export interface RecoveryContext {
  home: string;
  runtime: string;
  stagingDir: string;
  hooks?: RenameHooks;
}

export const journalDir = (ctx: Pick<RecoveryContext, 'home' | 'runtime'>) => join(ctx.home, 'journal', ctx.runtime);

export const exists = (path: string) => {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
};

/** Copies a whole old tree into the backup area (links are copied as links, never followed), then drops it. */
function park(tree: string, dest: string): string {
  let to = dest;
  for (let n = 1; exists(to); n += 1) to = `${dest}.${n}`;
  mkdirSync(join(to, '..'), { recursive: true });
  cpSync(tree, to, { recursive: true, verbatimSymlinks: true });
  rmSync(tree, { recursive: true, force: true });
  return to;
}

export function recoverJournals(ctx: RecoveryContext): Recovery {
  const result: Recovery = { rolledBack: [], rolledForward: [], sweptStaging: 0, parked: [] };
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
    const restore = () => {
      if (!exists(journal.backup)) return;
      if (!exists(journal.target)) renameWithRetry(journal.backup, journal.target, ctx.hooks);
      else result.parked.push({ alias: journal.alias, savedTo: park(journal.backup, `${journal.saved}-previous-tree`) });
    };
    if (exists(journal.stage)) {
      restore();
      rmSync(journal.stage, { recursive: true, force: true });
      result.rolledBack.push(journal.alias);
    } else if (exists(journal.target)) {
      writeReceipt(ctx.home, journal.receipt);
      retireOld({ dir: journal.backup, previous: journal.previous ?? null, carried: journal.target, saved: journal.saved });
      result.rolledForward.push(journal.alias);
    } else if (exists(journal.backup)) {
      restore();
      result.rolledBack.push(journal.alias);
    }
    referenced.add(journal.stage).add(journal.backup);
    rmSync(path, { force: true });
  }
  for (const name of existsSync(ctx.stagingDir) ? readdirSync(ctx.stagingDir) : []) {
    const path = join(ctx.stagingDir, name);
    if (referenced.has(path)) continue;
    if (name.endsWith('.old')) {
      const alias = name.replace(/\.[0-9a-f-]{36}\.old$/, '');
      result.parked.push({ alias, savedTo: park(path, join(ctx.home, 'backups', ctx.runtime, alias, `unjournaled-${name}`)) });
    } else rmSync(path, { recursive: true, force: true });
    result.sweptStaging += 1;
  }
  for (const name of existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.tmp')) : []) rmSync(join(dir, name), { force: true });
  return result;
}
