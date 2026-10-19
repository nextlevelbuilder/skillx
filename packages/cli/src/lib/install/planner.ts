import { join } from 'node:path';
import { canonicalJsonBytes } from '@skillx/contracts';
import type { InstallLock, InstallLockPackage } from '@skillx/contracts';
import { sha256Hex } from './fetch-verify.js';
import { inspectLocal, readReceipt } from './install-state.js';
import type { InstallReceipt, OwnersFile } from './install-state.js';

/**
 * Plans what applying a lock for one owner changes in one skills directory.
 * Planning reads local state only; it never fetches or writes. Conflicts are
 * explicit actions, and a plan with any conflict is not applied:
 *
 * - `local_modified`: an owned file changed or vanished (use `--force` to
 *   reinstall; changed files are backed up first).
 * - `unowned_directory`: the directory exists without a receipt (`--force`
 *   installs over it and keeps every file that is not part of the release).
 * - `shared_version`: another source needs this skill at another digest.
 *   Never forced: one directory cannot hold two versions.
 *
 * Files that are not owned (`unknown`) are always preserved and reported.
 * A file, symlink or junction where a skill directory belongs is always an
 * `unowned_directory` conflict: the installer never writes through a link.
 * A symlink or junction inside the skill directory is a `contains_link`
 * conflict, also with `--force`: links are never copied or followed.
 */

export type PlanAction =
  | { action: 'install'; alias: string; package: string; version: string; compositionDigest: string; preserve: string[] }
  | { action: 'update'; alias: string; package: string; version: string; fromDigest: string; compositionDigest: string; backup: string[]; preserve: string[] }
  | { action: 'unchanged'; alias: string; package: string; version: string; compositionDigest: string; addOwner: boolean }
  | { action: 'release'; alias: string; remainingOwners: string[] }
  | { action: 'remove'; alias: string; package: string }
  | { action: 'conflict'; alias: string; package: string; reason: 'local_modified' | 'unowned_directory' | 'contains_link' | 'shared_version'; files: string[]; owners: string[] };

export interface InstallPlan {
  runtime: string;
  owner: string;
  skillsDir: string;
  actions: PlanAction[];
  conflicts: number;
  /** sha256 of the canonical plan: an MCP `apply` may require the plan it was shown. */
  planDigest: string;
}

export interface PlanInput {
  home: string;
  runtime: string;
  skillsDir: string;
  owner: string;
  /** The packages the owner needs after this change; empty for uninstall. */
  packages: readonly InstallLockPackage[];
  owners: OwnersFile;
  force: boolean;
}

function planPackage(input: PlanInput, p: InstallLockPackage, receipt: InstallReceipt | null): PlanAction {
  const local = inspectLocal(join(input.skillsDir, p.alias), receipt);
  const base = { alias: p.alias, package: p.package, version: p.version, compositionDigest: p.compositionDigest };
  // A file, symlink or junction where the skill directory belongs is never replaced, not even with --force.
  if (local.unknown.includes('.')) return { action: 'conflict', alias: p.alias, package: p.package, reason: 'unowned_directory', files: ['.'], owners: receipt?.requiredBy ?? [] };
  // Links inside it are never copied, carried or replaced: the user resolves them first.
  if (local.links.length > 0) return { action: 'conflict', alias: p.alias, package: p.package, reason: 'contains_link', files: local.links, owners: receipt?.requiredBy ?? [] };
  if (receipt === null) {
    if (!local.exists) return { action: 'install', ...base, preserve: [] };
    if (!input.force) return { action: 'conflict', alias: p.alias, package: p.package, reason: 'unowned_directory', files: local.unknown, owners: [] };
    return { action: 'install', ...base, preserve: local.unknown };
  }
  const changed = [...local.modified, ...local.missing];
  if (receipt.compositionDigest === p.compositionDigest) {
    if (changed.length === 0) return { action: 'unchanged', ...base, addOwner: !receipt.requiredBy.includes(input.owner) };
    if (!input.force) return { action: 'conflict', alias: p.alias, package: p.package, reason: 'local_modified', files: changed, owners: receipt.requiredBy };
  }
  const others = receipt.requiredBy.filter((o) => o !== input.owner);
  if (receipt.compositionDigest !== p.compositionDigest && others.length > 0) {
    return { action: 'conflict', alias: p.alias, package: p.package, reason: 'shared_version', files: [], owners: others };
  }
  if (changed.length > 0 && !input.force) return { action: 'conflict', alias: p.alias, package: p.package, reason: 'local_modified', files: changed, owners: receipt.requiredBy };
  return { action: 'update', ...base, fromDigest: receipt.compositionDigest, backup: local.modified, preserve: local.unknown };
}

/** Skills the owner held before and no longer needs: released, or removed when no owner is left. */
function planDropped(input: PlanInput): PlanAction[] {
  const previous = input.owners.owners[input.owner]?.lock.packages ?? [];
  const keep = new Set(input.packages.map((p) => p.alias));
  const actions: PlanAction[] = [];
  for (const p of previous) {
    if (keep.has(p.alias)) continue;
    const receipt = readReceipt(input.home, input.runtime, p.alias);
    if (receipt === null || !receipt.requiredBy.includes(input.owner)) continue;
    const remaining = receipt.requiredBy.filter((o) => o !== input.owner);
    actions.push(remaining.length > 0 ? { action: 'release', alias: p.alias, remainingOwners: remaining } : { action: 'remove', alias: p.alias, package: receipt.package });
  }
  return actions;
}

export function planInstall(input: PlanInput): InstallPlan {
  const actions = [...input.packages.map((p) => planPackage(input, p, readReceipt(input.home, input.runtime, p.alias))), ...planDropped(input)];
  actions.sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
  const body = { runtime: input.runtime, owner: input.owner, skillsDir: input.skillsDir, actions };
  return { ...body, conflicts: actions.filter((a) => a.action === 'conflict').length, planDigest: `sha256:${sha256Hex(canonicalJsonBytes(body))}` };
}

/** The packages of a lock that a plan installs or updates. */
export function packagesToFetch(plan: InstallPlan, lock: Pick<InstallLock, 'packages'>): InstallLockPackage[] {
  const wanted = new Set(plan.actions.filter((a) => a.action === 'install' || a.action === 'update').map((a) => a.alias));
  return lock.packages.filter((p) => wanted.has(p.alias));
}
