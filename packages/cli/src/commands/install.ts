import { Command } from 'commander';
import chalk from 'chalk';
import { INSTALL_LOCK_FILENAME } from '@skillx/contracts';
import { installRefs, listInstalled, ownersOfRefs, planRefs, uninstallRef, updateInstalled } from '../lib/install/install-operations.js';
import type { ApplyOutcome } from '../lib/install/install-operations.js';
import { usageError } from '../lib/install/install-errors.js';
import { planLocked, syncLocked } from '../lib/install/sync-locked.js';
import { assertLockScope, dropFromLockFile, existingLock, lockScope, mergeLock, readLockFile, writeLockFile } from '../lib/install/lock-file.js';
import { parseRefs } from '../lib/install/resolver.js';
import { contextFrom, printPlan, runInstaller } from './install-runner.js';
import type { InstallerOptions } from './install-runner.js';

/**
 * `skillx install | update | uninstall | list | sync`: the generic installer.
 * Sources are `kit:@handle/kit[#revisionId]`, `collection:<id>[#revision]`
 * or `@publisher/package[@version]`; `--runtime` picks the adapter
 * (`claude-code`, default, or `codex`). See docs/cli-reference.md.
 */

interface ApplyOptions extends InstallerOptions {
  dryRun?: boolean;
  lock?: string | false;
}

const withCommon = (cmd: Command) =>
  cmd
    .option('--runtime <id>', 'target runtime: claude-code or codex', 'claude-code')
    .option('--registry <url>', 'registry base URL (default: the configured one)')
    .option('--json', 'emit a machine-readable envelope instead of text');

function printApplied(outcome: ApplyOutcome, lockPath: string | null): void {
  printPlan(outcome);
  for (const a of outcome.applied) {
    for (const c of a.changed) if (c.backupDir) console.log(chalk.yellow(`  ${c.alias}: local changes saved to ${c.backupDir}`));
    for (const r of a.removed) if (r.keptModified.length + r.keptUnknown.length > 0) console.log(chalk.yellow(`  ${r.alias}: kept ${[...r.keptModified, ...r.keptUnknown].join(', ')}`));
  }
  if (lockPath) console.log(chalk.dim(`\nlock written to ${lockPath}`));
  console.log(chalk.green('\n✓ done'));
}

export const installCommand = withCommon(new Command('install'))
  .description('Install a kit revision, a collection or packages into a runtime skills directory')
  .argument('<refs...>', 'kit:@handle/kit[#revisionId] | collection:<id>[#n] | @publisher/package[@version]...')
  .option('--dry-run', 'resolve and plan only; change nothing')
  .option('--force', 'reinstall over local edits (backed up) and unowned directories (unknown files kept)')
  .option('--lock <file>', 'where to write the lock', INSTALL_LOCK_FILENAME)
  .option('--no-lock', 'do not write a lock file')
  .action((refs: string[], options: ApplyOptions) =>
    runInstaller(
      options,
      async () => {
        const ctx = contextFrom(options);
        if (options.dryRun) return { dryRun: true as const, ...(await planRefs(ctx, refs)) };
        const path = options.lock === false ? null : (options.lock ?? INSTALL_LOCK_FILENAME);
        if (path !== null) assertLockScope(path, parseRefs(refs).kind === 'packages' ? 'packages' : ownersOfRefs(refs)[0]!);
        const outcome = await installRefs(ctx, refs);
        const lockPath = path === null ? null : writeLockFile(path, mergeLock(existingLock(path), outcome.lock));
        return { ...outcome, lockPath };
      },
      (data) => ('dryRun' in data ? printPlan(data) : printApplied(data, data.lockPath)),
    ),
  );

export const updateCommand = withCommon(new Command('update'))
  .description('Re-resolve installed sources (all, or the one named) and apply the changes')
  .argument('[refs...]', 'an installed source; all when omitted')
  .option('--force', 'reinstall over local edits (backed up)')
  .option('--lock <file>', 'lock file to refresh when it locks an updated source', INSTALL_LOCK_FILENAME)
  .option('--no-lock', 'leave the lock file alone')
  .action((refs: string[], options: ApplyOptions) =>
    runInstaller(
      options,
      async () => {
        const outcomes = await updateInstalled(contextFrom(options), refs);
        const path = options.lock === false ? null : (options.lock ?? INSTALL_LOCK_FILENAME);
        let lockPath: string | null = null;
        for (const o of outcomes) {
          const existing = path === null ? null : existingLock(path);
          if (existing !== null && lockScope(existing) === lockScope(o.lock)) lockPath = writeLockFile(path!, mergeLock(existing, o.lock));
        }
        return { outcomes, lockPath };
      },
      (data) => data.outcomes.forEach((o, i) => printApplied(o, i === data.outcomes.length - 1 ? data.lockPath : null)),
    ),
  );

