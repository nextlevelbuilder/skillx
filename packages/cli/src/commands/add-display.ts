import pc from 'picocolors';
import { homedir } from 'os';
import { sep } from 'path';
import type { AgentType, InstallMode } from '../lib/add-types.js';
import { agents, isUniversalAgent } from '../lib/agent-registry.js';

/** Shorten a path for display: replace homedir with ~ and cwd with . */
export function shortenPath(fullPath: string, cwd: string): string {
  const home = homedir();
  if (fullPath === home || fullPath.startsWith(home + sep)) {
    return '~' + fullPath.slice(home.length);
  }
  if (fullPath === cwd || fullPath.startsWith(cwd + sep)) {
    return '.' + fullPath.slice(cwd.length);
  }
  return fullPath;
}

/** Format a list of items, truncating if too many */
export function formatList(items: string[], maxShow = 5): string {
  if (items.length <= maxShow) return items.join(', ');
  const shown = items.slice(0, maxShow);
  return `${shown.join(', ')} +${items.length - maxShow} more`;
}

/** Pad a string to visible width (ignoring ANSI codes) */
function padEnd(str: string, width: number): string {
  const visible = str.replace(/\x1b\[[0-9;]*m/g, '');
  return str + ' '.repeat(Math.max(0, width - visible.length));
}

/** Split agents into universal and non-universal groups */
function splitAgentsByType(agentTypes: AgentType[]): {
  universal: string[];
  symlinked: string[];
} {
  const universal: string[] = [];
  const symlinked: string[] = [];
  for (const a of agentTypes) {
    if (isUniversalAgent(a)) {
      universal.push(agents[a].displayName);
    } else {
      symlinked.push(agents[a].displayName);
    }
  }
  return { universal, symlinked };
}

/** Build summary lines showing universal vs symlinked agents */
export function buildAgentSummaryLines(
  targetAgents: AgentType[],
  installMode: InstallMode
): string[] {
  const lines: string[] = [];
  const { universal, symlinked } = splitAgentsByType(targetAgents);

  if (installMode === 'symlink') {
    if (universal.length > 0) {
      lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
    }
    if (symlinked.length > 0) {
      lines.push(`  ${pc.dim('symlink →')} ${formatList(symlinked)}`);
    }
  } else {
    const allNames = targetAgents.map((a) => agents[a].displayName);
    lines.push(`  ${pc.dim('copy →')} ${formatList(allNames)}`);
  }
  return lines;
}

/** Build result lines from installation results */
export function buildResultLines(
  results: Array<{ agent: string; symlinkFailed?: boolean }>,
  targetAgents: AgentType[]
): string[] {
  const lines: string[] = [];
  const { universal } = splitAgentsByType(targetAgents);

  const successSymlinks = results
    .filter((r) => !r.symlinkFailed && !universal.includes(r.agent))
    .map((r) => r.agent);
  const failedSymlinks = results.filter((r) => r.symlinkFailed).map((r) => r.agent);

  if (universal.length > 0) {
    lines.push(`  ${pc.green('universal:')} ${formatList(universal)}`);
  }
  if (successSymlinks.length > 0) {
    lines.push(`  ${pc.dim('symlinked:')} ${formatList(successSymlinks)}`);
  }
  if (failedSymlinks.length > 0) {
    lines.push(`  ${pc.yellow('copied:')} ${formatList(failedSymlinks)}`);
  }
  return lines;
}

/** Ensure universal agents are always included in target list */
export function ensureUniversalAgents(targetAgents: AgentType[]): AgentType[] {
  const result = [...targetAgents];
  if (!result.includes('universal')) {
    result.push('universal');
  }
  return result;
}
