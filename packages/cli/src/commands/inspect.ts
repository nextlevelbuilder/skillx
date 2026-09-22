import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { fetchSkillInspection } from '../lib/skill-lookup.js';
import type { SkillInspection } from '../lib/skill-lookup.js';
import { exitCodeFor, fromError, serialize, success } from '../lib/output.js';

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
  .action(async (identifier: string, options: InspectOptions) => {
    const useJson = options.json === true;
    const spinner = useJson ? null : ora(`Inspecting ${identifier}...`).start();

    try {
      const { slug, inspection } = await fetchSkillInspection(identifier, options.target);
      spinner?.stop();

      const payload = { slug, skill: inspection.skill, compatibility: inspection.compatibility ?? { declared: [] } };
      if (useJson) {
        const envelope = success(payload);
        console.log(serialize(envelope));
        process.exit(exitCodeFor(envelope));
      }
      render(inspection, slug);
    } catch (error) {
      spinner?.stop();
      const envelope = fromError(error);
      if (useJson) console.log(serialize(envelope));
      else console.error(chalk.red(`\n✗ ${envelope.error.message}`));
      process.exit(exitCodeFor(envelope));
    }
  });
