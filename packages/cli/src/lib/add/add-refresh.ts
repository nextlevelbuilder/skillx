import { join } from 'node:path';
import { canonicalJsonBytes } from '@skillx/contracts';
import type { InstallLockAdded } from '@skillx/contracts';
import { sha256Hex } from '../install/fetch-verify.js';
import type { InstallContext } from '../install/install-context.js';
import { InstallError, integrityError } from '../install/install-errors.js';
import { ADD_OWNER_PREFIX, applyPlanned } from '../install/install-operations.js';
import type { ApplyOutcome, SourcePlan } from '../install/install-operations.js';
import { readOwners } from '../install/install-state.js';
import { applyAdd, planAdd } from './add-install.js';
import type { AddedSkill } from './add-install.js';
import { addedEntryOf, entrySourceRef } from './add-lock.js';
import { parseAddSource, searchPathOf } from './add-source.js';
import type { AddSource } from './add-source.js';
import { openGitSource } from './git-source.js';
import { openLocalSource } from './local-source.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';
import type { SourceSnapshot } from './skill-discovery.js';

/**
 * Re-reading skills installed by `skillx add`:
 *
 * - `update` re-reads each skill's recorded source (the owner's ref, e.g.
 *   `github:owner/repo/skills@v1`, which follows that branch or tag, or the
 *   default branch) and installs the skill of the same name found there;
 * - `sync --locked` fetches each locked commit and installs the skill at the
 *   locked path only when its tree digest is the locked one.
 *
 * Both replace what `add` installed before; local edits stay conflicts.
 */

/** Opens a parsed source. `transport` is `https` outside tests. */
export function openSource(source: AddSource, transport = 'https'): SourceSnapshot {
  if (source.kind === 'local') return openLocalSource(source.dir);
  return openGitSource(source.cloneUrl, source.label, source.kind === 'github' ? source.ref : undefined, transport);
}

/** Where a skill came from: the source plus the skill's directory in it, never credentials. */
export function originOf(source: AddSource, dir: string): string {
  if (source.kind === 'local') return dir === '' ? source.dir : join(source.dir, ...dir.split('/'));
  if (source.kind === 'github') return `github:${source.owner}/${source.repo}${dir ? `/${dir}` : ''}${source.ref ? `@${source.ref}` : ''}`;
  return dir === '' ? source.label : `${source.label}//${dir}`;
}

export interface RefreshOutcome {
  outcomes: ApplyOutcome[];
  /** Lock entries of the skills read from git, for a packages lock file. */
  entries: InstallLockAdded[];
}

/** Updates the named `add:<alias>` owners (all installed ones when `owners` is empty), one read per source. */
export async function updateAdded(ctx: InstallContext, owners: readonly string[]): Promise<RefreshOutcome> {
  const records = readOwners(ctx.home, ctx.runtime).owners;
  const wanted = owners.length > 0 ? owners : Object.keys(records).filter((o) => o.startsWith(ADD_OWNER_PREFIX)).sort();
  const bySource = new Map<string, string[]>();
  for (const owner of wanted) {
    const record = records[owner];
    if (record === undefined) throw new InstallError('not_found', `${owner} is not installed for ${ctx.runtime}`, { owner });
    bySource.set(record.ref, [...(bySource.get(record.ref) ?? []), owner.slice(ADD_OWNER_PREFIX.length)]);
  }
  const result: RefreshOutcome = { outcomes: [], entries: [] };
  for (const [ref, aliases] of bySource) {
    const source = parseAddSource(ref);
    const snapshot = openSource(source);
    try {
      const { skills } = discoverSkills(snapshot, searchPathOf(source));
      const added: AddedSkill[] = aliases.map((alias) => {
        const found = skills.find((s) => s.name === alias);
        if (found === undefined) throw new InstallError('not_found', `${alias} is no longer a skill of ${source.label}; uninstall add:${alias} or add it again`, { alias, source: source.label });
        return { alias, origin: originOf(source, found.dir), ref, version: snapshot.commit ?? 'local', tree: prepareSkill(snapshot, found) };
      });
      result.outcomes.push(await applyAdd(ctx, added, undefined, { replace: true }));
      for (const a of added) {
        const entry = addedEntryOf(source, a.alias, skills.find((s) => s.name === a.alias)!.dir, snapshot.commit, a.tree.digest);
        if (entry !== null) result.entries.push(entry);
      }
    } finally {
      snapshot.dispose();
    }
  }
  return result;
}

/** Reads every locked skill at its locked commit; any other tree is an `integrity_error`. */
export function readLockedAdded(entries: readonly InstallLockAdded[], transport = 'https'): AddedSkill[] {
  const byCommit = new Map<string, InstallLockAdded[]>();
  for (const e of entries) byCommit.set(`${e.repository} ${e.commit}`, [...(byCommit.get(`${e.repository} ${e.commit}`) ?? []), e]);
  const skills: AddedSkill[] = [];
  for (const group of byCommit.values()) {
    const { repository, commit } = group[0]!;
    const snapshot = openGitSource(repository, repository, commit, transport);
    try {
      for (const entry of group) {
        const found = discoverSkills(snapshot, entry.path).skills.find((s) => s.dir === entry.path);
        if (found === undefined) throw new InstallError('not_found', `${entry.path || 'the root'} of ${repository} at ${commit} is not a skill`, { alias: entry.alias });
        const tree = prepareSkill(snapshot, found);
        if (tree.digest !== entry.treeDigest) {
          throw integrityError(`${entry.alias} at ${repository} ${commit} has tree ${tree.digest}, the lock pins ${entry.treeDigest}`, { alias: entry.alias, expected: entry.treeDigest, actual: tree.digest });
        }
        const ref = entrySourceRef(entry);
        const origin = ref.startsWith('github:') ? ref : entry.path ? `${repository}//${entry.path}` : repository;
        skills.push({ alias: entry.alias, origin, ref, version: commit, tree });
      }
    } finally {
      snapshot.dispose();
    }
  }
  return skills;
}

/** One plan of a lock's packages and its added skills, so conflicts in either stop both. */
export function withAddedPlan(ctx: InstallContext, base: () => Promise<SourcePlan>, added: readonly AddedSkill[]): () => Promise<SourcePlan> {
  if (added.length === 0) return base;
  return async () => {
    const [packages, adds] = [await base(), await planAdd(ctx, added, { replace: true })];
    const items = [...packages.items, ...adds.items];
    return { ...packages, items, planDigest: `sha256:${sha256Hex(canonicalJsonBytes(items.map((i) => i.plan.planDigest)))}`, warnings: [...packages.warnings, ...adds.warnings] };
  };
}

/** `sync --locked` of a lock with added skills: read them first, then apply everything under one install lock. */
export function syncWithAdded(ctx: InstallContext, base: () => Promise<SourcePlan>, added: readonly InstallLockAdded[], transport = 'https'): Promise<ApplyOutcome> {
  return applyPlanned(ctx, withAddedPlan(ctx, base, readLockedAdded(added, transport)));
}
