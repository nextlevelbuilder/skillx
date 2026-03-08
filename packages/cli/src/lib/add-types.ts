/** Shared types for the `skillx add` command */

export type AgentType =
  | 'amp'
  | 'augment'
  | 'claude-code'
  | 'cline'
  | 'codebuddy'
  | 'codex'
  | 'command-code'
  | 'continue'
  | 'cursor'
  | 'gemini-cli'
  | 'github-copilot'
  | 'goose'
  | 'junie'
  | 'kilo'
  | 'kiro-cli'
  | 'kode'
  | 'mux'
  | 'neovate'
  | 'opencode'
  | 'openhands'
  | 'roo'
  | 'trae'
  | 'windsurf'
  | 'zencoder'
  | 'universal';

export interface AgentConfig {
  name: string;
  displayName: string;
  skillsDir: string;
  /** Global skills directory. undefined = doesn't support global install. */
  globalSkillsDir: string | undefined;
  detectInstalled: () => Promise<boolean>;
}

export interface Skill {
  name: string;
  description: string;
  path: string;
  rawContent?: string;
  pluginName?: string;
  metadata?: Record<string, unknown>;
}

export interface ParsedSource {
  type: 'github' | 'gitlab' | 'git' | 'local';
  url: string;
  subpath?: string;
  localPath?: string;
  ref?: string;
  /** Skill name from @skill syntax (e.g., owner/repo@skill-name) */
  skillFilter?: string;
}

export interface AddOptions {
  global?: boolean;
  agent?: string[];
  yes?: boolean;
  skill?: string[];
  list?: boolean;
  all?: boolean;
  fullDepth?: boolean;
  copy?: boolean;
}

export type InstallMode = 'symlink' | 'copy';

export interface InstallResult {
  success: boolean;
  path: string;
  canonicalPath?: string;
  mode: InstallMode;
  symlinkFailed?: boolean;
  error?: string;
}
