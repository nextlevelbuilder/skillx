import { homedir } from 'os';
import { join } from 'path';
import { existsSync } from 'fs';
import type { AgentConfig, AgentType } from './add-types.js';

const home = homedir();
const claudeHome = process.env.CLAUDE_CONFIG_DIR?.trim() || join(home, '.claude');

// Canonical directory for universal agents (.agents/skills)
const AGENTS_DIR = '.agents';
const SKILLS_SUBDIR = 'skills';

/** All supported agent configurations */
export const agents: Record<AgentType, AgentConfig> = {
  amp: {
    name: 'amp',
    displayName: 'Amp',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.config/agents/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/amp')),
  },
  augment: {
    name: 'augment',
    displayName: 'Augment',
    skillsDir: '.augment/skills',
    globalSkillsDir: join(home, '.augment/skills'),
    detectInstalled: async () => existsSync(join(home, '.augment')),
  },
  'claude-code': {
    name: 'claude-code',
    displayName: 'Claude Code',
    skillsDir: '.claude/skills',
    globalSkillsDir: join(claudeHome, 'skills'),
    detectInstalled: async () => existsSync(claudeHome),
  },
  cline: {
    name: 'cline',
    displayName: 'Cline',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents', 'skills'),
    detectInstalled: async () => existsSync(join(home, '.cline')),
  },
  codebuddy: {
    name: 'codebuddy',
    displayName: 'CodeBuddy',
    skillsDir: '.codebuddy/skills',
    globalSkillsDir: join(home, '.codebuddy/skills'),
    detectInstalled: async () => existsSync(join(home, '.codebuddy')),
  },
  codex: {
    name: 'codex',
    displayName: 'Codex',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.codex/skills'),
    detectInstalled: async () => existsSync(join(home, '.codex')),
  },
  'command-code': {
    name: 'command-code',
    displayName: 'Command Code',
    skillsDir: '.commandcode/skills',
    globalSkillsDir: join(home, '.commandcode/skills'),
    detectInstalled: async () => existsSync(join(home, '.commandcode')),
  },
  continue: {
    name: 'continue',
    displayName: 'Continue',
    skillsDir: '.continue/skills',
    globalSkillsDir: join(home, '.continue/skills'),
    detectInstalled: async () => existsSync(join(home, '.continue')),
  },
  cursor: {
    name: 'cursor',
    displayName: 'Cursor',
    skillsDir: '.cursor/skills',
    globalSkillsDir: join(home, '.cursor/skills'),
    detectInstalled: async () => existsSync(join(home, '.cursor')),
  },
  'gemini-cli': {
    name: 'gemini-cli',
    displayName: 'Gemini CLI',
    skillsDir: '.gemini/skills',
    globalSkillsDir: join(home, '.gemini/skills'),
    detectInstalled: async () => existsSync(join(home, '.gemini')),
  },
  'github-copilot': {
    name: 'github-copilot',
    displayName: 'GitHub Copilot',
    skillsDir: '.github/skills',
    globalSkillsDir: undefined,
    detectInstalled: async () => existsSync(join(process.cwd(), '.github')),
  },
  goose: {
    name: 'goose',
    displayName: 'Goose',
    skillsDir: '.goose/skills',
    globalSkillsDir: join(home, '.config/goose/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/goose')),
  },
  junie: {
    name: 'junie',
    displayName: 'Junie',
    skillsDir: '.junie/skills',
    globalSkillsDir: join(home, '.junie/skills'),
    detectInstalled: async () => existsSync(join(home, '.junie')),
  },
  kilo: {
    name: 'kilo',
    displayName: 'Kilo',
    skillsDir: '.kilocode/skills',
    globalSkillsDir: join(home, '.kilocode/skills'),
    detectInstalled: async () => existsSync(join(home, '.kilocode')),
  },
  'kiro-cli': {
    name: 'kiro-cli',
    displayName: 'Kiro',
    skillsDir: '.kiro/skills',
    globalSkillsDir: join(home, '.kiro/skills'),
    detectInstalled: async () => existsSync(join(home, '.kiro')),
  },
  kode: {
    name: 'kode',
    displayName: 'Kode',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    detectInstalled: async () => existsSync(join(home, '.kode')),
  },
  mux: {
    name: 'mux',
    displayName: 'Mux',
    skillsDir: '.mux/skills',
    globalSkillsDir: join(home, '.mux/skills'),
    detectInstalled: async () => existsSync(join(home, '.mux')),
  },
  neovate: {
    name: 'neovate',
    displayName: 'Neovate',
    skillsDir: '.neovate/skills',
    globalSkillsDir: join(home, '.neovate/skills'),
    detectInstalled: async () => existsSync(join(home, '.neovate')),
  },
  opencode: {
    name: 'opencode',
    displayName: 'OpenCode',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.config/agents/skills'),
    detectInstalled: async () => existsSync(join(home, '.config/opencode')),
  },
  openhands: {
    name: 'openhands',
    displayName: 'OpenHands',
    skillsDir: '.openhands/skills',
    globalSkillsDir: join(home, '.openhands/skills'),
    detectInstalled: async () => existsSync(join(home, '.openhands')),
  },
  roo: {
    name: 'roo',
    displayName: 'Roo',
    skillsDir: '.roo/skills',
    globalSkillsDir: join(home, '.roo/skills'),
    detectInstalled: async () => existsSync(join(home, '.roo')),
  },
  trae: {
    name: 'trae',
    displayName: 'Trae',
    skillsDir: '.trae/skills',
    globalSkillsDir: join(home, '.trae/skills'),
    detectInstalled: async () => existsSync(join(home, '.trae')),
  },
  windsurf: {
    name: 'windsurf',
    displayName: 'Windsurf',
    skillsDir: '.windsurf/skills',
    globalSkillsDir: join(home, '.windsurf/skills'),
    detectInstalled: async () => existsSync(join(home, '.windsurf')),
  },
  zencoder: {
    name: 'zencoder',
    displayName: 'Zencoder',
    skillsDir: '.zencoder/skills',
    globalSkillsDir: join(home, '.zencoder/skills'),
    detectInstalled: async () => existsSync(join(home, '.zencoder')),
  },
  universal: {
    name: 'universal',
    displayName: 'Universal (.agents/skills)',
    skillsDir: '.agents/skills',
    globalSkillsDir: join(home, '.agents/skills'),
    detectInstalled: async () => true,
  },
};

