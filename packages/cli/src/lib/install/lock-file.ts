import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { validateInstallLock } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import { usageError } from './install-errors.js';
import { parseLock } from './sync-locked.js';

/**
 * `skillx.lock.json` on disk. A lock is validated before it is written and
 * when it is read; one that would carry a secret or an absolute local path
 * is refused, never written, so the file is always safe to commit or sync.
 */

export function writeLockFile(path: string, lock: InstallLock): string {
  const verdict = validateInstallLock(lock);
  if (!verdict.valid) throw usageError('refusing to write an invalid or leaking lock', { issues: verdict.issues.map((i) => ({ path: i.path, code: i.code })) });
  const target = resolve(path);
  writeFileSync(target, `${JSON.stringify(lock, null, 2)}\n`);
  return target;
}

export function readLockFile(path: string): InstallLock {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw usageError(`cannot read the lock: ${error instanceof Error ? error.message : String(error)}`);
  }
  return parseLock(raw);
}
