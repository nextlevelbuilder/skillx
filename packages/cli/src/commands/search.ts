import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { searchSkills } from '../lib/search-api.js';
import type { CompatibilityFilterReport, SearchResult } from '../lib/search-api.js';
import { exitCodeFor, fromError, serialize, success } from '../lib/output.js';
import { resolveAndUseSkill } from './use.js';

interface SearchOptions {
  use?: boolean;
  compatible?: string;
  json?: boolean;
}

const STATUS_COLOR: Record<string, (s: string) => string> = {
  verified: chalk.green,
  declared: chalk.cyan,
  unknown: chalk.yellow,
  unsupported: chalk.red,
  blocked: chalk.red,
};

function compatibilityCell(skill: SearchResult, runtime: string): string {
  const entry = skill.compatibility?.find((summary) => summary.runtime === runtime);
  if (!entry) return chalk.dim('—');
  const paint = STATUS_COLOR[entry.status] ?? chalk.white;
  return paint(entry.status);
}

/** States plainly what the filter did, so a short page is never a mystery. */
function printFilterReport(report: CompatibilityFilterReport): void {
  console.log(
    chalk.dim(
      `\nCompatibility filter '${report.runtime}': ${report.matched} matched, ` +
        `${report.undecided} declare nothing, ${report.refused} refuse it ` +
        `(of ${report.evaluated} examined).`,
    ),
  );
  if (report.poolExhausted) {
    console.log(chalk.yellow('  The candidate pool filled up; more matches may exist.'));
  }
}

export const searchCommand = new Command('search')
  .description('Search for skills in the SkillX marketplace')
  .argument('<query>', 'Search query')
  .option('-u, --use', 'Auto-pick the top result and show its details')
  .option('-c, --compatible <runtime>', 'only return skills that declare support for this runtime')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action(async (query: string, options: SearchOptions) => {
    const useJson = options.json === true;
    const spinner = useJson ? null : ora('Searching for skills...').start();

    try {
      const outcome = await searchSkills(query, {
        ...(options.compatible ? { compatible: options.compatible } : {}),
      });
      spinner?.stop();

      if (useJson) {
        const envelope = success({
          query,
          results: outcome.results,
          count: outcome.results.length,
          ...(outcome.compatibilityFilter ? { compatibilityFilter: outcome.compatibilityFilter } : {}),
          ...(outcome.note ? { note: outcome.note } : {}),
        });
        console.log(serialize(envelope));
        process.exit(exitCodeFor(envelope));
      }

      if (outcome.results.length === 0) {
        console.log(chalk.yellow('\nNo skills found matching your query.'));
        if (outcome.note) console.log(chalk.dim(outcome.note));
        else console.log(chalk.dim('Try different search terms or browse all skills at https://skillx.sh'));
        if (outcome.compatibilityFilter) printFilterReport(outcome.compatibilityFilter);
        return;
      }

      if (options.use) {
        const top = outcome.results[0];
        console.log(chalk.dim(`Top result for "${query}": ${chalk.cyan(`${top.author}/${top.name}`)}\n`));
        await resolveAndUseSkill(`${top.author}/${top.name}`, { raw: false });
        return;
      }

      console.log(chalk.bold.green(`\n✓ Found ${outcome.results.length} skill(s)\n`));

      const runtime = options.compatible;
      const header = `${padRight('SKILL', 40)} ${padRight('CATEGORY', 15)} ${padRight('RATING', 8)}${runtime ? ` ${padRight(runtime.toUpperCase(), 12)}` : ''} DESCRIPTION`;
      console.log(chalk.bold(header));
      console.log(chalk.dim('─'.repeat(header.length)));

      outcome.results.forEach((skill) => {
        const displayId = `${skill.author}/${skill.name}`;
        const rating = skill.avg_rating ?? 0;
        const cols = [
          chalk.cyan(padRight(displayId, 40)),
          chalk.magenta(padRight(skill.category, 15)),
          chalk.yellow(padRight(`⭐ ${rating.toFixed(1)}`, 8)),
        ];
        if (runtime) cols.push(padRight(compatibilityCell(skill, runtime), 12));
        console.log(`${cols.join(' ')} ${truncate(skill.description, 40)}`);
      });

      if (outcome.compatibilityFilter) printFilterReport(outcome.compatibilityFilter);
      console.log(chalk.dim(`\nUse ${chalk.cyan('skillx use <slug>')} to view and install a skill`));
    } catch (error) {
      spinner?.stop();
      const envelope = fromError(error);
      if (useJson) console.log(serialize(envelope));
      else console.error(chalk.red(`\n✗ ${envelope.error.message}`));
      process.exit(exitCodeFor(envelope));
    }
  });

function padRight(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width - 3) + '...' : str.padEnd(width);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}
