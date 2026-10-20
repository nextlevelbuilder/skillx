import { collectionRevisionDigest, lockDigest, validateInstallLock } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import type { InstallContext } from './install-context.js';
import { conflictError, usageError } from './install-errors.js';
import { applyPlanned, planResolution } from './install-operations.js';
import type { ApplyOutcome, SourcePlan } from './install-operations.js';
import { resolveSource } from './resolver.js';
import type { Resolution } from './resolver.js';
import type { CollectionRevisionView } from './registry-client.js';

/**
 * `skillx sync --locked`: restore exactly what a lock pins, on any machine.
 * The lock is authoritative and nothing is re-resolved to something newer:
 *
 * - a kit lock is compared with the server's lock of the same revision; any
 *   difference (another digest, alias or overlay) is drift and is refused;
 * - a collection lock must name a revision whose content still hashes to the
 *   locked revision digest, and must lock exactly that revision's members
 *   (at their pinned version or digest when the member pins one);
 * - every package is then fetched by its pinned digests and verified, and
 *   local edits to installed files are conflicts, not silently overwritten.
 */

export function parseLock(input: unknown): InstallLock {
  const verdict = validateInstallLock(input);
  if (!verdict.valid) {
    throw usageError('the lock is not a valid skillx.lock/v1 document', { issues: verdict.issues.map((i) => ({ path: i.path, code: i.code })) });
  }
  return input as InstallLock;
}

/**
 * Where a collection lock disagrees with the members of its revision: every
 * member must be locked exactly once and nothing else, a pinned version or
 * digest must be the locked one. A floating member may be locked at any
 * version (the lock is what pins it).
 */
export function memberDrift(members: CollectionRevisionView['members'], lock: InstallLock): string[] {
  const drift: string[] = [];
  const locked = new Map(lock.packages.map((p) => [p.package, p]));
  for (const m of members) {
    const p = locked.get(m.packageName);
    if (p === undefined) drift.push(`${m.packageName}: member not locked`);
    else if (m.version !== undefined && m.version !== p.version) drift.push(`${m.packageName}: member pins ${m.version}, lock has ${p.version}`);
    else if (m.digest !== undefined && m.digest !== p.releaseDigest) drift.push(`${m.packageName}: member pins another release digest`);
    locked.delete(m.packageName);
  }
  for (const name of locked.keys()) drift.push(`${name}: locked but not a member`);
  return drift;
}

async function lockedResolution(ctx: InstallContext, lock: InstallLock): Promise<Resolution> {
  const source = lock.source;
  if (source.kind === 'kit') {
    const remote = await resolveSource(ctx.registry, { kind: 'kit', kit: source.kit, revisionId: source.revisionId });
    const [want, have] = [await lockDigest(lock), await lockDigest(remote.lock)];
    if (want !== have) throw conflictError(`the lock no longer matches kit ${source.kit} revision ${source.revisionNumber}; refusing to drift`, { expected: want, actual: have });
    return remote;
  }
  if (source.kind === 'collection') {
    const rev = await ctx.registry.collectionRevision(source.collectionId, source.revisionNumber);
    const digest = await collectionRevisionDigest({ members: rev.members as never, config: rev.config as never });
    if (digest !== source.revisionDigest) {
      throw conflictError(`collection ${source.collectionId} revision ${source.revisionNumber} changed; refusing to drift`, { expected: source.revisionDigest, actual: digest });
    }
    const drift = memberDrift(rev.members, lock);
    if (drift.length > 0) throw conflictError(`the lock does not pin the members of collection ${source.collectionId} revision ${source.revisionNumber}; refusing to drift`, { drift });
  }
  return { lock, overlays: new Map(), warnings: [] };
}

function refOf(lock: InstallLock): { sourceRef: string; refFor: (pkg: string) => string } {
  const s = lock.source;
  const byName = new Map(lock.packages.map((p) => [p.package, `${p.package}@${p.version}`]));
  const sourceRef = s.kind === 'kit' ? `kit:${s.kit}#${s.revisionId}` : s.kind === 'collection' ? `collection:${s.collectionId}#${s.revisionNumber}` : '';
  return { sourceRef, refFor: (pkg) => byName.get(pkg) ?? pkg };
}

export async function planLocked(ctx: InstallContext, lock: InstallLock): Promise<SourcePlan> {
  const { sourceRef, refFor } = refOf(lock);
  return planResolution(ctx, await lockedResolution(ctx, lock), refFor, sourceRef);
}

export function syncLocked(ctx: InstallContext, input: unknown, expectDigest?: string): Promise<ApplyOutcome> {
  const lock = parseLock(input);
  return applyPlanned(ctx, () => planLocked(ctx, lock), expectDigest);
}
