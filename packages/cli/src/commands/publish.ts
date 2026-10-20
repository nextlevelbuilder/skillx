import { Command } from 'commander';
import { existsSync } from 'node:fs';
import chalk from 'chalk';
import { runCommand } from '../lib/release-cli.js';
import { runImport } from './import.js';
import { renderPublished, runReleasePublish, withReleasePublishOptions } from './release-publish.js';
import type { ReleasePublishOptions } from './release-publish.js';

const GITHUB_URL = /^(?:https?:\/\/|git@)(?:www\.)?github\.com[/:]/i;
const OWNER_REPO = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/;

export const IMPORT_DEPRECATION =
  'warning: `skillx publish <owner/repo|github-url>` is deprecated and will be removed; use `skillx import <owner/repo>`. `skillx publish <dir>` now publishes a release.';

/**
 * Which `publish` the caller means: a GitHub repository (the old marketplace
 * import) or a package to release. A path that exists, or any release option,
 * is always a release; only a GitHub URL or an `owner/repo` that is not a
 * local path is an import.
 */
export function publishMode(source: string | undefined, options: Partial<ReleasePublishOptions>): 'import' | 'release' {
  if (options.name !== undefined || options.releaseVersion !== undefined) return 'release';
  if (source === undefined) return 'import';
  if (existsSync(source)) return 'release';
  return GITHUB_URL.test(source) || OWNER_REPO.test(source) ? 'import' : 'release';
}

interface PublishOptions extends ReleasePublishOptions {
  scan?: boolean;
  dryRun?: boolean;
}

export const publishCommand = withReleasePublishOptions(
  new Command('publish')
    .description('Publish a package directory as an immutable SkillX release (`<owner/repo>` still imports, deprecated: use `skillx import`)')
    .argument('[source]', 'package directory (packs HEAD) or git ref (with --path); owner/repo or GitHub URL = deprecated import')
    .option('-s, --scan', 'import only (deprecated): scan the whole repo for SKILL.md files')
    .option('--dry-run', 'import only (deprecated): show what would be imported'),
).action(async (source: string | undefined, options: PublishOptions) => {
  if (publishMode(source, options) === 'import') {
    console.error(chalk.yellow(IMPORT_DEPRECATION));
    await runImport(source, { path: options.path, scan: options.scan, dryRun: options.dryRun, json: options.json });
    return;
  }
  await runCommand('publish', options.json, () => runReleasePublish(source ?? '.', options), renderPublished);
});
