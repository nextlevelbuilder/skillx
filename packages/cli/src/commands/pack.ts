import { Command } from 'commander';
import { writeFileSync } from 'node:fs';
import chalk from 'chalk';
import { CliError, runCommand } from '../lib/release-cli.js';
import { packRelease, packSummary, warnPackNotes } from './release-pack.js';
import type { PackedRelease } from './release-pack.js';

/** Packs, turning a source the registry would reject into a usage error (exit 2). */
export async function packOrFail(input: string, packagePath?: string): Promise<PackedRelease> {
  try {
    const packed = await packRelease(input, { packagePath });
    warnPackNotes(packed);
    return packed;
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('usage_error', `cannot pack ${input}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/** `skillx pack` (and its alias `skillx release pack`). */
export function createPackCommand(): Command {
  return new Command('pack')
    .description('Pack a skill from git at an exact commit into a deterministic release tar')
    .argument('<source>', 'package directory (packs HEAD) or git ref (with --path)')
    .requiredOption('-o, --out <file>', 'output tar file')
    .option('-p, --path <dir>', 'package directory inside the repository, for a git ref')
    .option('--json', 'print the result as a JSON envelope')
    .action(async (input: string, options: { out: string; path?: string; json?: boolean }) => {
      await runCommand(
        'pack',
        options.json,
        async () => {
          const packed = await packOrFail(input, options.path);
          writeFileSync(options.out, packed.tar);
          return { ...packSummary(packed), out: options.out };
        },
        (summary) => {
          console.log(summary.releaseDigest);
          console.error(chalk.dim(`commit ${summary.commit}${summary.path ? ` path ${summary.path}` : ''}`));
          console.error(chalk.dim(`${summary.fileCount} files, ${summary.treeSize} bytes -> ${summary.out} (${summary.artifactDigest})`));
        },
      );
    });
}
