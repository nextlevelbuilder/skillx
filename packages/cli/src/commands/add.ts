import { join } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { applyAdd, planAdd } from '../lib/add/add-install.js';
import { parseAddSource, redactCredentials, searchPathOf } from '../lib/add/add-source.js';
import type { AddSource } from '../lib/add/add-source.js';
import { openGitSource } from '../lib/add/git-source.js';
import { openLocalSource } from '../lib/add/local-source.js';
import { discoverSkills, prepareSkill } from '../lib/add/skill-discovery.js';
import type { SourceSnapshot } from '../lib/add/skill-discovery.js';
import { CliError } from '../lib/output.js';
import { confirmInstall, selectSkills } from './add-prompts.js';
import { printAdd, printSkipped } from './add-display.js';
import type { AddResult } from './add-display.js';
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
 */

export interface AddOptions extends InstallerOptions {
  skill?: string[];
  list?: boolean;
  yes?: boolean;
}

export function openSource(source: AddSource): SourceSnapshot {
  if (source.kind === 'local') return openLocalSource(source.dir);
  return openGitSource(source.cloneUrl, source.label, source.kind === 'github' ? source.ref : undefined);
}

/** Where a skill came from: the source plus the skill's directory in it, never credentials. */
export function originOf(source: AddSource, dir: string): string {
  if (source.kind === 'local') return dir === '' ? source.dir : join(source.dir, ...dir.split('/'));
  if (source.kind === 'github') return `github:${source.owner}/${source.repo}${dir ? `/${dir}` : ''}${source.ref ? `@${source.ref}` : ''}`;
  return dir === '' ? source.label : `${source.label}//${dir}`;
}

export async function runAdd(input: string, options: AddOptions): Promise<AddResult> {
  const source = parseAddSource(input);
  // Resolve the runtime before any clone, so a bad --runtime fails fast.
  const ctx = options.list ? null : contextFrom(options);
  if (!options.json && source.kind !== 'local') console.error(chalk.dim(`cloning ${source.label} ...`));
  const snapshot = openSource(source);
  try {
    const { skills, skipped } = discoverSkills(snapshot, searchPathOf(source));
    const base = { source: source.label, ...(snapshot.commit ? { commit: snapshot.commit } : {}), skipped };
    if (ctx === null) return { status: 'listed', ...base, skills };
    const names = [...(options.skill ?? []), ...(source.kind === 'github' && source.skill ? [source.skill] : [])];
    const chosen = await selectSkills(skills, skipped, names, options);
    if (chosen === null) return { status: 'cancelled' };
    const added = chosen.map((s) => ({ alias: s.name, origin: originOf(source, s.dir), tree: prepareSkill(snapshot, s) }));
    const info = { ref: source.label, version: snapshot.commit ?? 'local' };
    let expectDigest: string | undefined;
    if (!options.json && !options.yes) {
      const plan = await planAdd(ctx, info, added);
      printPlan(plan);
      printSkipped(skipped);
      if (!(await confirmInstall())) return { status: 'cancelled' };
      expectDigest = plan.planDigest;
    }
    const outcome = await applyAdd(ctx, info, added, expectDigest);
    return {
      status: 'installed',
      ...base,
      runtime: ctx.runtime,
      skillsDir: ctx.skillsDir,
      skills: added.map((a) => ({ alias: a.alias, origin: a.origin, digest: a.tree.digest })),
      planDigest: outcome.planDigest,
      applied: outcome.applied,
      recovered: outcome.recovered,
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
  .argument('<source>', 'owner/repo[/skill] | github:owner/repo[/path][@ref] | https://host/repo.git | ./local/dir')
  .option('-s, --skill <names...>', "skills to install, by name or directory name ('*' for all)")
  .option('-l, --list', 'list the skills in the source; install nothing')
  .option('-y, --yes', 'do not ask; without --skill, install every skill found')
  .option('--force', 'replace a skill added before or an unowned directory (edits backed up, unknown files kept)')
  .option('--runtime <id>', 'target runtime: claude-code or codex', 'claude-code')
  .option('--json', 'emit a machine-readable envelope instead of text; never asks')
  .action((source: string, options: AddOptions) =>
    runInstaller(
      options,
      () =>
        runAdd(source, options).catch((error: unknown) => {
          throw redactError(error);
        }),
      printAdd,
    ),
  );
