import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { lockOwnerKey, sortLockPackages, validateInstallLock } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import { usageError } from './install-errors.js';
import { writeJsonAtomic } from './install-state.js';
import { parseLock } from './sync-locked.js';

/**
 * `skillx.lock.json` on disk. A lock is validated before it is written and
 * when it is read; one that would carry a secret or an absolute local path
 * is refused, never written, so the file is always safe to commit or sync.
 *
 * A lock file has one scope: one kit, one collection, or a set of explicit
 * packages. It always describes everything installed in that scope:
 * installing more packages merges them into a packages lock, reinstalling
 * or updating a kit or collection replaces its lock, and uninstalling a
 * package drops it. Installing a source of another scope into the same file
 * is refused before anything is installed (use another `--lock` file).
 */

export function writeLockFile(path: string, lock: InstallLock): string {
  const verdict = validateInstallLock(lock);
  if (!verdict.valid) throw usageError('refusing to write an invalid or leaking lock', { issues: verdict.issues.map((i) => ({ path: i.path, code: i.code })) });
  const target = resolve(path);
  writeJsonAtomic(target, lock);
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

/** The lock at `path`, or null when there is none yet. */
export const existingLock = (path: string): InstallLock | null => (existsSync(path) ? readLockFile(path) : null);

/** `packages`, or the owner key of the kit or collection a lock pins. */
export const lockScope = (lock: Pick<InstallLock, 'source' | 'packages'>) => (lock.source.kind === 'packages' ? 'packages' : lockOwnerKey(lock.source, lock.packages));

/** Refuses, before anything is installed, a source of another scope than the lock file at `path`. */
export function assertLockScope(path: string, scope: string): void {
  const existing = existingLock(path);
  if (existing !== null && lockScope(existing) !== scope) {
    throw usageError(`${path} locks ${lockScope(existing)}, not ${scope}; pass --lock <another file> or --no-lock`, { lock: path });
  }
}

/** `existing` updated with `next`: packages locks merge by alias, other scopes are replaced. */
export function mergeLock(existing: InstallLock | null, next: InstallLock): InstallLock {
  if (existing === null || next.source.kind !== 'packages') return next;
  const byAlias = new Map(existing.packages.map((p) => [p.alias, p]));
  for (const p of next.packages) byAlias.set(p.alias, p);
  return { ...next, packages: sortLockPackages([...byAlias.values()]) };
}

/** Drops `packageName` from a packages lock file; other scopes are left as they are. */
export function dropFromLockFile(path: string, packageName: string): string | null {
  const existing = existingLock(path);
  if (existing === null || existing.source.kind !== 'packages') return null;
  const packages = existing.packages.filter((p) => p.package !== packageName);
  if (packages.length === existing.packages.length) return null;
  return writeLockFile(path, { ...existing, packages });
}
