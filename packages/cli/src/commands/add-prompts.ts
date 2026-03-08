import * as p from '@clack/prompts';
import pc from 'picocolors';
import type { AgentType, Skill, InstallMode } from '../lib/add-types.js';
import { agents, getNonUniversalAgents, getUniversalAgents } from '../lib/agent-registry.js';
import { getSkillDisplayName } from '../lib/skill-discovery.js';
import { getLastSelectedAgents, saveSelectedAgents } from '../lib/skill-lock.js';

const isCancelled = (value: unknown): value is symbol => typeof value === 'symbol';

/** Prompt user to select skills from a list */
export async function selectSkillsInteractive(skills: Skill[]): Promise<Skill[] | null> {
  const sorted = [...skills].sort((a, b) =>
    getSkillDisplayName(a).localeCompare(getSkillDisplayName(b))
  );

  const choices = sorted.map((s) => ({
    value: s,
    label: getSkillDisplayName(s),
    hint: s.description.length > 60 ? s.description.slice(0, 57) + '...' : s.description,
  }));

  const selected = await p.multiselect({
    message: `Select skills to install ${pc.dim('(space to toggle)')}`,
    options: choices as p.Option<Skill>[],
    required: true,
  });

  if (isCancelled(selected)) {
    p.cancel('Installation cancelled');
    return null;
  }
  return selected as Skill[];
}

/** Interactive agent selection with universal agents always included */
export async function selectAgentsInteractive(options: {
  global?: boolean;
}): Promise<AgentType[] | null> {
  const supportsGlobal = (a: AgentType) => !options.global || agents[a].globalSkillsDir;
  const otherAgents = getNonUniversalAgents().filter(supportsGlobal);

  const choices = otherAgents.map((a) => ({
    value: a,
    label: agents[a].displayName,
    hint: options.global ? agents[a].globalSkillsDir! : agents[a].skillsDir,
  }));

  // Pre-select from last session
  let lastSelected: string[] | undefined;
  try {
    lastSelected = await getLastSelectedAgents();
  } catch { /* ignore */ }

  const initialValues = lastSelected
    ? (lastSelected.filter((a) => otherAgents.includes(a as AgentType)) as AgentType[])
    : [];

  const selected = await p.multiselect({
    message: `Which agents do you want to install to? ${pc.dim('(space to toggle)')}`,
    options: choices as p.Option<AgentType>[],
    initialValues,
    required: true,
  });

  if (isCancelled(selected)) {
    p.cancel('Installation cancelled');
    return null;
  }

  const agents_selected = selected as AgentType[];

  // Save selection for next time
  try {
    await saveSelectedAgents(agents_selected as string[]);
  } catch { /* ignore */ }

  // Always include universal agents
  const universals = getUniversalAgents();
  for (const ua of universals) {
    if (!agents_selected.includes(ua)) agents_selected.push(ua);
  }

  return agents_selected;
}

/** Prompt for installation scope (project vs global) */
export async function selectScope(): Promise<boolean | null> {
  const scope = await p.select({
    message: 'Installation scope',
    options: [
      { value: false, label: 'Project', hint: 'Install in current directory' },
      { value: true, label: 'Global', hint: 'Install in home directory (all projects)' },
    ],
  });

  if (isCancelled(scope)) {
    p.cancel('Installation cancelled');
    return null;
  }
  return scope as boolean;
}

/** Prompt for installation method (symlink vs copy) */
export async function selectInstallMode(): Promise<InstallMode | null> {
  const mode = await p.select({
    message: 'Installation method',
    options: [
      { value: 'symlink', label: 'Symlink (Recommended)', hint: 'Single source of truth' },
      { value: 'copy', label: 'Copy to all agents', hint: 'Independent copies' },
    ],
  });

  if (isCancelled(mode)) {
    p.cancel('Installation cancelled');
    return null;
  }
  return mode as InstallMode;
}

/** Confirm installation */
export async function confirmInstall(): Promise<boolean> {
  const confirmed = await p.confirm({ message: 'Proceed with installation?' });
  if (isCancelled(confirmed) || !confirmed) {
    p.cancel('Installation cancelled');
    return false;
  }
  return true;
}
