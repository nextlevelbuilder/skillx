import { Command } from 'commander';
import { spawnSync } from 'node:child_process';
import chalk from 'chalk';
import { getApiKey, getBaseUrl } from '../utils/config-store.js';
import { packRelease, packSummary, releasePackCommand, warnPackNotes } from './release-pack.js';

const NAME_PATTERN = /^@([a-z0-9][a-z0-9._-]*)\/([a-z0-9][a-z0-9._-]*)$/;

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

function originUrl(repoRoot: string): string | null {
  const result = spawnSync('git', ['remote', 'get-url', 'origin'], { cwd: repoRoot, encoding: 'utf8' });
  return result.status === 0 ? httpsRepoUrl(result.stdout) : null;
}

interface PublishOptions {
  name: string;
  releaseVersion: string;
  path?: string;
  channel: string;
  kind: string;
  repo?: string;
  script: string[];
  registry?: string;
  json?: boolean;
}

const collect = (value: string, previous: string[]) => [...previous, value];

export const releasePublishCommand = new Command('publish')
  .description('Pack a skill from git and upload it as an immutable SkillX release (needs a releases:publish API key)')
  .argument('<source>', 'package directory (packs HEAD) or git ref (with --path)')
  .requiredOption('-n, --name <@publisher/slug>', 'package name')
  // Not --version: the root program owns that flag in every position.
  .requiredOption('--release-version <semver>', 'release version, e.g. 1.0.0')
  .option('-p, --path <dir>', 'package directory inside the repository, for a git ref')
  .option('--channel <channel>', 'stable | beta | alpha', 'stable')
  .option('--kind <kind>', 'skill | hook-pack | bundle', 'skill')
  .option('--repo <https-url>', 'source repository URL for provenance (default: git remote origin)')
  .option('--script <path>', 'declare a packaged file as a script (repeatable)', collect, [])
  .option('--registry <url>', 'registry base URL (default: configured base URL)')
  .option('--json', 'print the result as JSON')
  .action(async (input: string, options: PublishOptions) => {
    try {
      const name = NAME_PATTERN.exec(options.name);
      if (!name) throw new Error(`--name must be @publisher/slug, got ${JSON.stringify(options.name)}`);
      const apiKey = getApiKey();
      if (!apiKey) throw new Error('an API key is required: set SKILLX_API_KEY or run skillx config set api-key <key>');
      if (options.repo !== undefined && httpsRepoUrl(options.repo) !== options.repo) {
        throw new Error('--repo must be an https URL without credentials or a trailing .git');
      }

      const packed = await packRelease(input, { packagePath: options.path });
      warnPackNotes(packed);
      const repo = options.repo ?? originUrl(packed.source.repoRoot);
      if (repo === null) console.error(chalk.yellow('warning: no https origin remote; the release will record no source provenance'));

      const metadata = {
        version: options.releaseVersion,
        channel: options.channel,
        kind: options.kind,
        sourceProvenance: repo === null ? null : { repo, commit: packed.commit, path: packed.path },
        declaredScripts: [...options.script].sort(),
      };
      const base = (options.registry ?? getBaseUrl()).replace(/\/+$/, '');
      const res = await fetch(`${base}/api/v1/packages/@${name[1]}/${name[2]}/releases`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/x-tar',
          'X-SkillX-Release': Buffer.from(JSON.stringify(metadata), 'utf8').toString('base64'),
        },
        body: packed.tar,
      });
      const text = await res.text();
      let body: Record<string, unknown> = {};
      try {
        body = JSON.parse(text) as Record<string, unknown>;
      } catch {
        // Non-JSON answers are reported below with their status.
      }
      if (!res.ok) {
        const error = body.error as { code?: string; message?: string } | undefined;
        throw new Error(`registry answered ${res.status}${error?.code ? ` ${error.code}` : ''}: ${error?.message ?? text.slice(0, 300)}`);
      }
      const result = { ...packSummary(packed), ...body };
      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }
      console.log(chalk.bold.green(`${body.created ? 'Published' : 'Already published'} ${options.name}@${options.releaseVersion}`));
      console.log(`  releaseDigest: ${chalk.cyan(String(body.releaseDigest))}`);
      console.log(`  state: ${body.state === 'published' ? chalk.green('published') : chalk.yellow(String(body.state))}`);
    } catch (error) {
      console.error(chalk.red(`release publish failed: ${error instanceof Error ? error.message : String(error)}`));
      process.exit(1);
    }
  });

export const releaseCommand = new Command('release')
  .description('Build and publish immutable, digest-pinned releases')
  .addCommand(releasePackCommand)
  .addCommand(releasePublishCommand);
