import { randomUUID } from 'node:crypto';
import { linkSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RUNTIME, getAdapter, skillxHome, stagingDir } from './adapters.js';
import type { Env, HarnessAdapter } from './adapters.js';
import type { TxHooks } from './apply-transaction.js';
import { InstallError } from './install-errors.js';
import type { Registry } from './registry-client.js';
import { loadTrustedKeys } from './trusted-keys.js';

/** Everything one installer run needs, resolved once from the environment. */
export interface InstallContext {
  env: Env;
  home: string;
  adapter: HarnessAdapter;
  runtime: string;
  skillsDir: string;
  stagingDir: string;
  registry: Registry;
  keys: ReadonlyMap<string, Uint8Array>;
  force: boolean;
  hooks?: TxHooks;
  now: () => Date;
}

export interface ContextOptions {
  registry: Registry;
  env?: Env;
  runtime?: string;
  keys?: ReadonlyMap<string, Uint8Array>;
  force?: boolean;
  hooks?: InstallContext['hooks'];
  now?: () => Date;
}

export function createInstallContext(options: ContextOptions): InstallContext {
  const env = options.env ?? process.env;
  const home = skillxHome(env);
  const adapter = getAdapter(options.runtime ?? DEFAULT_RUNTIME);
  return {
    env,
    home,
    adapter,
    runtime: adapter.id,
    skillsDir: adapter.skillsDir(env),
    stagingDir: stagingDir(adapter, env),
    registry: options.registry,
    keys: options.keys ?? loadTrustedKeys(home, env),
    force: options.force ?? false,
    ...(options.hooks ? { hooks: options.hooks } : {}),
    now: options.now ?? (() => new Date()),
  };
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

const busy = (holder: string) => new InstallError('conflict', `another skillx process (${holder}) is changing installed skills`, { holder });

/**
 * One writer at a time per SkillX home. The lock is created complete or not
 * at all: the pid is written to a private file that is then hard-linked to
 * `install.lock`, which fails atomically when the lock exists. A lock whose
 * holder no longer runs is taken over by renaming it to a private name
 * first, so of two processes taking over the same stale lock only one wins,
 * and a fresh lock that replaced it in between is put back, never deleted.
 */
export async function withInstallLock<T>(ctx: InstallContext, run: () => Promise<T>): Promise<T> {
  mkdirSync(ctx.home, { recursive: true });
  const path = join(ctx.home, 'install.lock');
  const mine = `${path}.${process.pid}.${randomUUID()}`;
  writeFileSync(mine, String(process.pid));
  try {
    for (let attempt = 0; ; attempt += 1) {
      try {
        linkSync(mine, path);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (attempt >= 2) throw busy('a process that keeps taking the lock');
      }
      const text = readText(path);
      // Released between our link attempt and this read: try again.
      if (text === '') continue;
      const holder = Number.parseInt(text, 10);
      if (!Number.isSafeInteger(holder)) throw busy(`unknown; remove ${path} if no skillx command is running`);
      if (alive(holder)) throw busy(`pid ${holder}`);
      const stale = `${path}.stale.${randomUUID()}`;
      try {
        renameSync(path, stale);
      } catch {
        continue; // someone else took it over first; try again
      }
      const taken = Number.parseInt(readText(stale), 10);
      if (taken !== holder) {
        // A live process replaced the stale lock between our read and rename: give it back.
        try {
          linkSync(stale, path);
        } catch {
          // It has its own lock again; ours stays out of the way.
        }
        rmSync(stale, { force: true });
        throw busy(`pid ${taken}`);
      }
      rmSync(stale, { force: true });
    }
  } finally {
    rmSync(mine, { force: true });
  }
  try {
    return await run();
  } finally {
    rmSync(path, { force: true });
  }
}

function readText(path: string): string {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return '';
  }
}
