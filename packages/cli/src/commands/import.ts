import { Command } from 'commander';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import { apiRequest, ApiError } from '../lib/api-client.js';
import { CliError } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';
import { getApiKey } from '../utils/config-store.js';

interface RegisterResponse {
  skill?: { slug: string; name: string; author: string; description: string };
  created?: boolean;
  skills?: Array<{ slug: string; name: string; author: string }>;
  registered?: number;
  skipped?: number;
}

/** Parse owner/repo from a git remote URL (HTTPS or SSH) */
function parseGitRemoteUrl(url: string): { owner: string; repo: string } | null {
  // HTTPS: https://github.com/owner/repo.git
  const httpsMatch = url.match(/github\.com\/([^/]+)\/([^/.]+)/);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }

  // SSH: git@github.com:owner/repo.git
  const sshMatch = url.match(/github\.com:([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2] };
  }

  return null;
}

/** Detect owner/repo from git remote origin */
function detectGitRemote(): { owner: string; repo: string } | null {
  try {
    const url = execSync('git remote get-url origin', { encoding: 'utf-8' }).trim();
    return parseGitRemoteUrl(url);
  } catch {
    return null;
  }
}

/** Parse an explicit "owner/repo" or GitHub URL argument */
export function parseRepoArg(arg: string): { owner: string; repo: string } | null {
  if (arg.includes('github.com')) return parseGitRemoteUrl(arg);
  const parts = arg.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

export interface ImportOptions {
  path?: string;
  scan?: boolean;
  dryRun?: boolean;
  json?: boolean;
}

type ImportResult =
  | { dryRun: true; owner: string; repo: string; request: Record<string, unknown> }
  | { dryRun: false; owner: string; repo: string; detected: boolean; response: RegisterResponse };

/** Resolves the repository and registers it, or describes the request under --dry-run. */
async function importRepo(repoArg: string | undefined, options: ImportOptions): Promise<ImportResult> {
  const remote = repoArg ? parseRepoArg(repoArg) : detectGitRemote();
  if (!remote) {
    throw repoArg
      ? new CliError('usage_error', `Invalid repo format: "${repoArg}". Expected: owner/repo`)
      : new CliError('usage_error', 'Could not detect GitHub repo from git remote.', { hint: 'Specify explicitly: skillx import owner/repo' });
  }

  // Arguments are checked before credentials, so a bad call is a usage error either way.
  if (!getApiKey()) {
    throw new CliError('auth_error', 'API key required to import skills.', {
      hint: 'Run `skillx config set-key` or set SKILLX_API_KEY. Get a key at https://skillx.sh/settings',
    });
  }

  const request: Record<string, unknown> = { owner: remote.owner, repo: remote.repo };
  if (options.path) request.skill_path = options.path;
  else if (options.scan) request.scan = true;
  if (options.dryRun) return { dryRun: true, ...remote, request };

  try {
    const response = await apiRequest<RegisterResponse>('/api/skills/register', { method: 'POST', body: JSON.stringify(request) });
    return { dryRun: false, ...remote, detected: !repoArg, response };
  } catch (error) {
    if (error instanceof ApiError && error.status === 403) {
      throw new CliError('auth_error', 'Permission denied. You must have access to this GitHub repo.', {
        details: { status: 403 },
        hint: 'Make sure your GitHub account is a collaborator or owner of the repo.',
      });
    }
    throw error;
  }
}

function renderImport(result: ImportResult, options: ImportOptions): void {
  if (!result.dryRun) {
    if (result.detected) console.log(chalk.dim(`Detected repo: ${result.owner}/${result.repo}`));
    displayResult(result.response, result.owner, result.repo);
    return;
  }
  console.log(chalk.bold('\nDry run — would publish:'));
  console.log(`  Repository: ${chalk.cyan(`${result.owner}/${result.repo}`)}`);
  if (options.path) console.log(`  Skill path: ${chalk.cyan(options.path)}`);
  else if (options.scan) console.log(`  Mode: ${chalk.cyan('Scan all SKILL.md files')}`);
  else console.log(`  Mode: ${chalk.cyan('Auto-detect (root skill or scan)')}`);
  console.log(chalk.dim('\nRemove --dry-run to publish.'));
}

/** Registers the skills of a GitHub repository with the marketplace (POST /api/skills/register). */
export function runImport(repoArg: string | undefined, options: ImportOptions): Promise<void> {
  return runCommand(
    {
      json: options.json === true,
      ...(options.dryRun ? {} : { spinner: 'Publishing to SkillX...' }),
      errors: { notFoundMessage: 'No SKILL.md found in the repository.' },
    },
    () => importRepo(repoArg, options),
    (result) => renderImport(result, options),
  );
}

export const importCommand = new Command('import')
  .description('Import (register) skills from a GitHub repo into the SkillX marketplace')
  .argument('[repo]', 'owner/repo or GitHub URL (auto-detects from git remote if omitted)')
  .option('-p, --path <path>', 'Specific skill subfolder path')
  .option('-s, --scan', 'Scan entire repo for all SKILL.md files')
  .option('--dry-run', 'Show what would be imported without calling API')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action(runImport);

function displayResult(res: RegisterResponse, owner: string, repo: string): void {
  // Single skill mode
  if (res.skill) {
    if (res.created) {
      console.log(chalk.bold.green(`\nPublished: ${res.skill.name}`));
    } else {
      console.log(chalk.bold.yellow(`\nAlready exists: ${res.skill.name}`));
    }
    console.log(`  Slug: ${chalk.cyan(res.skill.slug)}`);
    console.log(`  Author: ${chalk.dim(res.skill.author)}`);
    if (res.skill.description) {
      console.log(`  Description: ${chalk.dim(res.skill.description.substring(0, 80))}`);
    }
    console.log(chalk.dim(`\nView at: ${chalk.underline(`https://skillx.sh/skills/${res.skill.slug}`)}`));
    return;
  }

  // Multi-skill scan result
  if (res.skills && res.skills.length > 0) {
    console.log(chalk.bold.green(`\nPublished ${res.skills.length} skill(s) from ${owner}/${repo}:\n`));
    for (const s of res.skills) {
      console.log(`  ${chalk.cyan(s.slug)} — ${s.name} by ${chalk.dim(s.author)}`);
    }
    if (res.registered || res.skipped) {
      console.log(chalk.dim(`\n  ${res.registered ?? 0} new, ${res.skipped ?? 0} already existed`));
    }
    return;
  }

  console.log(chalk.yellow(`\nNo skills found in ${owner}/${repo}`));
}