// Agents that share the canonical .agents/skills directory
const UNIVERSAL_AGENTS: AgentType[] = ['universal'];

export function isUniversalAgent(agent: AgentType): boolean {
  return UNIVERSAL_AGENTS.includes(agent);
}

export function getUniversalAgents(): AgentType[] {
  return UNIVERSAL_AGENTS;
}

export function getNonUniversalAgents(): AgentType[] {
  return (Object.keys(agents) as AgentType[]).filter((a) => !isUniversalAgent(a));
}

/** Detect which agents are installed on the system */
export async function detectInstalledAgents(): Promise<AgentType[]> {
  const results = await Promise.all(
    (Object.keys(agents) as AgentType[]).map(async (key) => ({
      key,
      installed: await agents[key].detectInstalled(),
    }))
  );
  return results.filter((r) => r.installed).map((r) => r.key);
}

/** Get canonical skills directory (.agents/skills) */
export function getCanonicalSkillsDir(global: boolean, cwd?: string): string {
  const baseDir = global ? homedir() : cwd || process.cwd();
  return join(baseDir, AGENTS_DIR, SKILLS_SUBDIR);
}

/** Get agent-specific base directory for skills */
export function getAgentBaseDir(agentType: AgentType, global: boolean, cwd?: string): string {
  if (isUniversalAgent(agentType)) {
    return getCanonicalSkillsDir(global, cwd);
  }

  const agent = agents[agentType];
  const baseDir = global ? homedir() : cwd || process.cwd();

  if (global) {
    return agent.globalSkillsDir ?? join(baseDir, agent.skillsDir);
  }
  return join(baseDir, agent.skillsDir);
}
