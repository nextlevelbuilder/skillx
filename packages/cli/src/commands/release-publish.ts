import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { getBaseUrl } from '../utils/config-store.js';
import { CliError, parsePackageName, publishCredential, registryFetch, runCommand, usageError } from '../lib/release-cli.js';
import { createPackCommand, packOrFail } from './pack.js';
import { packSummary } from './release-pack.js';

/** HTTPS form of a git remote without credentials, or null when it has none. */
export function httpsRepoUrl(remote: string): string | null {
  const ssh = /^(?:ssh:\/\/)?git@([^/:]+)[:/](.+?)(?:\.git)?\/?$/.exec(remote.trim());
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  try {
    const url = new URL(remote.trim());
    if (url.protocol !== 'https:') return null;
    return `https://${url.host}${url.pathname.replace(/\.git\/?$/, '').replace(/\/$/, '')}`;
  } catch {
    return null;
  }
}

/** Registry base URL without a trailing slash; the API key only travels over https (plain http only to a loopback host). */
export function registryBaseUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new Error(`invalid registry URL ${JSON.stringify(raw)}`);
  }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new Error(`registry URL must use https (http is allowed only for localhost), got ${url.origin}`);
  }
  if (url.username || url.password || url.search || url.hash) throw new Error('registry URL must not carry credentials, a query or a fragment');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}

/** The registry must have stored exactly the tree that was packed locally. */
export function assertRegistryDigests(
  local: { releaseDigest: string; artifactDigest: string },
  body: Record<string, unknown>,
): void {
  if (body.releaseDigest !== local.releaseDigest) {
    throw new Error(`registry releaseDigest ${String(body.releaseDigest)} does not match the local ${local.releaseDigest}`);
  }
  if (body.created === true && body.artifactDigest !== local.artifactDigest) {
    throw new Error(`registry artifactDigest ${String(body.artifactDigest)} does not match the uploaded ${local.artifactDigest}`);
  }
}

const KIT_ORIGINS = ['remote-signed', 'local-dev'] as const;

/**
 * The `provenance` metadata of a publish: a kit release (`--kit-origin`) must
 * be `@agentkit/*` and is signed as `skillx.release/v2`; without the flag the
 * release is provider `skillx` (v1) and `@agentkit/*` stays reserved.
 */
export function kitProvenance(publisher: string, kitOrigin: string | undefined): { provider: 'kit'; origin: string } | undefined {
  if (kitOrigin === undefined) return undefined;
  if (!(KIT_ORIGINS as readonly string[]).includes(kitOrigin)) {
    throw new Error(`--kit-origin must be one of: ${KIT_ORIGINS.join(', ')}`);
  }
  if (publisher !== 'agentkit') throw new Error('--kit-origin is only for @agentkit/* kit releases');
  return { provider: 'kit', origin: kitOrigin };
}

function originUrl(repoRoot: string): string | null {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? httpsRepoUrl(result.stdout) : null;
}

export interface ReleasePublishOptions {
  name?: string;
  releaseVersion?: string;
  path?: string;
  channel: string;
  kind: string;
  repo?: string;
  kitOrigin?: string;
  script: string[];
  registry?: string;
  idempotencyKey?: string;
  oidc?: boolean;
  oidcAudience?: string;
  json?: boolean;
}

const collect = (value: string, previous: string[]) => [...previous, value];

/** Registry base URL from --registry or the configured base URL; a bad one is a usage error. */
export function resolveRegistry(raw: string | undefined): string {
  try {
    return registryBaseUrl(raw ?? getBaseUrl());
  } catch (error) {
    throw usageError((error as Error).message);
  }
}

