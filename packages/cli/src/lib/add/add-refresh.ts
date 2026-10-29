import { join } from 'node:path';
import { canonicalJsonBytes } from '@skillx/contracts';
import type { InstallLockAdded } from '@skillx/contracts';
import { sha256Hex } from '../install/fetch-verify.js';
import type { InstallContext } from '../install/install-context.js';
import { InstallError, integrityError } from '../install/install-errors.js';
import { CliError } from '../output.js';
import { ADD_OWNER_PREFIX, applyPlanned } from '../install/install-operations.js';
import type { ApplyOutcome, SourcePlan } from '../install/install-operations.js';
import { readOwners } from '../install/install-state.js';
import { addOwnerOf, applyAdd, planAdd } from './add-install.js';
import type { AddedSkill } from './add-install.js';
import { addedEntryOf, entrySourceRef } from './add-lock.js';
import { parseAddSource, searchPathOf } from './add-source.js';
import type { AddSource } from './add-source.js';
import { openGitSource } from './git-source.js';
import { openLocalSource } from './local-source.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';
import type { FoundSkill, SourceSnapshot } from './skill-discovery.js';

/**
 * Re-reading skills installed by `skillx add`:
 *
 * - `update` re-reads each skill's recorded source (the owner's ref, e.g.
 *   `github:owner/repo/skills@v1`, which follows that branch or tag, or the
 *   default branch) and installs the skill found where it was installed
 *   from (or, when it moved, the only skill of its name);
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
  /** Sources that could not be updated; the others were. */
  failures: Array<{ ref: string; aliases: string[]; error: InstallError | Error }>;
}

/**
 * The skill `alias` was installed from: the one whose origin is the recorded
 * one, else the only skill of that name; two of the same name and neither at
 * the recorded place is ambiguous, never a guess.
 */
export function pickUpdated(skills: readonly FoundSkill[], source: AddSource, alias: string, origin: string | undefined): FoundSkill {
  const at = skills.find((s) => originOf(source, s.dir) === origin);
  if (at !== undefined) return at;
  const named = skills.filter((s) => s.name === alias);
  if (named.length === 1) return named[0]!;
  if (named.length === 0) throw new InstallError('not_found', `${alias} is no longer a skill of ${source.label}; uninstall add:${alias} or add it again`, { alias, source: source.label });
  throw new InstallError('conflict', `${source.label} has ${named.length} skills named ${alias} (${named.map((s) => s.dir || '.').join(', ')}) and none where it was installed from; add the one you want again`, { alias, dirs: named.map((s) => s.dir) });
}

/**
 * Updates the named `add:<alias>` owners (all installed ones when `owners` is
 * empty), one read per source. A source that fails is reported in `failures`
 * and the others are still updated.
 */
export async function updateAdded(ctx: InstallContext, owners: readonly string[]): Promise<RefreshOutcome> {
  const records = readOwners(ctx.home, ctx.runtime).owners;
  const wanted = owners.length > 0 ? owners : Object.keys(records).filter((o) => o.startsWith(ADD_OWNER_PREFIX)).sort();
  const bySource = new Map<string, string[]>();
  for (const owner of wanted) {
    const record = records[owner];
    if (record === undefined) throw new InstallError('not_found', `${owner} is not installed for ${ctx.runtime}`, { owner });
    bySource.set(record.ref, [...(bySource.get(record.ref) ?? []), owner.slice(ADD_OWNER_PREFIX.length)]);
  }
  const result: RefreshOutcome = { outcomes: [], entries: [], failures: [] };
  for (const [ref, aliases] of bySource) {
    try {
      await updateSource(ctx, ref, aliases, records, result);
    } catch (error) {
      result.failures.push({ ref, aliases, error: error as Error });
    }
  }
  return result;
}

/** The error to raise after an update wrote what it could; null when every source was updated. */
export function updateFailure(result: RefreshOutcome, lockPath: string | null): InstallError | null {
  if (result.failures.length === 0) return null;
  const first = result.failures[0]!.error;
  const code = first instanceof CliError ? first.code : 'network_error';
  const failures = result.failures.map((f) => ({ ref: f.ref, aliases: f.aliases, code: f.error instanceof CliError ? f.error.code : undefined, message: f.error.message }));
  const updated = result.outcomes.flatMap((o) => o.items.map((i) => i.owner));
  return new InstallError(code, `${failures.length} source(s) could not be updated: ${failures.map((f) => `${f.ref}: ${f.message}`).join('; ')}`, { failures, updated, lockPath });
}

async function updateSource(ctx: InstallContext, ref: string, aliases: readonly string[], records: ReturnType<typeof readOwners>['owners'], result: RefreshOutcome): Promise<void> {
  const source = parseAddSource(ref);
  const snapshot = openSource(source);
  try {
    const { skills } = discoverSkills(snapshot, searchPathOf(source));
    const picked = aliases.map((alias) => ({ alias, found: pickUpdated(skills, source, alias, records[addOwnerOf(alias)]?.lock.packages[0]?.package) }));
    const added: AddedSkill[] = picked.map(({ alias, found }) => ({ alias, origin: originOf(source, found.dir), ref, version: snapshot.commit ?? 'local', tree: prepareSkill(snapshot, found) }));
    result.outcomes.push(await applyAdd(ctx, added, undefined, { replace: true }));
    added.forEach((a, i) => {
      const entry = addedEntryOf(source, a.alias, picked[i]!.found.dir, snapshot.commit, a.tree.digest);
      if (entry !== null) result.entries.push(entry);
    });
  } finally {
    snapshot.dispose();
  }
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
