import chalk from 'chalk';
import { createInstallContext } from '../lib/install/install-context.js';
import type { InstallContext } from '../lib/install/install-context.js';
import { usageError } from '../lib/install/install-errors.js';
import type { SourcePlan } from '../lib/install/install-operations.js';
import { createRegistry } from '../lib/install/registry-client.js';
import type { CliFailure } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';
import { getApiKey, getBaseUrl } from '../utils/config-store.js';

/** Options every installer command accepts. */
export interface InstallerOptions {
  runtime?: string;
  registry?: string;
  json?: boolean;
  force?: boolean;
}

export function contextFrom(options: InstallerOptions): InstallContext {
  const baseUrl = options.registry ?? getBaseUrl();
  try {
    new URL(baseUrl);
  } catch {
    throw usageError(`invalid registry URL ${baseUrl}`);
  }
  return createInstallContext({
    registry: createRegistry({ baseUrl, apiKey: getApiKey() }),
    ...(options.runtime ? { runtime: options.runtime } : {}),
    force: options.force === true,
  });
}

/** Human mode: the conflicts a `conflict` failure lists, one line each. */
function printConflicts(envelope: CliFailure): void {
  const conflicts = (envelope.error.details as { conflicts?: Array<{ alias: string; reason: string; files: string[] }> } | undefined)?.conflicts;
  for (const c of conflicts ?? []) console.error(chalk.yellow(`  ${c.alias}: ${c.reason}${c.files.length ? ` (${c.files.slice(0, 5).join(', ')})` : ''}`));
}

/**
 * Runs one installer command through the shared `runCommand`. InstallError is a
 * CliError, so its code, details and hint reach the envelope unchanged.
 */
export function runInstaller<T>(options: InstallerOptions, body: () => Promise<T>, human: (data: T) => void): Promise<void> {
  return runCommand({ json: options.json === true, failureDetails: printConflicts }, body, human);
}

export function printPlan(planned: SourcePlan): void {
  for (const item of planned.items) {
    console.log(chalk.bold(`\n${item.owner}`) + chalk.dim(` → ${item.plan.skillsDir}`));
    for (const a of item.plan.actions) {
      const paint = a.action === 'conflict' ? chalk.red : a.action === 'unchanged' ? chalk.dim : chalk.green;
      const detail = a.action === 'conflict' ? ` ${a.reason}` : 'version' in a ? ` ${a.package}@${a.version}` : '';
      console.log(`  ${paint(a.action.padEnd(9))} ${a.alias}${chalk.dim(detail)}`);
    }
  }
  for (const w of planned.warnings) console.log(chalk.yellow(`  ! ${w}`));
}
