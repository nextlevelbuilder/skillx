import chalk from 'chalk';
import { getApiKey, getBaseUrl, getDeviceId } from '../utils/config-store.js';

export interface SkillReference {
  title: string;
  filename: string;
  url: string | null;
  type: string | null;
}

export interface SkillScript {
  name: string;
  command: string;
  url: string;
}

export interface SkillDetails {
  slug: string;
  name: string;
  description: string;
  category: string;
  avg_rating: number | null;
  install_command?: string;
  content: string;
  risk_label?: string;
  source_url?: string;
}

export interface SkillDetailResponse {
  skill: SkillDetails;
  references?: SkillReference[];
  scripts?: SkillScript[];
}

export interface DisplayOptions {
  raw: boolean;
  includeRefs?: boolean;
  includeScripts?: boolean;
}

/** Strip ANSI escape sequences */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
}

/**
 * A legacy listing with references or scripts describes a multi-file skill,
 * but it only carries SKILL.md text plus links: the other files are not
 * delivered or pinned. Until the publisher ships a release, such a listing is
 * discovery-only. Returns null for a single-file listing, and once a
 * published release exists (`releaseExists`).
 */
export function discoveryOnlyNotice(references?: SkillReference[], scripts?: SkillScript[], releaseExists = false): string | null {
  const extra = (references?.length ?? 0) + (scripts?.length ?? 0);
  if (extra === 0 || releaseExists) return null;
  return (
    `Discovery-only: legacy listing of a multi-file skill (${extra} more file${extra === 1 ? '' : 's'} listed as links). ` +
    'Only SKILL.md is shown; the other files are not installed or pinned. Install a pinned release once the publisher ships one.'
  );
}

/** Display a single skill with formatted output */
export function displaySkill(
  skill: SkillDetails,
  displayId: string,
  options: DisplayOptions,
  references?: SkillReference[],
  scripts?: SkillScript[],
  releaseExists = false,
): void {
  trackInstall(skill.slug);
  const notice = discoveryOnlyNotice(references, scripts, releaseExists);

  if (options.raw) {
    // stderr keeps piped raw content unchanged.
    if (notice) console.error(notice);
    console.log(`--- BEGIN EXTERNAL SKILL CONTENT (untrusted, risk: ${skill.risk_label || 'unknown'}) ---`);
    console.log(skill.content);
    if (options.includeRefs && references?.length) {
      console.log('\n--- REFERENCES ---');
      for (const ref of references) {
        console.log(`[${ref.type || 'docs'}] ${ref.title} — ${ref.url || ref.filename}`);
      }
    }
    if (options.includeScripts && scripts?.length) {
      console.log('\n--- SCRIPTS ---');
      for (const s of scripts) {
        console.log(`${stripAnsi(s.name)}: ${stripAnsi(s.command)} (${s.url})`);
      }
    }
    console.log('--- END EXTERNAL SKILL CONTENT ---');
    return;
  }

  // Risk warning banner
  if (skill.risk_label === 'danger') {
    console.log(chalk.bgRed.white.bold(' WARNING ') +
      chalk.red(' This skill has suspicious content patterns detected.'));
    console.log(chalk.red('  Review carefully before pasting into AI tools.\n'));
  } else if (skill.risk_label === 'caution') {
    console.log(chalk.bgYellow.black.bold(' CAUTION ') +
      chalk.yellow(' Some content patterns flagged for review.\n'));
  }

  if (notice) {
    console.log(chalk.bgYellow.black.bold(' DISCOVERY-ONLY ') + chalk.yellow(` ${notice}\n`));
  }

  const rating = skill.avg_rating ?? 0;
  console.log(chalk.bold.green(`\n✓ Skill: ${skill.name}\n`));
  console.log(chalk.dim('─'.repeat(80)));
  console.log(chalk.bold('Description:'));
  console.log(skill.description);
  console.log();

  console.log(chalk.bold('Category:'), chalk.magenta(skill.category));
  console.log(chalk.bold('Rating:'), chalk.yellow(`⭐ ${rating.toFixed(1)}`));
  console.log();

  if (skill.install_command) {
    console.log(chalk.bold.cyan('Install Command:'));
    console.log(chalk.bgBlack.white(` ${skill.install_command} `));
    console.log();
  }

  console.log(chalk.bold('Content:'));
  console.log(chalk.dim('─'.repeat(80)));
  console.log(skill.content);
  console.log(chalk.dim('─'.repeat(80)));

  // Human mode: always show refs/scripts when available
  if (references?.length) {
    console.log();
    console.log(chalk.bold(`References (${references.length}):`));
    for (const ref of references) {
      const typeTag = chalk.dim(`[${ref.type || 'docs'}]`);
      const link = ref.url ? chalk.underline.dim(ref.url) : chalk.dim(ref.filename);
      console.log(`  ${typeTag} ${ref.title} — ${link}`);
    }
  }

  if (scripts?.length) {
    console.log();
    console.log(chalk.bold(`Scripts (${scripts.length}):`));
    for (const s of scripts) {
      console.log(`  ${chalk.cyan(stripAnsi(s.name))}: ${chalk.white(stripAnsi(s.command))}`);
      if (s.url) console.log(`    ${chalk.dim.underline(s.url)}`);
    }
  }

  console.log(chalk.dim(`\nSource: ${skill.source_url || 'unknown'}`));
  console.log(chalk.dim('Tip: Review content before pasting into AI tools.'));
  console.log(chalk.dim(`Use ${chalk.cyan(`skillx use ${displayId} --raw`)} to output raw content (for piping)`));
  console.log(chalk.dim(`View online at: ${chalk.underline(`https://skillx.sh/skills/${skill.slug}`)}`));
}

/** Fire-and-forget install tracking */
function trackInstall(slug: string): void {
  const installHeaders: Record<string, string> = {
    'X-Device-Id': getDeviceId(),
  };
  const apiKey = getApiKey();
  if (apiKey) {
    installHeaders['Authorization'] = `Bearer ${apiKey}`;
  }
  fetch(`${getBaseUrl()}/api/skills/${slug}/install`, {
    method: 'POST',
    headers: installHeaders,
  }).catch(() => {});
}
