import { Command } from 'commander';
import chalk from 'chalk';
import { INSTALL_LOCK_FILENAME } from '@skillx/contracts';
import { applyAdd, planAdd } from '../lib/add/add-install.js';
import type { AddedSkill } from '../lib/add/add-install.js';
import { addedEntryOf, writeAddedLock } from '../lib/add/add-lock.js';
import { openSource, originOf } from '../lib/add/add-refresh.js';
import { parseAddSource, redactCredentials, searchPathOf } from '../lib/add/add-source.js';
import { discoverSkills, prepareSkill } from '../lib/add/skill-discovery.js';
import { conflictError } from '../lib/install/install-errors.js';
import type { ApplyOutcome } from '../lib/install/install-operations.js';
import { assertLockScope } from '../lib/install/lock-file.js';
import { CliError } from '../lib/output.js';
import { assertCanPrompt, confirmInstall, selectSkills } from './add-prompts.js';
import { printAdd, printSkipped } from './add-display.js';
import type { AddResult, AddTarget } from './add-display.js';
import { contextFrom, printPlan, runInstaller } from './install-runner.js';
import type { InstallerOptions } from './install-runner.js';

/**
 * `skillx add <source>`: install skills straight from GitHub, an https git
 * URL or a local directory, through the generic installer (same skills
 * directory, receipts, owners, install lock, conflicts and backups as
 * `skillx install`). Sources are parsed and refused in `lib/add/add-source.ts`,
 * read without following links in `git-source.ts`/`local-source.ts`, and each
 * chosen skill is checked by the release tree rules before the installer sees
 * it. Every failure message is redacted, so a token in a URL never prints.
 *
 * One read installs into every `--runtime` named, in the user's or (with
 * `--project`) the current project's skills directory; every target is
 * planned before any is written, so a conflict in one stops them all. A
 * skill read from git is pinned in the packages lock (`--lock`, default
 * `skillx.lock.json`) for `update` and `sync --locked`.
 */

export interface AddOptions extends Omit<InstallerOptions, 'runtime'> {
  skill?: string[];
  list?: boolean;
  yes?: boolean;
  /** One runtime, several comma-separated, or the option repeated. */
  runtime?: string | string[];
  lock?: string | false;
}

/** The runtimes named, in order and once each; `claude-code` when none is. */
export function runtimesOf(options: Pick<AddOptions, 'runtime'>): string[] {
  const named = [options.runtime ?? []].flat().flatMap((r) => r.split(',')).map((r) => r.trim()).filter(Boolean);
  return named.length === 0 ? ['claude-code'] : [...new Set(named)];
}

