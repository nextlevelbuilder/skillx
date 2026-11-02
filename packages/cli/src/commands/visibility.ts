import { Command } from 'commander';
import chalk from 'chalk';
import { PACKAGE_VISIBILITIES, type PackageVisibility } from '@skillx/contracts';
import { CliError, parsePackageName, registryFetch, runCommand, usageError } from '../lib/release-cli.js';
import { getApiKey } from '../utils/config-store.js';
import { dashboardUrl, visibilityHint } from '../lib/visibility-hints.js';
import { resolveRegistry } from './release-publish.js';

interface VisibilityOptions {
  registry?: string;
  json?: boolean;
}

interface SetOptions extends VisibilityOptions {
  from?: string;
}

function parseVisibility(raw: string | undefined, label: string): PackageVisibility {
  if (!(PACKAGE_VISIBILITIES as readonly string[]).includes(raw ?? '')) {
    throw usageError(`${label} must be one of: ${PACKAGE_VISIBILITIES.join(', ')}, got ${JSON.stringify(raw ?? '')}`);
  }
  return raw as PackageVisibility;
}

function packageName(raw: string) {
  try {
    return parsePackageName(raw);
  } catch {
    throw usageError(`expected @publisher/slug, got ${JSON.stringify(raw)}`);
  }
}

async function ownerFetch(url: string, init: RequestInit, base: string, name: string): Promise<Record<string, unknown>> {
  try {
    return await registryFetch(url, init);
  } catch (error) {
    if (!(error instanceof CliError)) throw error;
    const hint = visibilityHint((error.extra.details ?? {}) as { status?: number; code?: string | null }, base, name) ?? error.extra.hint;
    throw new CliError(error.code, error.message, { ...error.extra, ...(hint ? { hint } : {}) });
  }
}

function authHeaders(): Record<string, string> {
  const apiKey = getApiKey();
  return apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
}

/** Reads the stored visibility from the release list (`GET .../releases`), as the caller may see it. */
export async function runVisibilityGet(target: string, options: VisibilityOptions) {
  const name = packageName(target);
  const base = resolveRegistry(options.registry);
  const body = await ownerFetch(`${base}/api/v1/packages/@${name.handle}/${name.slug}/releases`, { headers: authHeaders() }, base, name.name);
  if (typeof body.visibility !== 'string') {
    throw new CliError('api_error', 'the registry did not report the package visibility', {
      hint: `Upgrade the registry, or pass --from to \`skillx visibility set\`; the dashboard shows it: ${dashboardUrl(base)}.`,
    });
  }
  return { identity: name.name, visibility: parseVisibility(body.visibility, 'the registry visibility') };
}

/**
 * Changes a package's visibility (`POST .../visibility`, a compare-and-set
 * audited by the registry). Needs the owner's unscoped API key. A key may
 * narrow (to `unlisted` from `public`, anything to `private`); widening needs
 * a signed-in approval in the web dashboard, so the registry refuses it here
 * and the error names the dashboard.
 */
export async function runVisibilitySet(target: string, to: string, options: SetOptions) {
  const name = packageName(target);
  const next = parseVisibility(to, 'visibility');
  const expected = options.from === undefined ? undefined : parseVisibility(options.from, '--from');
  const base = resolveRegistry(options.registry);
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new CliError('auth_error', 'an API key is required', {
      hint: `Set SKILLX_API_KEY or run \`skillx config set-key\` with an unscoped account key; or use ${dashboardUrl(base)}.`,
    });
  }
  const from = expected ?? (await runVisibilityGet(target, options)).visibility;
  if (from === next) {
    // `--from` is only a claim: confirm the stored value before reporting that nothing needs to change.
    const stored = expected === undefined ? from : (await runVisibilityGet(target, options)).visibility;
    if (stored !== next) {
      throw new CliError('api_error', `${name.name} is ${stored}, not ${next} as --from expected`, {
        details: { code: 'visibility_conflict', stored },
        hint: visibilityHint({ code: 'visibility_conflict' }, base, name.name),
      });
    }
    return { identity: name.name, from, to: next, visibility: next, changed: false };
  }
  const body = await ownerFetch(
    `${base}/api/v1/packages/@${name.handle}/${name.slug}/visibility`,
    { method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ from, to: next }) },
    base,
    name.name,
  );
  return { ...body, identity: name.name, from, to: next, changed: true };
}

const registryOption = ['--registry <url>', 'registry base URL (default: configured base URL)'] as const;
const jsonOption = ['--json', 'print the result as a JSON envelope'] as const;

const getCommand = new Command('get')
  .description('Show the visibility of a package you can read')
  .argument('<package>', '@publisher/slug')
  .option(...registryOption)
  .option(...jsonOption)
  .action(async (target: string, options: VisibilityOptions) => {
    await runCommand('visibility get', options.json, () => runVisibilityGet(target, options), (result) => {
      console.log(`${result.identity}: ${chalk.cyan(result.visibility)}`);
    });
  });

const setCommand = new Command('set')
  .description('Change the visibility of your package (audited); making it more visible needs the web dashboard')
  .argument('<package>', '@publisher/slug')
  .argument('<visibility>', PACKAGE_VISIBILITIES.join(' | '))
  .option('--from <visibility>', 'expected current visibility (default: read from the registry); the change fails if it differs')
  .option(...registryOption)
  .option(...jsonOption)
  .action(async (target: string, to: string, options: SetOptions) => {
    await runCommand('visibility set', options.json, () => runVisibilitySet(target, to, options), (result) => {
      if (!result.changed) console.log(`${result.identity} is already ${chalk.cyan(result.visibility)}`);
      else console.log(chalk.bold.green(`${result.identity}: ${result.from} -> ${result.to}`));
    });
  });

export const visibilityCommand = new Command('visibility')
  .description('Show or change the visibility (public, unlisted, private) of a published package')
  .addCommand(getCommand)
  .addCommand(setCommand);
