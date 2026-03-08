import { Command } from 'commander';
import * as p from '@clack/prompts';
import pc from 'picocolors';
import { existsSync } from 'fs';
import type { AddOptions, AgentType, InstallMode, Skill } from '../lib/add-types.js';
import { parseSource, getOwnerRepo } from '../lib/source-parser.js';
import { cloneRepo, cleanupTempDir, GitCloneError } from '../lib/git-clone.js';
import { discoverSkills, getSkillDisplayName, filterSkills } from '../lib/skill-discovery.js';
import { agents, detectInstalledAgents } from '../lib/agent-registry.js';
import { installSkillForAgent, isSkillInstalled, getCanonicalPath } from '../lib/skill-installer.js';
import { addSkillToLock } from '../lib/skill-lock.js';
import {
  shortenPath, buildAgentSummaryLines, buildResultLines,
  formatList, ensureUniversalAgents,
} from './add-display.js';
import {
  selectSkillsInteractive, selectAgentsInteractive,
  selectScope, selectInstallMode, confirmInstall,
} from './add-prompts.js';

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

/** Main add command logic */
async function runAdd(source: string, rawOpts: Record<string, unknown>): Promise<void> {
  const options = parseAddOptions(rawOpts);

  // --all implies --skill '*' --agent '*' -y
  if (options.all) {
    options.skill = ['*'];
    options.agent = ['*'];
    options.yes = true;
  }

  console.log();
  p.intro(pc.bgCyan(pc.black(' skillx add ')));

  let tempDir: string | null = null;

  try {
    const spinner = p.spinner();

    // 1. Parse source
    spinner.start('Parsing source...');
    const parsed = parseSource(source);
    spinner.stop(
      `Source: ${parsed.type === 'local' ? parsed.localPath! : parsed.url}` +
      `${parsed.ref ? ` @ ${pc.yellow(parsed.ref)}` : ''}` +
      `${parsed.subpath ? ` (${parsed.subpath})` : ''}` +
      `${parsed.skillFilter ? ` ${pc.dim('@')}${pc.cyan(parsed.skillFilter)}` : ''}`
    );

    // 2. Clone or validate local path
    let skillsDir: string;
    if (parsed.type === 'local') {
      if (!existsSync(parsed.localPath!)) {
        p.outro(pc.red(`Local path does not exist: ${parsed.localPath}`));
        process.exit(1);
      }
      skillsDir = parsed.localPath!;
    } else {
      spinner.start('Cloning repository...');
      tempDir = await cloneRepo(parsed.url, parsed.ref);
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
    const skills = await discoverSkills(skillsDir!, parsed.subpath, {
      fullDepth: options.fullDepth,
    });

    if (skills.length === 0) {
      spinner.stop(pc.red('No skills found'));
      p.outro(pc.red('No valid skills found. Skills require a SKILL.md with name and description.'));
      await cleanup(tempDir);
      process.exit(1);
    }
    spinner.stop(`Found ${pc.green(String(skills.length))} skill${skills.length > 1 ? 's' : ''}`);

    // 4. --list: just show available skills and exit
    if (options.list) {
      console.log();
      p.log.step(pc.bold('Available Skills'));
      for (const skill of skills) {
        p.log.message(`  ${pc.cyan(getSkillDisplayName(skill))}`);
        p.log.message(`    ${pc.dim(skill.description)}`);
      }
      console.log();
      p.outro('Use --skill <name> to install specific skills');
      await cleanup(tempDir);
      process.exit(0);
    }

    // 5. Select skills
    let selectedSkills: Skill[];
    if (options.skill?.includes('*')) {
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skills`);
    } else if (options.skill && options.skill.length > 0) {
      selectedSkills = filterSkills(skills, options.skill);
      if (selectedSkills.length === 0) {
        p.log.error(`No matching skills for: ${options.skill.join(', ')}`);
        p.log.info('Available: ' + skills.map((s) => getSkillDisplayName(s)).join(', '));
        await cleanup(tempDir);
        process.exit(1);
      }
    } else if (skills.length === 1) {
      selectedSkills = skills;
      p.log.info(`Skill: ${pc.cyan(getSkillDisplayName(skills[0]!))}`);
    } else if (options.yes) {
      selectedSkills = skills;
      p.log.info(`Installing all ${skills.length} skills`);
    } else {
      const result = await selectSkillsInteractive(skills);
      if (!result) { await cleanup(tempDir); process.exit(0); }
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
        p.log.error(`Invalid agents: ${invalid.join(', ')}`);
        await cleanup(tempDir);
        process.exit(1);
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
        if (!result) { await cleanup(tempDir); process.exit(0); }
        targetAgents = result;
      }
    }

    // 7. Select scope (global vs project)
    let installGlobally = options.global ?? false;
    if (options.global === undefined && !options.yes) {
      const scope = await selectScope();
      if (scope === null) { await cleanup(tempDir); process.exit(0); }
      installGlobally = scope;
    }

    // 8. Select install mode (symlink vs copy)
    let installMode: InstallMode = options.copy ? 'copy' : 'symlink';
    if (!options.copy && !options.yes) {
      const mode = await selectInstallMode();
      if (!mode) { await cleanup(tempDir); process.exit(0); }
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
    console.log();
    p.note(summaryLines.join('\n'), 'Installation Summary');

    // 10. Confirm
    if (!options.yes) {
      const ok = await confirmInstall();
      if (!ok) { await cleanup(tempDir); process.exit(0); }
    }

    // 11. Install
    spinner.start('Installing skills...');
    const results: Array<{
      skill: string; agent: string; success: boolean; path: string;
      canonicalPath?: string; mode: InstallMode; symlinkFailed?: boolean; error?: string;
    }> = [];

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
      const bySkill = new Map<string, typeof results>();
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

      p.note(resultLines.join('\n'), pc.green(`Installed ${bySkill.size} skill${bySkill.size !== 1 ? 's' : ''}`));

      const symlinkFailures = successful.filter((r) => r.mode === 'symlink' && r.symlinkFailed);
      if (symlinkFailures.length > 0) {
        p.log.warn(pc.yellow(`Symlinks failed for: ${formatList(symlinkFailures.map((r) => r.agent))}`));
        p.log.message(pc.dim('  Files were copied instead. On Windows, enable Developer Mode for symlink support.'));
      }
    }

    if (failed.length > 0) {
      p.log.error(pc.red(`Failed to install ${failed.length}`));
      for (const r of failed) p.log.message(`  ${pc.red('✗')} ${r.skill} → ${r.agent}: ${pc.dim(r.error)}`);
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

    console.log();
    p.outro(pc.green('Done!') + pc.dim('  Review skills before use; they run with full agent permissions.'));
  } catch (error) {
    if (error instanceof GitCloneError) {
      p.log.error(pc.red('Failed to clone repository'));
      for (const line of error.message.split('\n')) p.log.message(pc.dim(line));
    } else {
      p.log.error(error instanceof Error ? error.message : 'Unknown error occurred');
    }
    p.outro(pc.red('Installation failed'));
    process.exit(1);
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
  .action((source: string, opts: Record<string, unknown>) => runAdd(source, opts));
