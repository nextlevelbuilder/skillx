import { lstatSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import { integrityError } from './install-errors.js';

/**
 * Filesystem guards of the installer. Paths inside a skill come from signed
 * manifests and overlays, but every write and delete is still confined to
 * its root: a relative path must be plain POSIX segments, and no directory on
 * the way may be a symlink or a Windows junction (both report
 * `isSymbolicLink()` from `lstat`), so nothing is ever written or deleted
 * outside the skills directory through a link.
 */

const BAD_SEGMENT = /^\.{1,2}$|[\\:\0]/;

/** `root` joined with a manifest path, refusing absolute paths, `..`, backslashes and drive letters. */
export function containedPath(root: string, rel: string): string {
  const segments = rel.split('/');
  if (rel === '' || rel.startsWith('/') || segments.some((s) => s === '' || BAD_SEGMENT.test(s))) {
    throw integrityError(`refusing the unsafe path '${rel}'`, { path: rel });
  }
  return join(root, ...segments);
}

/** True when `path` exists as a real directory (not a symlink or junction). */
export function isRealDir(path: string): boolean {
  try {
    const stat = lstatSync(path);
    return stat.isDirectory() && !stat.isSymbolicLink();
  } catch {
    return false;
  }
}

/** True when `root` and every directory between it and `rel`'s parent are real directories. */
export function linkFreeParents(root: string, rel: string): boolean {
  if (!isRealDir(root)) return false;
  const segments = rel.split('/');
  let dir = root;
  for (const segment of segments.slice(0, -1)) {
    dir = join(dir, segment);
    if (!isRealDir(dir)) return false;
  }
  return true;
}

export interface RenameHooks {
  /** Test hook: replaces `renameSync`, to simulate a locked file. */
  rename?(from: string, to: string): void;
}

const RETRYABLE = new Set(['EPERM', 'EBUSY', 'EACCES', 'ENOTEMPTY']);
const BACKOFF_MS = [25, 50, 100, 200, 400];
const sleep = (ms: number) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);

/**
 * `rename` that retries while Windows holds the path (an editor, indexer or
 * antivirus scan answers EPERM/EBUSY for a moment). The last error is thrown.
 */
export function renameWithRetry(from: string, to: string, hooks?: RenameHooks): void {
  const rename = hooks?.rename ?? renameSync;
  for (let attempt = 0; ; attempt += 1) {
    try {
      rename(from, to);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code ?? '';
      if (!RETRYABLE.has(code) || attempt >= BACKOFF_MS.length) throw error;
      sleep(BACKOFF_MS[attempt]!);
    }
  }
}
