import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import type { AddOptions, AgentType, InstallMode, Skill } from '../lib/add-types.js';
import { parseSource, getOwnerRepo } from '../lib/source-parser.js';
import { cloneRepo, cleanupTempDir, GitCloneError } from '../lib/git-clone.js';
import { discoverSkills, getSkillDisplayName, filterSkills } from '../lib/skill-discovery.js';
import { agents, detectInstalledAgents } from '../lib/agent-registry.js';
import { installSkillForAgent, getCanonicalPath } from '../lib/skill-installer.js';
import { addSkillToLock } from '../lib/skill-lock.js';
import { CliError } from '../lib/output.js';
import { runCommand } from '../lib/run-command.js';
import {
  shortenPath, buildAgentSummaryLines, buildResultLines,
  formatList, ensureUniversalAgents,
} from './add-display.js';
import {
  selectSkillsInteractive, selectAgentsInteractive,
  selectScope, selectInstallMode, confirmInstall,
} from './add-prompts.js';

interface InstallResult {
  skill: string; agent: string; success: boolean; path: string;
  canonicalPath?: string; mode: InstallMode; symlinkFailed?: boolean; error?: string;
}

/** What `skillx add` reports; the same data backs the `--json` envelope. */
export type AddResult =
  | { status: 'cancelled' }
  | { status: 'listed'; source: string; skills: Array<{ name: string; description: string }> }
  | {
      status: 'installed'; source: string; global: boolean; mode: InstallMode;
      agents: AgentType[]; results: InstallResult[];
    };

/** Clack output in human mode; silent under `--json` so stdout carries one envelope. */
type Ui = Pick<typeof p, 'intro' | 'outro' | 'note' | 'spinner'> & { log: Pick<typeof p.log, 'info' | 'step' | 'message' | 'warn' | 'error'> };

const noop = () => {};
const silentUi: Ui = {
  intro: noop,
  outro: noop,
  note: noop,
  spinner: () => ({ start: noop, stop: noop, message: noop }) as unknown as ReturnType<typeof p.spinner>,
  log: { info: noop, step: noop, message: noop, warn: noop, error: noop },
};

/** Parse CLI options for the add command */
function parseAddOptions(opts: Record<string, unknown>): AddOptions {
  const options: AddOptions = {
    global: opts.global as boolean | undefined,
    yes: opts.yes as boolean | undefined,
    list: opts.list as boolean | undefined,
    copy: opts.copy as boolean | undefined,
    all: opts.all as boolean | undefined,
    fullDepth: opts.fullDepth as boolean | undefined,
  };
  // Commander passes repeated options as arrays
  if (opts.agent) options.agent = Array.isArray(opts.agent) ? opts.agent : [opts.agent as string];
  if (opts.skill) options.skill = Array.isArray(opts.skill) ? opts.skill : [opts.skill as string];
  return options;
}

async function cleanup(tempDir: string | null) {
  if (tempDir) {
    try { await cleanupTempDir(tempDir); } catch { /* ignore */ }
  }
}

