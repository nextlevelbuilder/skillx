import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Private temporary directories that never outlive the process. A clone may
 * hold a credential-free remote but still a whole repository, so each
 * directory is removed by its own `remove`, on a normal or `process.exit`
 * exit, and on SIGINT, SIGTERM or SIGHUP while one is open (the handlers are
 * installed only then, so Ctrl+C keeps its default behaviour otherwise).
 */

const live = new Set<string>();
const SIGNALS = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 } as const;
type Signal = keyof typeof SIGNALS;

function removeAll(): void {
  for (const dir of live) rmSync(dir, { recursive: true, force: true });
  live.clear();
}

export const isCleanupSignal = (signal: string): signal is Signal => Object.hasOwn(SIGNALS, signal);

/** Removes every open directory and exits with the shell's code for `signal` (128 + its number). */
export function exitOnSignal(signal: Signal): never {
  removeAll();
  process.exit(SIGNALS[signal]);
}

const onSignal = (signal: Signal) => exitOnSignal(signal);

function hook(on: boolean): void {
  for (const signal of Object.keys(SIGNALS) as Signal[]) {
    if (on) process.on(signal, onSignal);
    else process.off(signal, onSignal);
  }
}

let exitHooked = false;

/** Creates a directory under the system temp directory; `remove` deletes it (idempotent). */
export function scratchDir(prefix: string): { dir: string; remove: () => void } {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  if (!exitHooked) {
    process.on('exit', removeAll);
    exitHooked = true;
  }
  if (live.size === 0) hook(true);
  live.add(dir);
  return {
    dir,
    remove: () => {
      rmSync(dir, { recursive: true, force: true });
      if (live.delete(dir) && live.size === 0) hook(false);
    },
  };
}

/** Directories still open; for tests. */
export const openScratchDirs = (): string[] => [...live];
