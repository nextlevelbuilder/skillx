import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { apiRequest, ApiError } from '../lib/api-client.js';
import { searchSkills } from '../lib/search-api.js';
import {
  displaySkill,
  type SkillDetails,
  type SkillDetailResponse,
  type DisplayOptions,
} from './use-display.js';

interface RegisterResponse {
  skill?: SkillDetails;
  created?: boolean;
  skills?: Array<{ slug: string; name: string; author: string }>;
  registered?: number;
  skipped?: number;
}

type IdentifierType = 'search' | 'three-part' | 'two-part' | 'slug';

interface ParsedIdentifier {
  type: IdentifierType;
  parts: string[];
}

/** Parse identifier into type + parts */
export function parseIdentifier(input: string): ParsedIdentifier {
  if (input.includes(' ')) return { type: 'search', parts: [input] };

  const slashParts = input.split('/');
  if (slashParts.length === 3) return { type: 'three-part', parts: slashParts };
  if (slashParts.length === 2) return { type: 'two-part', parts: slashParts };
  return { type: 'slug', parts: [input] };
}

/**
 * Resolve identifier and use the skill. Exported for use by search --use.
 *
 * Resolution chain:
 * - spaces → search mode
 * - x/y/z (three-part) → DB lookup slug "x-z", fallback register from repo y
 * - x/y (two-part) → DB lookup slug "x-y", fallback scan repo y for skills
 * - single word → DB lookup, fallback search
 */
export async function resolveAndUseSkill(
  identifier: string,
  options: DisplayOptions,
): Promise<void> {
  const parsed = parseIdentifier(identifier);

  switch (parsed.type) {
    case 'search':
      return searchAndUse(parsed.parts[0], options);

    case 'three-part': {
      const [org, repo, skillName] = parsed.parts;
      const slug = `${org}-${skillName}`.toLowerCase();
      return resolveBySlug(slug, identifier, options, {
        registerFallback: { owner: org, repo, skill_path: skillName },
      });
    }

    case 'two-part': {
      const [author, skillName] = parsed.parts;
      const slug = `${author}-${skillName}`.toLowerCase();
      return resolveBySlug(slug, identifier, options, {
        registerFallback: { owner: author, repo: skillName, scan: true },
      });
    }

    case 'slug':
      return resolveBySlug(parsed.parts[0], identifier, options, {
        searchFallback: true,
      });
  }
}

/** Core resolution: DB lookup with fallback to register or search */
async function resolveBySlug(
  slug: string,
  displayId: string,
  options: DisplayOptions,
  fallback: {
    registerFallback?: { owner: string; repo: string; skill_path?: string; scan?: boolean };
    searchFallback?: boolean;
  },
): Promise<void> {
  const spinner = ora(`Fetching skill: ${displayId}...`).start();

  try {
    const res = await apiRequest<SkillDetailResponse>(`/api/skills/${slug}`);
    spinner.stop();
    displaySkill(res.skill, displayId, options, res.references, res.scripts);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) {
      spinner.stop();
      throw err;
    }

    if (fallback.registerFallback) {
      spinner.text = 'Skill not found. Scanning GitHub...';
      try {
        const registerRes = await apiRequest<RegisterResponse>('/api/skills/register', {
          method: 'POST',
          body: JSON.stringify(fallback.registerFallback),
        });
        spinner.stop();
        handleRegisterResult(registerRes, displayId, options);
      } catch (regErr) {
        spinner.stop();
        throw regErr;
      }
    } else if (fallback.searchFallback) {
      spinner.stop();
      console.log(chalk.dim(`Skill "${displayId}" not found, searching...`));
      await searchAndUse(displayId, options);
    } else {
      spinner.stop();
      throw err;
    }
  }
}

/** Handle register API response (single skill or multi-skill scan) */
function handleRegisterResult(
  res: RegisterResponse,
  displayId: string,
  options: DisplayOptions,
): void {
  if (res.skill) {
    if (res.created) {
      console.log(chalk.green(`\nRegistered new skill from GitHub: ${displayId}`));
    }
    displaySkill(res.skill, displayId, options);
    return;
  }

  if (res.skills && res.skills.length > 0) {
    console.log(chalk.bold.green(`\nFound ${res.skills.length} skill(s) in repo:\n`));
    res.skills.forEach((s) => {
      console.log(`  ${chalk.cyan(`${s.author}/${s.name}`)}`);
    });
    console.log(chalk.dim(`\nUse ${chalk.cyan(`skillx use ${displayId}/<skill-name>`)} to use a specific skill`));
    if (res.registered) {
      console.log(chalk.dim(`(${res.registered} newly registered, ${res.skipped || 0} already existed)`));
    }
    return;
  }

  console.log(chalk.yellow(`\nNo skills found in ${displayId}`));
}

/** Search for a keyword and use the top result */
async function searchAndUse(query: string, options: DisplayOptions): Promise<void> {
  const spinner = ora(`Searching for "${query}"...`).start();
  const results = await searchSkills(query);
  spinner.stop();

  if (results.length === 0) {
    console.log(chalk.yellow('\nNo skills found matching your query.'));
    console.log(chalk.dim('Try different search terms or browse all skills at https://skillx.sh'));
    return;
  }

  const top = results[0];
  console.log(chalk.dim(`Top result for "${query}": ${chalk.cyan(`${top.author}/${top.name}`)}\n`));
  await resolveAndUseSkill(`${top.author}/${top.name}`, options);
}

export const useCommand = new Command('use')
  .description('Use a skill by author/name, org/repo/skill, slug, or keywords')
  .argument('<identifier>', 'author/skill, org/repo/skill, slug, or search keywords')
  .option('-r, --raw', 'Output raw content only (for piping)')
  .option('-s, --search', 'Force search mode')
  .option('--include-refs', 'Include references in output')
  .option('--include-scripts', 'Include scripts in output')
  .action(async (identifier: string, options: { raw?: boolean; search?: boolean; includeRefs?: boolean; includeScripts?: boolean }) => {
    const raw = options.raw ?? false;
    const includeRefs = options.includeRefs ?? false;
    const includeScripts = options.includeScripts ?? false;

    try {
      if (options.search) {
        await searchAndUse(identifier, { raw, includeRefs, includeScripts });
        return;
      }
      await resolveAndUseSkill(identifier, { raw, includeRefs, includeScripts });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 404) {
          console.error(chalk.red(`\n✗ Skill not found: ${identifier}`));
        } else if (error.status === 429) {
          console.error(chalk.red('\n✗ Rate limited. Try again later.'));
        } else {
          console.error(chalk.red(`\n✗ API Error: ${error.message}`));
        }
      } else if (error instanceof Error) {
        console.error(chalk.red(`\n✗ Network Error: ${error.message}`));
        console.error(chalk.dim('Check your internet connection or try again later.'));
      } else {
        console.error(chalk.red('\n✗ An unexpected error occurred'));
      }
      process.exit(1);
    }
  });
