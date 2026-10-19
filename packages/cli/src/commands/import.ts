import { Command } from 'commander';
import { execSync } from 'node:child_process';
import chalk from 'chalk';
import ora from 'ora';
import { apiRequest, ApiError } from '../lib/api-client.js';
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

/** Parse explicit "owner/repo" argument */
function parseRepoArg(arg: string): { owner: string; repo: string } | null {
  const parts = arg.split('/');
  if (parts.length === 2 && parts[0] && parts[1]) {
    return { owner: parts[0], repo: parts[1] };
  }
  return null;
}

export const publishCommand = new Command('publish')
  .description('Publish skills from a GitHub repo to SkillX marketplace')
  .argument('[repo]', 'owner/repo (auto-detects from git remote if omitted)')
  .option('-p, --path <path>', 'Specific skill subfolder path')
  .option('-s, --scan', 'Scan entire repo for all SKILL.md files')
  .option('--dry-run', 'Show what would be published without calling API')
  .action(async (repoArg: string | undefined, options: { path?: string; scan?: boolean; dryRun?: boolean }) => {
    try {
      // Require API key
      const apiKey = getApiKey();
      if (!apiKey) {
        console.error(chalk.red('\nAPI key required to publish skills.'));
        console.error(chalk.dim('Set your API key with: skillx config set api-key <key>'));
        console.error(chalk.dim('Get an API key at: https://skillx.sh/settings'));
        process.exit(1);
      }

      // Resolve owner/repo
      let remote: { owner: string; repo: string } | null = null;

      if (repoArg) {
        remote = parseRepoArg(repoArg);
        if (!remote) {
          console.error(chalk.red(`\nInvalid repo format: "${repoArg}". Expected: owner/repo`));
          process.exit(1);
        }
      } else {
        remote = detectGitRemote();
        if (!remote) {
          console.error(chalk.red('\nCould not detect GitHub repo from git remote.'));
          console.error(chalk.dim('Specify explicitly: skillx publish owner/repo'));
          process.exit(1);
        }
        console.log(chalk.dim(`Detected repo: ${remote.owner}/${remote.repo}`));
      }

      // Build request body
      const body: Record<string, unknown> = {
        owner: remote.owner,
        repo: remote.repo,
      };

      if (options.path) {
        body.skill_path = options.path;
      } else if (options.scan) {
        body.scan = true;
      }

      // Dry run — just show what would happen
      if (options.dryRun) {
        console.log(chalk.bold('\nDry run — would publish:'));
        console.log(`  Repository: ${chalk.cyan(`${remote.owner}/${remote.repo}`)}`);
        if (options.path) {
          console.log(`  Skill path: ${chalk.cyan(options.path)}`);
        } else if (options.scan) {
          console.log(`  Mode: ${chalk.cyan('Scan all SKILL.md files')}`);
        } else {
          console.log(`  Mode: ${chalk.cyan('Auto-detect (root skill or scan)')}`);
        }
        console.log(chalk.dim('\nRemove --dry-run to publish.'));
        return;
      }

      // Call register API
      const spinner = ora('Publishing to SkillX...').start();

      try {
        const res = await apiRequest<RegisterResponse>('/api/skills/register', {
          method: 'POST',
          body: JSON.stringify(body),
        });
        spinner.stop();
        displayResult(res, remote.owner, remote.repo);
      } catch (err) {
        spinner.stop();
        throw err;
      }
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          console.error(chalk.red('\nAuthentication failed. Check your API key.'));
          console.error(chalk.dim('Update with: skillx config set api-key <key>'));
        } else if (error.status === 403) {
          console.error(chalk.red('\nPermission denied. You must have access to this GitHub repo.'));
          console.error(chalk.dim('Make sure your GitHub account is a collaborator or owner of the repo.'));
        } else if (error.status === 404) {
          console.error(chalk.red('\nNo SKILL.md found in the repository.'));
          console.error(chalk.dim('Create a SKILL.md file in your repo and try again.'));
        } else {
          console.error(chalk.red(`\nAPI Error: ${error.message}`));
        }
      } else if (error instanceof Error) {
        console.error(chalk.red(`\nError: ${error.message}`));
      } else {
        console.error(chalk.red('\nAn unexpected error occurred'));
      }
      process.exit(1);
    }
  });

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
