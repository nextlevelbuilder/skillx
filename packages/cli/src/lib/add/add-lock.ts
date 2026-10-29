import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION, sortLockAdded } from '@skillx/contracts';
import type { InstallLock, InstallLockAdded } from '@skillx/contracts';
import { existingLock, writeLockFile } from '../install/lock-file.js';
import type { AddSource } from './add-source.js';

/**
 * Skills from `skillx add` in `skillx.lock.json`. A skill read from git is an
 * `added` entry of a packages lock: the repository (no credentials), the
 * skill's directory in it, the branch or tag to follow and the commit and
 * tree digest it was read at. That is enough for `sync --locked` to fetch the
 * same commit and refuse any other tree, and for `update` to follow the ref.
 * A local directory has no portable source and is never locked.
 */

const GITHUB_REPOSITORY = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\.git$/;

/** The lock entry of skill `alias` read from `dir` of `source`; null for a local source. */
export function addedEntryOf(source: AddSource, alias: string, dir: string, commit: string | undefined, treeDigest: string): InstallLockAdded | null {
  if (source.kind === 'local' || commit === undefined) return null;
  // A `git` label is the URL without credentials; a `github` clone URL never has any.
  const repository = source.kind === 'github' ? source.cloneUrl : source.label;
  const ref = source.kind === 'github' ? source.ref : undefined;
  return { alias, repository, path: dir, ...(ref === undefined ? {} : { ref }), commit, treeDigest };
}

/**
 * The source an entry was added from, as `skillx add` takes it, recorded as
 * the owner's ref so `update` can follow it: `github:owner/repo[/path][@ref]`,
 * or the repository URL (another host has no ref syntax: its default branch).
 */
export function entrySourceRef(entry: InstallLockAdded, ref = entry.ref): string {
  const gh = GITHUB_REPOSITORY.exec(entry.repository);
  if (gh === null) return entry.repository;
  return `github:${gh[1]}/${gh[2]}${entry.path ? `/${entry.path}` : ''}${ref ? `@${ref}` : ''}`;
}

/** `existing` with `entries` set by alias; an alias moves out of `packages` when it becomes an added skill. */
export function mergeAdded(existing: InstallLock | null, entries: readonly InstallLockAdded[]): InstallLock {
  const base: InstallLock = existing ?? { schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, source: { kind: 'packages' }, runtimes: {}, packages: [] };
  const byAlias = new Map((base.added ?? []).map((a) => [a.alias, a]));
  for (const e of entries) byAlias.set(e.alias, e);
  const aliases = new Set(entries.map((e) => e.alias));
  return withAdded({ ...base, packages: base.packages.filter((p) => !aliases.has(p.alias)) }, [...byAlias.values()]);
}

/** The lock with `added` set, or without the field when there is none. */
export function withAdded(lock: InstallLock, added: readonly InstallLockAdded[]): InstallLock {
  const { added: _drop, ...rest } = lock;
  return added.length === 0 ? rest : { ...rest, added: sortLockAdded(added) };
}

/** Writes `entries` into the packages lock at `path`; null when there is nothing to write. */
export function writeAddedLock(path: string, entries: readonly InstallLockAdded[]): string | null {
  if (entries.length === 0) return null;
  return writeLockFile(path, mergeAdded(existingLock(path), entries));
}

/** Drops added skill `alias` from the packages lock at `path`; null when it held none. */
export function dropAddedFromLockFile(path: string, alias: string): string | null {
  const existing = existingLock(path);
  if (existing === null || !(existing.added ?? []).some((a) => a.alias === alias)) return null;
  return writeLockFile(path, withAdded(existing, existing.added!.filter((a) => a.alias !== alias)));
}
