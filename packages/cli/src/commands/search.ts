import { Command } from 'commander';
import chalk from 'chalk';
import { searchSkills } from '../lib/search-api.js';
import type { CompatibilityFilterReport, SearchResult } from '../lib/search-api.js';
import { runCommand } from '../lib/run-command.js';
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
  .action((query: string, options: SearchOptions) =>
    runCommand(
      { json: options.json === true, spinner: 'Searching for skills...' },
      async () => {
        const outcome = await searchSkills(query, {
          ...(options.compatible ? { compatible: options.compatible } : {}),
        });
        return {
          query,
          results: outcome.results,
          count: outcome.results.length,
          ...(outcome.compatibilityFilter ? { compatibilityFilter: outcome.compatibilityFilter } : {}),
          ...(outcome.note ? { note: outcome.note } : {}),
        };
      },
      async (page) => {
        const top = page.results[0];
        if (!options.use || !top) return renderResults(page, options.compatible);
        // `--use` continues into `use` with the top hit; it is a human convenience.
        console.log(chalk.dim(`Top result for "${query}": ${chalk.cyan(`${top.author}/${top.name}`)}\n`));
        await resolveAndUseSkill(`${top.author}/${top.name}`, { raw: false });
      },
    ),
  );

interface SearchPage {
  results: SearchResult[];
  compatibilityFilter?: CompatibilityFilterReport;
  note?: string;
}

function renderResults(page: SearchPage, runtime: string | undefined): void {
  if (page.results.length === 0) {
    console.log(chalk.yellow('\nNo skills found matching your query.'));
    if (page.note) console.log(chalk.dim(page.note));
    else console.log(chalk.dim('Try different search terms or browse all skills at https://skillx.sh'));
    if (page.compatibilityFilter) printFilterReport(page.compatibilityFilter);
    return;
  }

  console.log(chalk.bold.green(`\n✓ Found ${page.results.length} skill(s)\n`));

  const header = `${padRight('SKILL', 40)} ${padRight('CATEGORY', 15)} ${padRight('RATING', 8)}${runtime ? ` ${padRight(runtime.toUpperCase(), 12)}` : ''} DESCRIPTION`;
  console.log(chalk.bold(header));
  console.log(chalk.dim('─'.repeat(header.length)));

  page.results.forEach((skill) => {
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

  if (page.compatibilityFilter) printFilterReport(page.compatibilityFilter);
  console.log(chalk.dim(`\nUse ${chalk.cyan('skillx use <slug>')} to view and install a skill`));
}

function padRight(str: string, width: number): string {
  return str.length >= width ? str.substring(0, width - 3) + '...' : str.padEnd(width);
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.substring(0, maxLen - 3) + '...' : str;
}
