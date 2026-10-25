import { Command } from 'commander';
import chalk from 'chalk';
import { listLibrary, type LibraryQuery, type LibraryResult } from '../lib/library-api.js';
import { runCommand } from '../lib/run-command.js';

interface LibraryListOptions extends LibraryQuery {
  json?: boolean;
}

function renderLibrary(result: LibraryResult): void {
  if (result.kits.status === 'unavailable') console.error(chalk.yellow(`personal kits are unavailable on this deployment (${result.kits.code})`));
  if (result.items.length === 0) {
    console.log(chalk.dim('Nothing in your library.'));
    return;
  }
  for (const item of result.items) {
    const detail =
      item.kind === 'skill'
        ? (item.latest ? `${item.latest.version}  ${chalk.dim(item.latest.releaseDigest)}` : chalk.dim('no readable release'))
        : (item.effectiveRevision ? `r${item.effectiveRevision.number}  ${chalk.dim(item.effectiveRevision.digest)}  g${item.generation}` : chalk.dim(`no active revision  g${item.generation}`));
    console.log(`${chalk.cyan(item.kind.padEnd(5))} ${chalk.bold(item.identity)}  ${item.visibility}/${item.relation}  ${item.state}  ${detail}`);
    if (item.installRef) console.log(chalk.dim(`      skillx install ${item.installRef}`));
  }
  if (result.nextCursor) console.log(chalk.dim(`\nMore: --cursor ${result.nextCursor}`));
}

const libraryList = new Command('list')
  .description('List the skills and personal kits you own or are entitled to')
  .option('--kind <kind>', 'skill | kit')
  .option('--query <q>', 'name fragment to match (at most 64 characters)')
  .option('--limit <n>', 'page size, 1 to 100 (default 50)')
  .option('--cursor <cursor>', 'read only the page after this cursor (default: follow every page)')
  .option('--json', 'print the result as a JSON envelope')
  .action(async (options: LibraryListOptions) => {
    await runCommand({ json: options.json === true, spinner: 'Reading your library...', failureLabel: 'library list' }, () => listLibrary(options), renderLibrary);
  });

export const libraryCommand = new Command('library')
  .description('Your private library: owned and entitled skills and personal kits (needs library:read)')
  .addCommand(libraryList);
