import { collectionRevisionDigest, lockDigest, validateInstallLock } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import type { InstallContext } from './install-context.js';
import { conflictError, usageError } from './install-errors.js';
import { applyPlanned, planResolution } from './install-operations.js';
import type { ApplyOutcome, SourcePlan } from './install-operations.js';
import { resolveSource } from './resolver.js';
import type { Resolution } from './resolver.js';

/**
 * `skillx sync --locked`: restore exactly what a lock pins, on any machine.
 * The lock is authoritative and nothing is re-resolved to something newer:
 *
 * - a kit lock is compared with the server's lock of the same revision; any
 *   difference (another digest, alias or overlay) is drift and is refused;
 * - a collection lock must name a revision whose content still hashes to the
 *   locked revision digest;
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
