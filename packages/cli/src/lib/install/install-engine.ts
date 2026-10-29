import { lockOwnerKey } from '@skillx/contracts';
import type { InstallLock, SkillOverlay } from '@skillx/contracts';
import { applyTreeChange, recoverJournals } from './apply-transaction.js';
import type { Recovery } from './apply-transaction.js';
import { fetchVerified } from './fetch-verify.js';
import type { VerifiedTree } from './fetch-verify.js';
import type { InstallContext } from './install-context.js';
import { conflictError } from './install-errors.js';
import { RECEIPT_SCHEMA, listReceipts, readOwners, readReceipt, writeOwners, writeReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { packagesToFetch, planInstall } from './planner.js';
import type { InstallPlan } from './planner.js';
import { removeOwned } from './remove-owned.js';
import type { RemoveResult } from './remove-owned.js';
import { join } from 'node:path';

/**
 * Plan and apply for one owner (a kit, a collection or one package). A
 * multi-package install is split into one owner per package, so each can be
 * updated and uninstalled on its own. Apply verifies every tree before the
 * first write, refuses any plan with a conflict, and records the owner's
 * lock last, so a rerun after a crash converges.
 */

export interface OwnedLock {
  owner: string;
  /** What `update` resolves again: the ref as the user gave it. */
  ref: string;
  lock: InstallLock;
  overlays: Map<string, SkillOverlay[]>;
}

/** Splits a lock into owners: kits and collections own all their packages; explicit packages own themselves. */
export function ownedLocks(lock: InstallLock, overlays: Map<string, SkillOverlay[]>, refFor: (pkg: string) => string, sourceRef: string): OwnedLock[] {
  if (lock.source.kind !== 'packages') return [{ owner: lockOwnerKey(lock.source, lock.packages), ref: sourceRef, lock, overlays }];
  return lock.packages.map((p) => {
    const single = { ...lock, packages: [p] };
    return { owner: lockOwnerKey(lock.source, single.packages), ref: refFor(p.package), lock: single, overlays: new Map() };
  });
}

export function planOwned(ctx: InstallContext, owned: Pick<OwnedLock, 'owner' | 'lock'>): InstallPlan {
  return planInstall({
    home: ctx.home,
    runtime: ctx.runtime,
    skillsDir: ctx.skillsDir,
    owner: owned.owner,
    packages: owned.lock.packages,
    owners: readOwners(ctx.home, ctx.runtime),
    force: ctx.force,
  });
}

export interface ApplyResult {
  owner: string;
  planDigest: string;
  /** `executable`: files written with mode 755. The installer never runs them; the result names them so nothing is silent. */
  changed: Array<{ alias: string; action: string; backupDir: string | null; preserved: string[]; displaced: string[]; executable?: string[] }>;
  removed: RemoveResult[];
}

/**
 * Finishes interrupted transactions, then drops owner keys that receipts
 * name but the owners record does not (a run that stopped after writing
 * receipts and before recording its owner). A skill left with no owner is
 * removed with ownership proof, so the next plan starts from a clean slate.
 */
export function recover(ctx: InstallContext): Recovery & { orphaned: string[] } {
  const recovery = recoverJournals({ home: ctx.home, runtime: ctx.runtime, stagingDir: ctx.stagingDir, ...(ctx.hooks ? { hooks: ctx.hooks } : {}) });
  const known = new Set(Object.keys(readOwners(ctx.home, ctx.runtime).owners));
  const orphaned: string[] = [];
  for (const receipt of listReceipts(ctx.home, ctx.runtime)) {
    const requiredBy = receipt.requiredBy.filter((o) => known.has(o));
    if (requiredBy.length === receipt.requiredBy.length) continue;
    orphaned.push(receipt.alias);
    if (requiredBy.length > 0) writeReceipt(ctx.home, { ...receipt, requiredBy });
    else removeOwned(ctx.home, ctx.runtime, ctx.skillsDir, receipt);
  }
  return { ...recovery, orphaned };
}

function refuseConflicts(plan: InstallPlan): void {
  if (plan.conflicts === 0) return;
  const conflicts = plan.actions.filter((a) => a.action === 'conflict');
  throw conflictError(`${plan.conflicts} skill(s) conflict with local files or other sources; nothing was changed`, { owner: plan.owner, conflicts });
}

/** Applies a fresh plan. With `uninstall`, the owner's record is dropped instead of written. */
export async function applyOwned(ctx: InstallContext, owned: OwnedLock, plan: InstallPlan, uninstall = false): Promise<ApplyResult> {
  refuseConflicts(plan);
  const trees = new Map<string, VerifiedTree>();
  const deps = { registry: ctx.registry, keys: ctx.keys, cacheDir: join(ctx.home, 'cache', 'blobs'), runtime: ctx.runtime };
  for (const pkg of packagesToFetch(plan, owned.lock)) trees.set(pkg.alias, await fetchVerified(deps, pkg, owned.overlays.get(pkg.alias) ?? []));

  const result: ApplyResult = { owner: owned.owner, planDigest: plan.planDigest, changed: [], removed: [] };
  const byAlias = new Map(owned.lock.packages.map((p) => [p.alias, p]));
  const tx = { home: ctx.home, runtime: ctx.runtime, skillsDir: ctx.skillsDir, stagingDir: ctx.stagingDir, hooks: ctx.hooks, now: ctx.now() };
  for (const action of plan.actions) {
    const existing = readReceipt(ctx.home, ctx.runtime, action.alias);
    if (action.action === 'install' || action.action === 'update') {
      const pkg = byAlias.get(action.alias)!;
      const tree = trees.get(action.alias)!;
      const owners = [...new Set([...(existing?.requiredBy ?? []), owned.owner])].sort();
      const receipt: InstallReceipt = {
        schema: RECEIPT_SCHEMA,
        runtime: ctx.runtime,
        alias: pkg.alias,
        package: pkg.package,
        version: pkg.version,
        releaseDigest: pkg.releaseDigest,
        compositionDigest: pkg.compositionDigest,
        overlayDigests: pkg.overlayDigests,
        files: tree.files.map((f) => ({ path: f.path, sha256: f.sha256, mode: f.mode })),
        requiredBy: owners,
        installedAt: tx.now.toISOString(),
      };
      const backup = action.action === 'update' ? action.backup : [];
      const done = applyTreeChange(tx, { alias: action.alias, tree, receipt, previous: existing, preserve: action.preserve, backup });
      const executable = tree.files.filter((f) => f.mode === '100755').map((f) => f.path);
      result.changed.push({ alias: action.alias, action: action.action, ...done, ...(executable.length > 0 ? { executable } : {}) });
    } else if (action.action === 'unchanged' && action.addOwner && existing) {
      writeReceipt(ctx.home, { ...existing, requiredBy: [...existing.requiredBy, owned.owner].sort() });
    } else if (action.action === 'release' && existing) {
      writeReceipt(ctx.home, { ...existing, requiredBy: action.remainingOwners });
      result.changed.push({ alias: action.alias, action: 'release', backupDir: null, preserved: [], displaced: [] });
    } else if (action.action === 'remove' && existing) {
      result.removed.push(removeOwned(ctx.home, ctx.runtime, ctx.skillsDir, existing));
    }
  }
  const owners = readOwners(ctx.home, ctx.runtime);
  if (uninstall) delete owners.owners[owned.owner];
  else owners.owners[owned.owner] = { ref: owned.ref, lock: owned.lock };
  writeOwners(ctx.home, ctx.runtime, owners);
  return result;
}
