import chalk from 'chalk';
import type { ApplyResult } from '../lib/install/install-engine.js';
import type { FoundSkill, SkippedSkill } from '../lib/add/skill-discovery.js';

/** What `skillx add` reports; the same data backs the `--json` envelope. */
export type AddResult =
  | { status: 'cancelled' }
  | { status: 'listed'; source: string; commit?: string; skills: FoundSkill[]; skipped: SkippedSkill[] }
  | {
      status: 'installed';
      source: string;
      commit?: string;
      runtime: string;
      skillsDir: string;
      skills: Array<{ alias: string; origin: string; digest: string }>;
      skipped: SkippedSkill[];
      planDigest: string;
      applied: ApplyResult[];
      recovered: { rolledBack: string[]; rolledForward: string[] };
    };

/** Refused skills go to stderr, so piped stdout stays clean. */
export function printSkipped(skipped: readonly SkippedSkill[]): void {
  for (const s of skipped) console.error(chalk.yellow(`  ! skipped ${s.dir || '(root)'}: ${s.reason}`));
}

export function printAdd(result: AddResult): void {
  if (result.status === 'cancelled') {
    console.log(chalk.dim('Cancelled; nothing was installed.'));
    return;
  }
  const at = result.commit ? chalk.dim(` @ ${result.commit.slice(0, 12)}`) : '';
  if (result.status === 'listed') {
    console.log(chalk.bold(`\n${result.source}`) + at);
    for (const s of result.skills) console.log(`  ${chalk.cyan(s.name.padEnd(28))} ${chalk.dim(s.dir || '.')}  ${s.description.slice(0, 80)}`);
    if (result.skills.length === 0) console.log(chalk.dim('  no installable skill'));
    printSkipped(result.skipped);
    return;
  }
  console.log(chalk.bold(`\n${result.source}`) + at + chalk.dim(` → ${result.skillsDir}`));
  for (const a of result.applied) {
    for (const c of a.changed) {
      console.log(`  ${chalk.green(c.action.padEnd(9))} ${c.alias}`);
      if (c.backupDir) console.log(chalk.yellow(`    local changes saved to ${c.backupDir}`));
      if (c.preserved.length > 0) console.log(chalk.yellow(`    kept files not in the skill: ${c.preserved.slice(0, 5).join(', ')}`));
      // Stderr, like the installer: an executable file is reported, never run.
      if (c.executable) console.error(chalk.yellow(`  ! ${c.alias}: ${c.executable.length} executable file(s) written (${c.executable.slice(0, 5).join(', ')}); skillx never runs them, review before use`));
    }
    if (a.changed.length === 0) console.log(`  ${chalk.dim('unchanged'.padEnd(9))} ${a.owner.slice(a.owner.indexOf(':') + 1)}`);
  }
  printSkipped(result.skipped);
  console.log(chalk.green('\n✓ done') + chalk.dim('  Skills from git or a local path are not scanned or signed; review them before use.'));
}
