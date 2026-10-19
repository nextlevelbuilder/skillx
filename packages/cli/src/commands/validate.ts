import { Command } from 'commander';
import chalk from 'chalk';
import { parse as parseYaml } from 'yaml';
import { CliError, parsePackageName, runCommand } from '../lib/release-cli.js';
import { packOrFail } from './pack.js';
import { packSummary } from './release-pack.js';
import type { PackedRelease } from './release-pack.js';

const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;
const KINDS = ['skill', 'hook-pack', 'bundle'];
const CHANNELS = ['stable', 'beta', 'alpha'];

interface ValidateOptions {
  path?: string;
  name?: string;
  releaseVersion?: string;
  kind: string;
  channel: string;
  json?: boolean;
}

/** The frontmatter of the root SKILL.md, or the problems that stop it. */
function readSkill(packed: PackedRelease, problems: string[]): { name: string; description: string } | null {
  const skill = packed.source.files.find((f) => f.path === 'SKILL.md');
  if (!skill) {
    problems.push('SKILL.md is missing at the package root');
    return null;
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(skill.bytes);
  const match = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
  if (!match) {
    problems.push('SKILL.md has no YAML frontmatter (--- ... ---)');
    return null;
  }
  let data: unknown;
  try {
    data = parseYaml(match[1]);
  } catch (error) {
    problems.push(`SKILL.md frontmatter is not valid YAML: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
  const record = (typeof data === 'object' && data !== null ? data : {}) as Record<string, unknown>;
  for (const field of ['name', 'description']) {
    if (typeof record[field] !== 'string' || (record[field] as string).trim() === '') problems.push(`SKILL.md frontmatter needs a non-empty ${field}`);
  }
  return problems.length > 0 ? null : { name: record.name as string, description: record.description as string };
}

/**
 * Checks a package the way publishing would, without uploading: packs it with
 * the registry's tree reader (symlinks, submodules, unsafe paths fail here),
 * requires a root SKILL.md with name and description for a skill, and checks
 * the optional --name, --release-version, --kind and --channel. Exit 0 when
 * valid, 2 with every problem listed when not.
 */
export async function validatePackage(input: string, options: ValidateOptions) {
  const problems: string[] = [];
  if (options.name !== undefined) {
    try {
      parsePackageName(options.name);
    } catch (error) {
      problems.push((error as Error).message);
    }
  }
  if (options.releaseVersion !== undefined && !SEMVER.test(options.releaseVersion)) problems.push(`--release-version must be SemVer without build metadata, got ${options.releaseVersion}`);
  if (!KINDS.includes(options.kind)) problems.push(`--kind must be one of: ${KINDS.join(', ')}`);
  if (!CHANNELS.includes(options.channel)) problems.push(`--channel must be one of: ${CHANNELS.join(', ')}`);
  const packed = await packOrFail(input, options.path);
  const skill = options.kind === 'skill' ? readSkill(packed, problems) : null;
  if (problems.length > 0) {
    throw new CliError('usage_error', `${problems.length} problem(s): ${problems.join('; ')}`, { details: { problems } });
  }
  return { valid: true as const, ...packSummary(packed), kind: options.kind, skill, uncommitted: packed.source.uncommitted.length };
}

export const validateCommand = new Command('validate')
  .description('Check that a package can be published (same packing and tree rules as the registry), without uploading')
  .argument('[source]', 'package directory (packs HEAD) or git ref (with --path)', '.')
  .option('-p, --path <dir>', 'package directory inside the repository, for a git ref')
  .option('-n, --name <@publisher/slug>', 'also check the package name')
  .option('--release-version <semver>', 'also check the release version')
  .option('--kind <kind>', 'skill | hook-pack | bundle', 'skill')
  .option('--channel <channel>', 'stable | beta | alpha', 'stable')
  .option('--json', 'print the result as a JSON envelope')
  .action(async (input: string, options: ValidateOptions) => {
    await runCommand('validate', options.json, () => validatePackage(input, options), (result) => {
      console.log(chalk.green(`valid ${result.skill ? `skill ${result.skill.name}` : result.kind}`));
      console.log(`  releaseDigest: ${chalk.cyan(result.releaseDigest)}`);
      console.log(chalk.dim(`  ${result.fileCount} files, ${result.treeSize} bytes at commit ${result.commit}`));
    });
  });
