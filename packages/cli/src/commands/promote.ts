import { Command } from 'commander';
import chalk from 'chalk';
import { parsePackageName, publishCredential, registryFetch, runCommand, usageError } from '../lib/release-cli.js';
import { resolveRegistry } from './release-publish.js';

const CHANNELS = ['stable', 'beta', 'alpha'];
const TARGET = /^(@[^@/\s]+\/[^@/\s]+)@([^@\s]+)$/;

interface PromoteOptions {
  to: string;
  from?: string;
  reason?: string;
  registry?: string;
  oidc?: boolean;
  oidcAudience?: string;
  json?: boolean;
}

/** `@publisher/slug@version` split into its package name and version. */
export function parseReleaseTarget(raw: string): { handle: string; slug: string; name: string; version: string } {
  const match = TARGET.exec(raw);
  if (!match) throw usageError(`expected @publisher/slug@version, got ${JSON.stringify(raw)}`);
  return { ...parsePackageName(match[1]), version: match[2] };
}

/**
 * Moves a published release to another channel (`POST .../promote`). A
 * publish credential (scoped key or `--oidc`) may only promote (alpha -> beta
 * -> stable); the package owner's account key may also demote. Every attempt
 * is audited by the registry.
 */
export async function runPromote(target: string, options: PromoteOptions) {
  const release = parseReleaseTarget(target);
  for (const [flag, value] of [['--to', options.to], ['--from', options.from]] as const) {
    if (value !== undefined && !CHANNELS.includes(value)) throw usageError(`${flag} must be one of: ${CHANNELS.join(', ')}`);
  }
  const base = resolveRegistry(options.registry);
  const credential = await publishCredential(base, release.handle, options);
  const body: Record<string, string> = { to: options.to };
  if (options.from !== undefined) body.from = options.from;
  if (options.reason !== undefined) body.reason = options.reason;
  return registryFetch(`${base}/api/v1/packages/@${release.handle}/${release.slug}/releases/${encodeURIComponent(release.version)}/promote`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${credential}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

export const promoteCommand = new Command('promote')
  .description('Move a published release to another channel, e.g. beta -> stable (audited)')
  .argument('<release>', '@publisher/slug@version')
  .requiredOption('--to <channel>', 'stable | beta | alpha')
  .option('--from <channel>', 'expected current channel (the move fails if it changed)')
  .option('--reason <text>', 'reason recorded in the audit log')
  .option('--registry <url>', 'registry base URL (default: configured base URL)')
  .option('--oidc', 'authenticate with the GitHub Actions OIDC token (trusted publishing)')
  .option('--oidc-audience <aud>', 'audience requested for the OIDC token', 'skillx')
  .option('--json', 'print the result as a JSON envelope')
  .action(async (target: string, options: PromoteOptions) => {
    await runCommand('promote', options.json, () => runPromote(target, options), (result) => {
      console.log(chalk.bold.green(`${target}: ${String(result.from)} -> ${String(result.to)}`));
      console.log(`  releaseDigest: ${chalk.cyan(String(result.releaseDigest))}`);
    });
  });
