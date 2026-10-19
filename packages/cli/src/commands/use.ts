import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from '../lib/run-command.js';
import { CliError } from '../lib/output.js';
import { resolveSkill, type ResolvedSkill } from '../lib/skill-resolver.js';
import { discoveryOnlyNotice, displaySkill, trackInstall, type DisplayOptions } from './use-display.js';

export { buildSkillEndpoint, parseIdentifier, parseRepoPath, type SourceTarget } from '../lib/skill-resolver.js';

interface UseOptions {
  raw?: boolean;
  search?: boolean;
  includeRefs?: boolean;
  includeScripts?: boolean;
  json?: boolean;
}

type Match = Exclude<ResolvedSkill, { kind: 'none' }>;

/** Nothing matched is `not_found` (exit 3) for `use`, `search --use` and `find` alike. */
function requireMatch(resolved: ResolvedSkill): Match {
  if (resolved.kind !== 'none') return resolved;
  throw new CliError('not_found', `No skills found for ${resolved.displayId}`, {
    details: { notes: resolved.notes },
    hint: 'Try different search terms or browse all skills at https://skillx.sh',
  });
}

/** Human rendering of a match. */
function renderResolved(resolved: Match, options: DisplayOptions): void {
  // In raw mode stdout is the skill content only; the detours go to stderr.
  const note = options.raw ? console.error : (text: string) => console.log(chalk.dim(text));
  for (const text of resolved.notes) note(text);

  if (resolved.kind === 'skill') {
    if (resolved.registered) console.log(chalk.green(`\nRegistered new skill from GitHub: ${resolved.displayId}`));
    const { skill, references, scripts } = resolved.detail;
    displaySkill(skill, resolved.displayId, options, references, scripts, resolved.releaseExists);
    return;
  }

  console.log(chalk.bold.green(`\nFound ${resolved.skills.length} skill(s) in repo:\n`));
  resolved.skills.forEach((s) => console.log(`  ${chalk.cyan(`${s.author}/${s.name}`)}`));
  console.log(chalk.dim(`\nUse ${chalk.cyan(`skillx use ${resolved.displayId}/<skill-name>`)} to use a specific skill`));
  if (resolved.registered) {
    console.log(chalk.dim(`(${resolved.registered} newly registered, ${resolved.skipped} already existed)`));
  }
}

/** The `use --json` payload: the resolution, with the discovery-only decision made explicit. */
export function toUsePayload(resolved: ResolvedSkill) {
  if (resolved.kind !== 'skill') return resolved;
  const { skill, references = [], scripts = [] } = resolved.detail;
  const notice = discoveryOnlyNotice(references, scripts, resolved.releaseExists);
  return {
    kind: resolved.kind,
    displayId: resolved.displayId,
    registered: resolved.registered,
    skill,
    references,
    scripts,
    discoveryOnly: notice !== null,
    ...(notice ? { discoveryOnlyNotice: notice } : {}),
    notes: resolved.notes,
  };
}

/** Resolve identifier and display the skill. Exported for use by search --use. */
export async function resolveAndUseSkill(identifier: string, options: DisplayOptions): Promise<void> {
  renderResolved(requireMatch(await resolveSkill(identifier)), options);
}

export const useCommand = new Command('use')
  .description('Use a skill by author/name, org/repo/skill, slug, or keywords')
  .argument('<identifier>', 'author/skill, org/repo/skill, slug, or search keywords')
  .option('-r, --raw', 'Output raw content only (for piping)')
  .option('-s, --search', 'Force search mode')
  .option('--include-refs', 'Include references in output')
  .option('--include-scripts', 'Include scripts in output')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((identifier: string, options: UseOptions) => {
    const json = options.json === true;
    const display: DisplayOptions = {
      raw: options.raw ?? false,
      includeRefs: options.includeRefs ?? false,
      includeScripts: options.includeScripts ?? false,
    };
    // The envelope flattens the skill; the human renderer needs the resolution itself.
    let resolved: Match | undefined;
    return runCommand(
      {
        json,
        // A spinner would interleave with piped raw content.
        ...(display.raw ? {} : { spinner: `Fetching skill: ${identifier}...` }),
        errors: { notFoundMessage: `Skill not found: ${identifier}` },
      },
      async (progress) => {
        const match = requireMatch(await resolveSkill(identifier, { forceSearch: options.search, progress }));
        resolved = match;
        // Human display tracks the install itself; the envelope path counts the same use.
        if (json && match.kind === 'skill') trackInstall(match.detail.skill.slug);
        return toUsePayload(match);
      },
      () => renderResolved(resolved as Match, display),
    );
  });