/** Main add command logic. Throws `CliError` on failure; never exits the process. */
async function runAdd(source: string, options: AddOptions, ui: Ui): Promise<AddResult> {
  // --all implies --skill '*' --agent '*' -y
  if (options.all) {
    options.skill = ['*'];
    options.agent = ['*'];
    options.yes = true;
  }

  ui.intro(pc.bgCyan(pc.black(' skillx add ')));

  let tempDir: string | null = null;

  try {
    const spinner = ui.spinner();

    // 1. Parse source
    spinner.start('Parsing source...');
    const parsed = parseSource(source);
    const sourceLabel = parsed.type === 'local' ? parsed.localPath! : parsed.url;
    spinner.stop(
      `Source: ${sourceLabel}` +
      `${parsed.ref ? ` @ ${pc.yellow(parsed.ref)}` : ''}` +
      `${parsed.subpath ? ` (${parsed.subpath})` : ''}` +
      `${parsed.skillFilter ? ` ${pc.dim('@')}${pc.cyan(parsed.skillFilter)}` : ''}`
    );

    // 2. Clone or validate local path
    let skillsDir: string;
    if (parsed.type === 'local') {
      if (!existsSync(parsed.localPath!)) {
        throw new CliError('usage_error', `Local path does not exist: ${parsed.localPath}`);
      }
      skillsDir = parsed.localPath!;
    } else {
      spinner.start('Cloning repository...');
      try {
        tempDir = await cloneRepo(parsed.url, parsed.ref);
      } catch (error) {
        if (error instanceof GitCloneError) {
          throw new CliError('network_error', 'Failed to clone repository', { hint: error.message });
        }
        throw error;
      }
      skillsDir = tempDir;
      spinner.stop('Repository cloned');
    }

    // Merge @skill filter into options.skill
    if (parsed.skillFilter) {
      options.skill = options.skill || [];
      if (!options.skill.includes(parsed.skillFilter)) options.skill.push(parsed.skillFilter);
    }

    // 3. Discover skills
    spinner.start('Discovering skills...');
    const skills = await discoverSkills(skillsDir, parsed.subpath, {
      fullDepth: options.fullDepth,
    });

    if (skills.length === 0) {
      spinner.stop(pc.red('No skills found'));
      throw new CliError('not_found', 'No valid skills found. Skills require a SKILL.md with name and description.');
    }
    spinner.stop(`Found ${pc.green(String(skills.length))} skill${skills.length > 1 ? 's' : ''}`);

    // 4. --list: just show available skills
    if (options.list) {
      ui.log.step(pc.bold('Available Skills'));
      for (const skill of skills) {
        ui.log.message(`  ${pc.cyan(getSkillDisplayName(skill))}`);
        ui.log.message(`    ${pc.dim(skill.description)}`);
      }
      ui.outro('Use --skill <name> to install specific skills');
      return {
        status: 'listed',
        source: sourceLabel,
        skills: skills.map((s) => ({ name: getSkillDisplayName(s), description: s.description })),
      };
    }

    // 5. Select skills
    let selectedSkills: Skill[];
    if (options.skill?.includes('*')) {
      selectedSkills = skills;
      ui.log.info(`Installing all ${skills.length} skills`);
    } else if (options.skill && options.skill.length > 0) {
      selectedSkills = filterSkills(skills, options.skill);
      if (selectedSkills.length === 0) {
        throw new CliError('not_found', `No matching skills for: ${options.skill.join(', ')}`, {
          hint: 'Available: ' + skills.map((s) => getSkillDisplayName(s)).join(', '),
        });
      }
    } else if (skills.length === 1) {
      selectedSkills = skills;
      ui.log.info(`Skill: ${pc.cyan(getSkillDisplayName(skills[0]!))}`);
    } else if (options.yes) {
      selectedSkills = skills;
      ui.log.info(`Installing all ${skills.length} skills`);
    } else {
      const result = await selectSkillsInteractive(skills);
      if (!result) return { status: 'cancelled' };
      selectedSkills = result;
    }

    // 6. Select target agents
    let targetAgents: AgentType[];
    const validAgents = Object.keys(agents) as AgentType[];

    if (options.agent?.includes('*')) {
      targetAgents = validAgents;
    } else if (options.agent && options.agent.length > 0) {
      const invalid = options.agent.filter((a) => !validAgents.includes(a as AgentType));
      if (invalid.length > 0) {
        throw new CliError('usage_error', `Invalid agents: ${invalid.join(', ')}`, {
          hint: `Valid agents: ${validAgents.join(', ')}`,
        });
      }
      targetAgents = options.agent as AgentType[];
    } else {
      spinner.start('Detecting agents...');
      const installed = await detectInstalledAgents();
      spinner.stop(`${validAgents.length} agents available`);

      if (installed.length <= 1 || options.yes) {
        targetAgents = ensureUniversalAgents(installed.length > 0 ? installed : validAgents);
      } else {
        const result = await selectAgentsInteractive({ global: options.global });
        if (!result) return { status: 'cancelled' };
        targetAgents = result;
      }
    }

    // 7. Select scope (global vs project)
    let installGlobally = options.global ?? false;
    if (options.global === undefined && !options.yes) {
      const scope = await selectScope();
      if (scope === null) return { status: 'cancelled' };
      installGlobally = scope;
    }

    // 8. Select install mode (symlink vs copy)
    let installMode: InstallMode = options.copy ? 'copy' : 'symlink';
    if (!options.copy && !options.yes) {
      const mode = await selectInstallMode();
      if (!mode) return { status: 'cancelled' };
      installMode = mode;
    }

    // 9. Summary
    const cwd = process.cwd();
    const summaryLines: string[] = [];
    for (const skill of selectedSkills) {
      if (summaryLines.length > 0) summaryLines.push('');
      const canonical = getCanonicalPath(skill.name, { global: installGlobally });
      summaryLines.push(pc.cyan(shortenPath(canonical, cwd)));
      summaryLines.push(...buildAgentSummaryLines(targetAgents, installMode));
    }
    ui.note(summaryLines.join('\n'), 'Installation Summary');

    // 10. Confirm
    if (!options.yes) {
      const ok = await confirmInstall();
      if (!ok) return { status: 'cancelled' };
    }

    // 11. Install
    spinner.start('Installing skills...');
    const results: InstallResult[] = [];

    for (const skill of selectedSkills) {
      for (const agent of targetAgents) {
        const result = await installSkillForAgent(skill, agent, {
          global: installGlobally,
          mode: installMode,
        });
        results.push({ skill: getSkillDisplayName(skill), agent: agents[agent].displayName, ...result });
      }
    }
    spinner.stop('Installation complete');

    // 12. Show results
    const successful = results.filter((r) => r.success);
    const failed = results.filter((r) => !r.success);

    if (successful.length > 0) {
      const bySkill = new Map<string, InstallResult[]>();
      for (const r of successful) {
        const arr = bySkill.get(r.skill) || [];
        arr.push(r);
        bySkill.set(r.skill, arr);
      }

      const resultLines: string[] = [];
      for (const [skillName, skillResults] of bySkill) {
        const first = skillResults[0]!;
        if (first.mode === 'copy') {
          resultLines.push(`${pc.green('✓')} ${skillName} ${pc.dim('(copied)')}`);
          for (const r of skillResults) resultLines.push(`  ${pc.dim('→')} ${shortenPath(r.path, cwd)}`);
        } else {
          const label = first.canonicalPath ? shortenPath(first.canonicalPath, cwd) : skillName;
          resultLines.push(`${pc.green('✓')} ${label}`);
          resultLines.push(...buildResultLines(skillResults, targetAgents));
        }
      }

      ui.note(resultLines.join('\n'), pc.green(`Installed ${bySkill.size} skill${bySkill.size !== 1 ? 's' : ''}`));

      const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
      if (symlinkFailures.length > 0) {
        ui.log.warn(pc.yellow(`Symlinks failed for: ${formatList(symlinkFailures.map((r) => r.agent))}`));
        ui.log.message(pc.dim('  Files were copied instead. On Windows, enable Developer Mode for symlink support.'));
      }
    }

    if (failed.length > 0) {
      ui.log.error(pc.red(`Failed to install ${failed.length}`));
      for (const r of failed) ui.log.message(`  ${pc.red('✗')} ${r.skill} → ${r.agent}: ${pc.dim(r.error)}`);
    }

    // 13. Update lock file (global installs)
    if (successful.length > 0 && installGlobally) {
      const normalizedSource = getOwnerRepo(parsed);
      if (normalizedSource) {
        for (const skill of selectedSkills) {
          try {
            await addSkillToLock(skill.name, {
              source: normalizedSource,
              sourceType: parsed.type,
              sourceUrl: parsed.url,
            });
          } catch { /* ignore lock file errors */ }
        }
      }
    }

    if (successful.length === 0) {
      throw new CliError('unexpected_error', `Failed to install ${failed.length} skill target${failed.length !== 1 ? 's' : ''}`, {
        details: { results },
      });
    }

    ui.outro(pc.green('Done!') + pc.dim('  Review skills before use; they run with full agent permissions.'));
    return { status: 'installed', source: sourceLabel, global: installGlobally, mode: installMode, agents: targetAgents, results };
  } catch (error) {
    ui.outro(pc.red('Installation failed'));
    throw error;
  } finally {
    await cleanup(tempDir);
  }
}

export const addCommand = new Command('add')
  .description('Add skills from a GitHub repo, local path, or git URL')
  .argument('<source>', 'owner/repo, URL, or local path')
  .option('-g, --global', 'Install globally (~/) instead of project-level')
  .option('-a, --agent <agents...>', 'Target specific agents (use * for all)')
  .option('-s, --skill <skills...>', 'Select specific skills (use * for all)')
  .option('-l, --list', 'List available skills without installing')
  .option('-y, --yes', 'Skip confirmation prompts')
  .option('--copy', 'Copy files instead of symlinking')
  .option('--all', 'Shorthand for --skill * --agent * -y')
  .option('--full-depth', 'Search all subdirs even when root SKILL.md exists')
  .option('--json', 'emit a machine-readable envelope instead of text (implies --yes)')
  .action((source: string, opts: Record<string, unknown>) => {
    const json = opts.json === true;
    const options = parseAddOptions(opts);
    // An envelope caller cannot answer prompts, so --json never asks.
    if (json) options.yes = true;
    return runCommand<AddResult>(
      { json },
      () => runAdd(source, options, json ? silentUi : p),
      () => {},
    );
  });