export const uninstallCommand = withCommon(new Command('uninstall'))
  .description('Remove a source; skills another source still needs stay, edited and unknown files are kept')
  .argument('<refs...>', 'the source as installed: kit:@handle/kit, collection:<id> or @publisher/package')
  .option('--lock <file>', 'packages lock file to drop the package from', INSTALL_LOCK_FILENAME)
  .option('--no-lock', 'leave the lock file alone')
  .action((refs: string[], options: ApplyOptions) =>
    runInstaller(
      options,
      async () => {
        let lockPath: string | null = null;
        // Each package leaves the packages lock as soon as it is uninstalled, so a later failure leaves the lock in step.
        const dropFromLock = (owner: string) => {
          if (options.lock === false || !owner.startsWith('packages:')) return;
          lockPath = dropFromLockFile(options.lock ?? INSTALL_LOCK_FILENAME, owner.slice('packages:'.length)) ?? lockPath;
        };
        const results = await uninstallRef(contextFrom(options), refs, dropFromLock);
        return { uninstalled: results, lockPath };
      },
      (data) => {
        for (const result of data.uninstalled) {
          for (const c of result.changed) console.log(`  ${chalk.dim('released')} ${c.alias}`);
          for (const r of result.removed) {
            console.log(`  ${chalk.green('removed')}  ${r.alias}`);
            const kept = [...r.keptModified, ...r.keptUnknown];
            if (kept.length > 0) console.log(chalk.yellow(`    kept ${kept.join(', ')}`));
          }
          console.log(chalk.green(`✓ ${result.owner} uninstalled`));
        }
        if (data.lockPath) console.log(chalk.dim(`\nlock updated: ${data.lockPath}`));
      },
    ),
  );

export const listCommand = withCommon(new Command('list'))
  .description('List installed skills and the sources that need them')
  .action((options: InstallerOptions) =>
    runInstaller(
      options,
      async () => listInstalled(contextFrom(options)),
      (data) => {
        console.log(chalk.bold(`\n${data.runtime}`) + chalk.dim(` ${data.skillsDir}`));
        for (const s of data.skills) console.log(`  ${s.alias.padEnd(28)} ${s.package}@${s.version} ${chalk.dim(s.requiredBy.join(', '))}`);
        if (data.skills.length === 0) console.log(chalk.dim('  nothing installed'));
      },
    ),
  );

export const syncCommand = withCommon(new Command('sync'))
  .description('Restore exactly what a lock pins (from a lock file, or a kit revision with --from)')
  .option('--locked', 'required: restore exact digests and refuse any drift')
  .option('--lock <file>', 'lock file to restore', INSTALL_LOCK_FILENAME)
  .option('--from <ref>', 'restore a kit revision instead of a lock file: kit:@handle/kit#revisionId')
  .option('--dry-run', 'plan only; change nothing')
  .option('--force', 'repair local edits (backed up) instead of refusing')
  .action((options: ApplyOptions & { locked?: boolean; from?: string }) =>
    runInstaller(
      options,
      async () => {
        if (!options.locked) throw usageError('sync restores exact digests only; pass --locked');
        const ctx = contextFrom(options);
        if (options.from !== undefined) {
          if (!/^kit:.+#.+$/.test(options.from)) throw usageError('--from needs an exact kit revision: kit:@handle/kit#revisionId');
          if (options.dryRun) return { dryRun: true as const, ...(await planRefs(ctx, [options.from])) };
          return { ...(await installRefs(ctx, [options.from])), lockPath: null };
        }
        const lock = readLockFile(options.lock || INSTALL_LOCK_FILENAME);
        if (options.dryRun) return { dryRun: true as const, ...(await planLocked(ctx, lock)) };
        return { ...(await syncLocked(ctx, lock)), lockPath: null };
      },
      (data) => ('dryRun' in data ? printPlan(data) : printApplied(data, null)),
    ),
  );
