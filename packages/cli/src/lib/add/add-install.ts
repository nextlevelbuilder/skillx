import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION, canonicalJsonBytes, lockDigest, sortLockPackages } from '@skillx/contracts';
import type { InstallLock, InstallLockPackage } from '@skillx/contracts';
import type { VerifiedTree } from '../install/fetch-verify.js';
import { sha256Hex } from '../install/fetch-verify.js';
import type { InstallContext } from '../install/install-context.js';
import { planOwned } from '../install/install-engine.js';
import type { OwnedLock } from '../install/install-engine.js';
import { conflictError, usageError } from '../install/install-errors.js';
import { ADD_OWNER_PREFIX, applyPlanned } from '../install/install-operations.js';
import type { ApplyOutcome, PlannedItem, SourcePlan } from '../install/install-operations.js';
import { readReceipt } from '../install/install-state.js';

/**
 * `skillx add` through the generic installer. Each added skill is its own
 * owner, `add:<alias>`, recorded in the owners file with the source it came
 * from, so `list` shows it and `uninstall add:<alias>` removes it with
 * ownership proof. Trees were read and checked by the caller; the installer
 * plans, stages, journals and swaps them like any release, under the same
 * install lock, conflicts and backups.
 *
 * On top of the installer's rules (an unowned directory needs `--force`, a
 * skill another source needs at another digest is never replaced), `add`
 * never replaces a skill it added before without `--force`; `update` and
 * `sync --locked` pass `replace`, since replacing is what they are for
 * (local edits stay conflicts unless `--force`). A skill read from git is
 * pinned in `skillx.lock.json` as an `added` entry (`add-lock.ts`); a local
 * directory has no portable source to pin.
 */

export interface AddedSkill {
  alias: string;
  /** Where the skill came from, e.g. `github:owner/repo/skills/demo`; no credentials. */
  origin: string;
  /** The source as the user can give it again, recorded as the owner's ref; no credentials. */
  ref: string;
  /** The commit read, or `local`. */
  version: string;
  tree: VerifiedTree;
}

export interface AddPlanOptions {
  /** Replace a skill added before (update, sync) instead of refusing without `--force`. */
  replace?: boolean;
}

export const addOwnerOf = (alias: string) => `${ADD_OWNER_PREFIX}${alias}`;

function owned(skill: AddedSkill): OwnedLock {
  const pkg: InstallLockPackage = { alias: skill.alias, package: skill.origin, version: skill.version, releaseDigest: skill.tree.digest, compositionDigest: skill.tree.digest, overlayDigests: [] };
  const lock: InstallLock = { schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, source: { kind: 'packages' }, runtimes: {}, packages: [pkg] };
  return { owner: addOwnerOf(skill.alias), ref: skill.ref, lock, overlays: new Map(), trees: new Map([[skill.alias, skill.tree]]) };
}

/** Plans the skills; refuses duplicates and, without `--force` or `replace`, replacing a skill added before. */
export async function planAdd(ctx: InstallContext, skills: readonly AddedSkill[], options: AddPlanOptions = {}): Promise<SourcePlan> {
  if (skills.length === 0) throw usageError('no skill selected');
  const seen = new Set<string>();
  for (const s of skills) {
    if (seen.has(s.alias)) throw usageError(`two selected skills install as '${s.alias}'; pick one with --skill`, { alias: s.alias });
    seen.add(s.alias);
  }
  const items: PlannedItem[] = skills.map((s) => {
    const o = owned(s);
    return { ...o, plan: planOwned(ctx, o) };
  });
  if (!ctx.force && !options.replace) {
    const replaced = items.flatMap((i) => i.plan.actions).filter((a) => a.action === 'update');
    if (replaced.length > 0) {
      const from = replaced.map((a) => `${a.alias} (from ${readReceipt(ctx.home, ctx.runtime, a.alias)?.package ?? 'an earlier add'})`);
      throw conflictError(`${from.join(', ')} already installed; pass --force to replace`, {
        conflicts: replaced.map((a) => ({ alias: a.alias, reason: 'installed', files: [] })),
      });
    }
  }
  const lock: InstallLock = { ...items[0]!.lock, packages: sortLockPackages(items.map((i) => i.lock.packages[0]!)) };
  return {
    lock,
    lockDigest: await lockDigest(lock),
    items,
    planDigest: `sha256:${sha256Hex(canonicalJsonBytes(items.map((i) => i.plan.planDigest)))}`,
    warnings: [],
  };
}

/** Plans afresh under the install lock and applies; `expectDigest` pins the plan the user confirmed. */
export function applyAdd(ctx: InstallContext, skills: readonly AddedSkill[], expectDigest?: string, options: AddPlanOptions = {}): Promise<ApplyOutcome> {
  return applyPlanned(ctx, () => planAdd(ctx, skills, options), expectDigest);
}