export async function runAdd(input: string, options: AddOptions): Promise<AddResult> {
  const source = parseAddSource(input);
  // Resolve every runtime and the lock scope before any clone, so a bad option fails fast.
  const ctxs = options.list ? [] : runtimesOf(options).map((runtime) => contextFrom({ ...options, runtime }));
  if (ctxs.length > 0) assertCanPrompt(options);
  const lockPath = ctxs.length === 0 || options.lock === false || source.kind === 'local' ? null : (options.lock ?? INSTALL_LOCK_FILENAME);
  if (lockPath !== null) assertLockScope(lockPath, 'packages');
  if (!options.json && source.kind !== 'local') console.error(chalk.dim(`cloning ${source.label} ...`));
  const snapshot = openSource(source);
  try {
    const { skills, skipped } = discoverSkills(snapshot, searchPathOf(source));
    const base = { source: source.label, ...(snapshot.commit ? { commit: snapshot.commit } : {}), skipped };
    if (ctxs.length === 0) return { status: 'listed', ...base, skills };
    const names = [...(options.skill ?? []), ...(source.kind === 'github' && source.skill ? [source.skill] : [])];
    const chosen = await selectSkills(skills, skipped, names, options);
    if (chosen === null) return { status: 'cancelled' };
    const version = snapshot.commit ?? 'local';
    const added: AddedSkill[] = chosen.map((s) => ({ alias: s.name, origin: originOf(source, s.dir), ref: source.label, version, tree: prepareSkill(snapshot, s) }));
    // Every target is planned first: a refusal or conflict in one installs nothing anywhere.
    const plans = [];
    for (const ctx of ctxs) plans.push(await planAdd(ctx, added));
    const conflicts = plans.flatMap((p, i) => p.items.flatMap((item) => item.plan.actions.filter((a) => a.action === 'conflict').map((a) => ({ ...a, runtime: ctxs[i]!.runtime }))));
    if (conflicts.length > 0) throw conflictError(`${conflicts.length} skill(s) conflict with local files or other sources; nothing was changed`, { conflicts });
    let expect: Array<string | undefined> = ctxs.map(() => undefined);
    if (!options.json && !options.yes) {
      plans.forEach(printPlan);
      printSkipped(skipped);
      if (!(await confirmInstall())) return { status: 'cancelled' };
      expect = plans.map((p) => p.planDigest);
    }
    const outcomes: ApplyOutcome[] = [];
    let written: string | null = null;
    try {
      for (const [i, ctx] of ctxs.entries()) outcomes.push(await applyAdd(ctx, added, expect[i]));
    } finally {
      // Whatever was installed is pinned, also when a later target failed.
      if (lockPath !== null && outcomes.length > 0) {
        const entries = chosen.flatMap((s, i) => addedEntryOf(source, s.name, s.dir, snapshot.commit, added[i]!.tree.digest) ?? []);
        written = writeAddedLock(lockPath, entries);
      }
    }
    const targets: AddTarget[] = outcomes.map((o, i) => ({
      runtime: ctxs[i]!.runtime,
      scope: ctxs[i]!.scope,
      skillsDir: ctxs[i]!.skillsDir,
      planDigest: o.planDigest,
      applied: o.applied,
      recovered: o.recovered,
    }));
    return {
      status: 'installed',
      ...base,
      ...targets[0]!,
      skills: added.map((a) => ({ alias: a.alias, origin: a.origin, digest: a.tree.digest })),
      targets,
      lockPath: written,
    };
  } finally {
    snapshot.dispose();
  }
}

/** The same failure with every URL credential masked in its message, hint and details. */
export function redactError(error: unknown): unknown {
  if (error instanceof CliError) {
    const { details, hint } = error.extra;
    return new CliError(error.code, redactCredentials(error.message), {
      ...(details === undefined ? {} : { details: JSON.parse(redactCredentials(JSON.stringify(details))) as unknown }),
      ...(hint ? { hint: redactCredentials(hint) } : {}),
    });
  }
  if (error instanceof Error) return new Error(redactCredentials(error.message));
  return error;
}

export const addCommand = new Command('add')
  .description('Install skills from GitHub, an https git URL or a local directory through the installer')
  .argument('<source>', 'owner/repo[/skill] | github:owner/repo[/path][@branch|tag|commit] | https://host/repo.git | ./local/dir')
  .option('-s, --skill <names...>', "skills to install, by name or directory name ('*' for all)")
  .option('-l, --list', 'list the skills in the source; install nothing')
  .option('-y, --yes', 'do not ask; without --skill, install every skill found')
  .option('--force', 'replace a skill added before or an unowned directory (edits backed up, unknown files kept)')
  .option('--runtime <id>', 'target runtime: claude-code or codex; repeat or comma-separate for several (default claude-code)', (value: string, prev: string[] = []) => [...prev, value])
  .option('--project', "install into the current directory's project skills directory (.claude/skills, .agents/skills)")
  .option('--lock <file>', 'packages lock that pins skills read from git', INSTALL_LOCK_FILENAME)
  .option('--no-lock', 'do not write a lock file')
  .option('--json', 'emit a machine-readable envelope instead of text; never asks')
  .action((source: string, options: AddOptions) =>
    runInstaller(
      { json: options.json },
      () =>
        runAdd(source, options).catch((error: unknown) => {
          throw redactError(error);
        }),
      printAdd,
    ),
  );
