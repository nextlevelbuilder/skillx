import { closeSync, mkdirSync, openSync, readFileSync, rmSync, writeSync } from 'node:fs';
import { join } from 'node:path';
import { DEFAULT_RUNTIME, getAdapter, skillxHome, stagingDir } from './adapters.js';
import type { Env, HarnessAdapter } from './adapters.js';
import type { CrashPoint } from './apply-transaction.js';
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
  hooks?: { at?(point: CrashPoint, alias: string): void };
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

/**
 * One writer at a time per SkillX home. A lock left by a process that no
 * longer runs is taken over; a live holder fails the run instead of racing it.
 */
export async function withInstallLock<T>(ctx: InstallContext, run: () => Promise<T>): Promise<T> {
  mkdirSync(ctx.home, { recursive: true });
  const path = join(ctx.home, 'install.lock');
  let fd: number | null = null;
  for (let attempt = 0; attempt < 2 && fd === null; attempt += 1) {
    try {
      fd = openSync(path, 'wx');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const holder = Number.parseInt(readFileSync(path, 'utf8'), 10);
      if (Number.isSafeInteger(holder) && holder !== process.pid && alive(holder)) {
        throw new InstallError('conflict', `another skillx process (pid ${holder}) is changing installed skills`, { pid: holder });
      }
      rmSync(path, { force: true });
    }
  }
  if (fd === null) throw new InstallError('conflict', 'could not take the install lock');
  writeSync(fd, String(process.pid));
  closeSync(fd);
  try {
    return await run();
  } finally {
    rmSync(path, { force: true });
  }
}