/** Packs `input` and uploads it as release `--name`@`--release-version`; the registry must store the same tree. */
export async function runReleasePublish(input: string, options: ReleasePublishOptions) {
  const name = parsePackageName(options.name);
  if (!options.releaseVersion) throw usageError('--release-version is required, e.g. 1.0.0');
  let provenance: ReturnType<typeof kitProvenance>;
  try {
    provenance = kitProvenance(name.handle, options.kitOrigin);
  } catch (error) {
    throw usageError((error as Error).message);
  }
  if (options.repo !== undefined && httpsRepoUrl(options.repo) !== options.repo) {
    throw usageError('--repo must be an https URL without credentials or a trailing .git');
  }
  const base = resolveRegistry(options.registry);
  const packed = await packOrFail(input, options.path, 'publish');
  const credential = await publishCredential(base, name.handle, options);
  const repo = options.repo ?? originUrl(packed.source.repoRoot);
  if (repo === null) console.error(chalk.yellow('warning: no https origin remote; the release will record no source provenance'));

  const metadata = {
    version: options.releaseVersion,
    channel: options.channel,
    kind: options.kind,
    sourceProvenance: repo === null ? null : { repo, commit: packed.commit, path: packed.path },
    declaredScripts: [...options.script].sort(),
    ...(provenance === undefined ? {} : { provenance }),
  };
  const headers: Record<string, string> = {
    Authorization: `Bearer ${credential}`,
    'Content-Type': 'application/x-tar',
    'X-SkillX-Release': Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64'),
  };
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  const body = await registryFetch(`${base}/api/v1/packages/@${name.handle}/${name.slug}/releases`, { method: 'POST', headers, body: packed.tar });
  try {
    assertRegistryDigests(packed, body);
  } catch (error) {
    throw new CliError('api_error', (error as Error).message, { details: { local: packSummary(packed) } });
  }
  return { ...packSummary(packed), ...body, name: name.name } as ReturnType<typeof packSummary> & Record<string, unknown> & { name: string };
}

export function renderPublished(result: Awaited<ReturnType<typeof runReleasePublish>>): void {
  console.log(chalk.bold.green(`${result.created ? 'Published' : 'Already published'} ${result.name}@${String(result.version)}`));
  console.log(`  releaseDigest: ${chalk.cyan(String(result.releaseDigest))}`);
  console.log(`  state: ${result.state === 'published' ? chalk.green('published') : chalk.yellow(String(result.state))}`);
}

/** The release publish options, shared by `skillx publish` and `skillx release publish`. */
export function withReleasePublishOptions(command: Command): Command {
  return command
    .option('-n, --name <@publisher/slug>', 'package name (release mode)')
    // Not --version: the root program owns that flag in every position.
    .option('--release-version <semver>', 'release version, e.g. 1.0.0 (release mode)')
    .option('-p, --path <dir>', 'package directory inside the repository, for a git ref')
    .option('--channel <channel>', 'stable | beta | alpha', 'stable')
    .option('--kind <kind>', 'skill | hook-pack | bundle', 'skill')
    .option('--repo <https-url>', 'source repository URL for provenance (default: git remote origin)')
    .option('--kit-origin <origin>', 'publish an @agentkit/* kit release with this origin: remote-signed | local-dev (needs a releases:publish:@agentkit key)')
    .option('--script <path>', 'declare a packaged file as a script (repeatable)', collect, [])
    .option('--registry <url>', 'registry base URL (default: configured base URL)')
    .option('--idempotency-key <key>', 'Idempotency-Key header: a retry with the same key replays the first answer')
    .option('--oidc', 'authenticate with the GitHub Actions OIDC token (trusted publishing) instead of an API key')
    .option('--oidc-audience <aud>', 'audience requested for the OIDC token', 'skillx')
    .option('--json', 'print the result as a JSON envelope');
}

export function createReleasePublishCommand(): Command {
  return withReleasePublishOptions(
    new Command('publish')
      .description('Pack a skill from git and upload it as an immutable SkillX release (alias of `skillx publish <dir>`)')
      .argument('<source>', 'package directory (packs HEAD) or git ref (with --path)'),
  ).action(async (input: string, options: ReleasePublishOptions) => {
    await runCommand('release publish', options.json, () => runReleasePublish(input, options), renderPublished);
  });
}

export const releaseCommand = new Command('release')
  .description('Aliases of `skillx pack` and `skillx publish <dir>`')
  .addCommand(createPackCommand())
  .addCommand(createReleasePublishCommand());
