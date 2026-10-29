import chalk from 'chalk';
import { InstallError, usageError } from '../lib/install/install-errors.js';
import type { FoundSkill, SkippedSkill } from '../lib/add/skill-discovery.js';
import { promptLine } from '../lib/prompt-line.js';

/**
 * Which skills `skillx add` installs. Names match a skill's front matter name
 * or its directory name, case-insensitively; `*` takes every installable
 * skill. A name that matches a refused skill (reserved, invalid front matter)
 * fails with the reason instead of being skipped quietly. Without names, one
 * skill is taken as is; several are all taken with `--yes`, chosen at a
 * prompt in human mode, and must be named under `--json`.
 */

const baseName = (dir: string) => dir.slice(dir.lastIndexOf('/') + 1);
const matches = (name: string, skill: { name?: string; dir: string }) => {
  const n = name.toLowerCase();
  return skill.name?.toLowerCase() === n || (skill.dir !== '' && baseName(skill.dir).toLowerCase() === n);
};

export function pickByName(found: readonly FoundSkill[], skipped: readonly SkippedSkill[], names: readonly string[]): FoundSkill[] {
  const picked = new Set<FoundSkill>();
  for (const name of names) {
    const hits = found.filter((s) => matches(name, s));
    if (hits.length > 0) {
      hits.forEach((s) => picked.add(s));
      continue;
    }
    const refused = skipped.find((s) => matches(name, s));
    if (refused) throw usageError(`cannot install ${name}: ${refused.reason}`, { skill: name, dir: refused.dir });
    throw new InstallError('not_found', `no skill named ${name} in this source`, { skill: name, available: found.map((s) => s.name) });
  }
  return [...picked];
}

/** Parses `1,3`, `2-4` or `all` against a list of `count` items; null when the answer is not one of those. */
export function parseChoice(answer: string, count: number): number[] | null {
  const text = answer.trim().toLowerCase();
  if (text === 'all' || text === '*') return Array.from({ length: count }, (_, i) => i);
  const picked = new Set<number>();
  for (const part of text.split(/[\s,]+/).filter(Boolean)) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part);
    if (!m) return null;
    const [from, to] = [Number(m[1]), Number(m[2] ?? m[1])];
    if (from < 1 || to > count || from > to) return null;
    for (let i = from; i <= to; i++) picked.add(i - 1);
  }
  return picked.size > 0 ? [...picked].sort((a, b) => a - b) : null;
}

/**
 * Human mode asks before it installs, so it needs a terminal. A pipe, a closed
 * stdin or CI is a usage error, never a silent "cancelled" with exit 0.
 */
export function assertCanPrompt(mode: { yes?: boolean; json?: boolean }, isTTY = process.stdin.isTTY === true): void {
  if (mode.yes || mode.json || isTTY) return;
  throw usageError('stdin is not a terminal, so skillx add cannot ask; pass --yes to install without a prompt (with --skill <name...> to choose skills)');
}

export async function selectSkills(
  found: readonly FoundSkill[],
  skipped: readonly SkippedSkill[],
  names: readonly string[],
  mode: { yes?: boolean; json?: boolean },
): Promise<FoundSkill[] | null> {
  if (names.length > 0 && !names.includes('*')) return pickByName(found, skipped, names);
  if (found.length === 0) {
    throw new InstallError('not_found', 'no installable skill found (a skill is a directory with a SKILL.md that has a name and a description)', { skipped });
  }
  if (names.length > 0 || found.length === 1 || mode.yes) return [...found];
  if (mode.json) throw usageError(`${found.length} skills found; name them with --skill <name...> or --skill '*'`, { available: found.map((s) => s.name) });
  found.forEach((s, i) => console.log(`  ${chalk.dim(String(i + 1).padStart(2))}  ${chalk.cyan(s.name)}  ${chalk.dim(s.description.slice(0, 70))}`));
  for (;;) {
    const answer = await promptLine('Install which skills? (e.g. 1,3 or 2-4 or all; empty to cancel) ', process.stdout);
    if (answer === null || answer.trim() === '') return null;
    const picked = parseChoice(answer, found.length);
    if (picked) return picked.map((i) => found[i]!);
    console.log(chalk.yellow(`  answer with numbers from 1 to ${found.length}, ranges, or all`));
  }
}

export async function confirmInstall(): Promise<boolean> {
  const answer = await promptLine('Install? [y/N] ', process.stdout);
  return answer !== null && /^y(es)?$/i.test(answer.trim());
}
