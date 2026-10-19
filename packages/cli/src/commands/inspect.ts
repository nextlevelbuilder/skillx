import { Command } from 'commander';
import chalk from 'chalk';
import { fetchSkillInspection } from '../lib/skill-lookup.js';
import type { SkillInspection } from '../lib/skill-lookup.js';
import { runCommand } from '../lib/run-command.js';

interface InspectOptions {
  json?: boolean;
  target?: string;
}

const STATUS_COLOR: Record<string, (s: string) => string> = {
  verified: chalk.green,
  declared: chalk.cyan,
  unknown: chalk.yellow,
  unsupported: chalk.red,
  blocked: chalk.red,
};

function statusText(status: string, versions: string | null): string {
  const paint = STATUS_COLOR[status] ?? chalk.white;
  return `${paint(status)}${versions ? chalk.dim(` ${versions}`) : ''}`;
}

function line(label: string, value: string | number | null | undefined): void {
  if (value === null || value === undefined || value === '') return;
  console.log(`${chalk.dim(label.padEnd(14))}${value}`);
}

function render(inspection: SkillInspection, slug: string): void {
  const skill = inspection.skill;
  console.log(chalk.bold.green(`\n${skill.name}`));
  console.log(chalk.dim(`  ${skill.author}/${skill.name}  ·  ${slug}\n`));

  line('Description', skill.description);
  line('Category', skill.category);
  line('Version', skill.version);
  line('Rating', skill.avg_rating === null ? null : `${skill.avg_rating} (${skill.rating_count ?? 0})`);
  line('Installs', skill.install_count);
  line('Risk', skill.risk_label);
  line('Source', skill.source_url);
  line('Install', skill.install_command);

  console.log(chalk.bold('\nCompatibility'));
  const declared = inspection.compatibility?.declared ?? [];
  if (declared.length === 0) {
    console.log(chalk.yellow('  No runtime is declared. An agent cannot assume support.'));
  } else {
    for (const entry of declared) {
      console.log(`  ${entry.runtime.padEnd(16)}${statusText(entry.status, entry.versions)}`);
    }
  }

  const target = inspection.compatibility?.target;
  if (target) {
    console.log(chalk.bold(`\nTarget ${target.runtime}`));
    line('Status', statusText(target.status, target.versions));
    if (target.scopes.length > 0) line('Scopes', target.scopes.join(', '));
    const required = target.requirements.filter((r) => !r.optional);
    if (required.length > 0) line('Requires', required.map((r) => r.capability).join(', '));
    if (target.evidence) {
      line('Evidence', `${target.evidence.probeId} by ${target.evidence.verifier} (${target.evidence.harness} ${target.evidence.harnessVersion})`);
      line('Verified at', target.evidence.verifiedAt);
    } else {
      line('Evidence', chalk.yellow('none bound to this artifact'));
    }
    for (const reason of target.reasons) {
      console.log(`  ${chalk.dim('·')} ${chalk.bold(reason.code)} ${reason.message}`);
    }
  }

  const references = inspection.references ?? [];
  const scripts = inspection.scripts ?? [];

  if (references.length > 0) {
    console.log(chalk.bold(`\nReferences (${references.length})`));
    for (const ref of references) console.log(`  ${ref.title}`);
  }
  if (scripts.length > 0) {
    console.log(chalk.bold(`\nScripts (${scripts.length})`));
    for (const script of scripts) console.log(`  ${script.name}`);
  }
  console.log();
}

export const inspectCommand = new Command('inspect')
  .description("Inspect a skill's metadata, requirements, compatibility and evidence")
  .argument('<identifier>', 'slug, author/skill, or org/repo/skill')
  .option('--target <runtime[@version]>', 'also answer for one specific runtime')
  .option('--json', 'emit a machine-readable envelope instead of text')
  .action((identifier: string, options: InspectOptions) => {
    // The envelope carries the summary payload; human text also lists references and scripts.
    let fetched: SkillInspection | undefined;
    return runCommand(
      {
        json: options.json === true,
        spinner: `Inspecting ${identifier}...`,
        errors: { notFoundMessage: `Skill not found: ${identifier}` },
      },
      async () => {
        const { slug, inspection } = await fetchSkillInspection(identifier, options.target);
        fetched = inspection;
        return { slug, skill: inspection.skill, compatibility: inspection.compatibility ?? { declared: [] } };
      },
      (data) => render(fetched as SkillInspection, data.slug),
    );
  });
