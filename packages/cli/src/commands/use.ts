import { Command } from 'commander';
import chalk from 'chalk';
import { runCommand } from '../lib/run-command.js';
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

/** Human rendering of a resolution. */
function renderResolved(resolved: ResolvedSkill, options: DisplayOptions): void {
  // In raw mode stdout is the skill content only; the detours go to stderr.
  const note = options.raw ? console.error : (text: string) => console.log(chalk.dim(text));
  for (const text of resolved.notes) note(text);

  if (resolved.kind === 'skill') {
    if (resolved.registered) console.log(chalk.green(`\nRegistered new skill from GitHub: ${resolved.displayId}`));
    const { skill, references, scripts } = resolved.detail;
    displaySkill(skill, resolved.displayId, options, references, scripts, resolved.releaseExists);
    return;
  }

  if (resolved.kind === 'repo') {
    console.log(chalk.bold.green(`\nFound ${resolved.skills.length} skill(s) in repo:\n`));
    resolved.skills.forEach((s) => console.log(`  ${chalk.cyan(`${s.author}/${s.name}`)}`));
    console.log(chalk.dim(`\nUse ${chalk.cyan(`skillx use ${resolved.displayId}/<skill-name>`)} to use a specific skill`));
    if (resolved.registered) {
      console.log(chalk.dim(`(${resolved.registered} newly registered, ${resolved.skipped} already existed)`));
    }
    return;
  }

  console.log(chalk.yellow(`\nNo skills found for ${resolved.displayId}`));
  console.log(chalk.dim('Try different search terms or browse all skills at https://skillx.sh'));
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
  renderResolved(await resolveSkill(identifier), options);
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
    let resolved: ResolvedSkill | undefined;
    return runCommand(
      {
        json,
        // A spinner would interleave with piped raw content.
        ...(display.raw ? {} : { spinner: `Fetching skill: ${identifier}...` }),
        errors: { notFoundMessage: `Skill not found: ${identifier}` },
      },
      async (progress) => {
        resolved = await resolveSkill(identifier, { forceSearch: options.search, progress });
        // Human display tracks the install itself; the envelope path counts the same use.
        if (json && resolved.kind === 'skill') trackInstall(resolved.detail.skill.slug);
        return toUsePayload(resolved);
      },
      () => renderResolved(resolved as ResolvedSkill, display),
    );
  });
