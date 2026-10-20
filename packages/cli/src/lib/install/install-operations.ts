import { canonicalJsonBytes, lockDigest } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import { sha256Hex } from './fetch-verify.js';
import { applyOwned, ownedLocks, planOwned, recover } from './install-engine.js';
import type { ApplyResult, OwnedLock } from './install-engine.js';
import type { InstallContext } from './install-context.js';
import { withInstallLock } from './install-context.js';
import { InstallError, conflictError } from './install-errors.js';
import { listReceipts, readOwners } from './install-state.js';
import type { InstallPlan } from './planner.js';
import { checkRuntimes, parseRefs, resolveSource } from './resolver.js';
import type { Resolution, SourceRef } from './resolver.js';

/**
 * The installer operations behind `skillx install|update|uninstall|list`
 * and the local MCP tools. Every mutating operation holds the install lock,
 * recovers interrupted transactions first and then plans afresh.
 */

export interface PlannedItem extends OwnedLock {
  plan: InstallPlan;
}

export interface SourcePlan {
  lock: InstallLock;
  lockDigest: string;
  items: PlannedItem[];
  /** Digest over every item plan: what an MCP `apply` may pin. */
  planDigest: string;
  warnings: string[];
}

const ownerRefOf = (ref: SourceRef, refs: readonly string[]) => (pkg: string) =>
  ref.kind === 'packages' ? refs[ref.packages.findIndex((p) => p.name === pkg)] ?? pkg : refs[0]!;

export async function planResolution(ctx: InstallContext, resolution: Resolution, refFor: (pkg: string) => string, sourceRef: string): Promise<SourcePlan> {
  checkRuntimes(resolution.lock.runtimes, ctx.runtime);
  const items = ownedLocks(resolution.lock, resolution.overlays, refFor, sourceRef).map((owned) => ({ ...owned, plan: planOwned(ctx, owned) }));
  return {
    lock: resolution.lock,
    lockDigest: await lockDigest(resolution.lock),
    items,
    planDigest: `sha256:${sha256Hex(canonicalJsonBytes(items.map((i) => i.plan.planDigest)))}`,
    warnings: resolution.warnings,
  };
}

/** Resolves refs and plans them without changing anything. */
export async function planRefs(ctx: InstallContext, refs: readonly string[]): Promise<SourcePlan> {
  const ref = parseRefs(refs);
  return planResolution(ctx, await resolveSource(ctx.registry, ref), ownerRefOf(ref, refs), refs[0]!);
}

export interface ApplyOutcome extends SourcePlan {
  applied: ApplyResult[];
  recovered: { rolledBack: string[]; rolledForward: string[] };
}

/** Applies a source plan produced by `make` under the lock; `expectDigest` pins the plan the caller saw. */
export async function applyPlanned(ctx: InstallContext, make: () => Promise<SourcePlan>, expectDigest?: string): Promise<ApplyOutcome> {
  return withInstallLock(ctx, async () => {
    const recovery = recover(ctx);
    const planned = await make();
    if (expectDigest !== undefined && expectDigest !== planned.planDigest) {
      throw conflictError('the plan changed since it was shown; plan again', { expected: expectDigest, actual: planned.planDigest });
    }
    const conflicts = planned.items.flatMap((i) => i.plan.actions.filter((a) => a.action === 'conflict'));
    if (conflicts.length > 0) throw conflictError(`${conflicts.length} skill(s) conflict with local files or other sources; nothing was changed`, { conflicts });
    const applied: ApplyResult[] = [];
    for (const item of planned.items) applied.push(await applyOwned(ctx, item, item.plan));
    return { ...planned, applied, recovered: { rolledBack: recovery.rolledBack, rolledForward: recovery.rolledForward } };
  });
}

export const installRefs = (ctx: InstallContext, refs: readonly string[], expectDigest?: string) => applyPlanned(ctx, () => planRefs(ctx, refs), expectDigest);

/**
 * The owner keys refs install under: one for a kit or a collection, one per
 * package (`packages:@scope/name`) for explicit packages, as `ownedLocks`
 * splits them, so each package is updated and uninstalled on its own.
 */
export function ownersOfRefs(refs: readonly string[]): string[] {
  const ref = parseRefs(refs);
  if (ref.kind === 'kit') return [`kit:${ref.kit}`];
  if (ref.kind === 'collection') return [`collection:${ref.id}`];
  return [...new Set(ref.packages.map((p) => `packages:${p.name}`))];
}

/**
 * Uninstalls each owner the refs name; every one must be installed, or nothing
 * is removed. `onUninstalled` runs right after each owner is gone, so a caller
 * keeping a lock file in step loses nothing when a later owner fails.
 */
export async function uninstallRef(ctx: InstallContext, refs: readonly string[], onUninstalled?: (owner: string) => void): Promise<ApplyResult[]> {
  const owners = ownersOfRefs(refs);
  return withInstallLock(ctx, async () => {
    recover(ctx);
    const records = readOwners(ctx.home, ctx.runtime).owners;
    const missing = owners.filter((o) => records[o] === undefined);
    if (missing.length > 0) throw new InstallError('not_found', `${missing.join(', ')} not installed for ${ctx.runtime}`, { owners: missing });
    const results: ApplyResult[] = [];
    for (const owner of owners) {
      const record = records[owner]!;
      const owned = { owner, ref: record.ref, lock: { ...record.lock, packages: [] }, overlays: new Map() };
      results.push(await applyOwned(ctx, owned, planOwned(ctx, owned), true));
      onUninstalled?.(owner);
    }
    return results;
  });
}

/** Re-resolves the named installed sources (all when none is named) and applies the changes. */
export async function updateInstalled(ctx: InstallContext, refs: readonly string[]): Promise<ApplyOutcome[]> {
  const records = readOwners(ctx.home, ctx.runtime).owners;
  const wanted = refs.length > 0 ? ownersOfRefs(refs) : Object.keys(records).sort();
  const outcomes: ApplyOutcome[] = [];
  for (const owner of wanted) {
    const record = records[owner];
    if (record === undefined) throw new InstallError('not_found', `${owner} is not installed for ${ctx.runtime}`, { owner });
    outcomes.push(await installRefs(ctx, [record.ref]));
  }
  return outcomes;
}

export function listInstalled(ctx: InstallContext) {
  const owners = readOwners(ctx.home, ctx.runtime).owners;
  return {
    runtime: ctx.runtime,
    skillsDir: ctx.skillsDir,
    skills: listReceipts(ctx.home, ctx.runtime).map((r) => ({
      alias: r.alias,
      package: r.package,
      version: r.version,
      compositionDigest: r.compositionDigest,
      requiredBy: r.requiredBy,
    })),
    sources: Object.entries(owners)
      .map(([owner, record]) => ({ owner, ref: record.ref, packages: record.lock.packages.map((p) => p.alias) }))
      .sort((a, b) => (a.owner < b.owner ? -1 : 1)),
  };
}
