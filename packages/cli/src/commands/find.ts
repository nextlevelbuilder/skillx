import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { searchSkills, type SearchResult } from '../lib/search-api.js';
import { runCommand } from '../lib/run-command.js';
import { resolveAndUseSkill } from './use.js';

/** Lists the hits, asks which one to open, and opens it the way `use <slug>` does. */
async function pickAndUse(results: SearchResult[]): Promise<void> {
  if (results.length === 0) {
    console.log(chalk.yellow('\nNo skills found matching your query.'));
    console.log(chalk.dim('Try different search terms or browse all skills at https://skillx.sh'));
    return;
  }

  console.log(chalk.bold.green(`\n✓ Found ${results.length} skill(s)\n`));
  results.forEach((skill, i) => {
    const rating = chalk.yellow(`⭐ ${(skill.avg_rating ?? 0).toFixed(1)}`);
    console.log(`${chalk.bold.white(`[${i + 1}]`)} ${chalk.cyan(skill.name)} ${chalk.magenta(skill.category)} ${rating}`);
    console.log(`    ${chalk.dim(truncate(skill.description, 80))}`);
  });
  console.log();

  const rl = readline.createInterface({ input, output });
  let answer: string;
  try {
    answer = await rl.question(chalk.cyan(`Select a skill [1-${results.length}] or press Enter to cancel: `));
  } finally {
    rl.close();
  }

  const choice = parseInt(answer.trim(), 10);
  if (isNaN(choice) || choice < 1 || choice > results.length) {
    console.log(chalk.dim('\nCancelled.'));
    return;
  }
  await resolveAndUseSkill(results[choice - 1].slug, { raw: false });
}

/**
 * `find` is interactive for people. With `--json` it never prompts: it returns
 * the hits, and the caller follows up with `skillx use <slug>`.
 */
export const findCommand = new Command('find')
  .description('Search and use a skill in one command')
  .argument('<query>', 'Search query')
  .option('--json', 'emit the hits as a machine-readable envelope, without prompting')
  .action((query: string, options: { json?: boolean }) =>
    runCommand(
      { json: options.json === true, spinner: 'Searching for skills...' },
      async () => {
        const { results } = await searchSkills(query);
        return { query, results, count: results.length };
      },
      (page) => pickAndUse(page.results),
    ),
  );

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}
