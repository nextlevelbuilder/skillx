import { createHash } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { usageError } from './install-errors.js';

/**
 * Harness adapters: where a runtime loads skills from. An adapter only maps a
 * runtime id to a skills directory; the installer does everything else the
 * same way for every runtime. Every location is derived from the process
 * environment at call time (HOME/USERPROFILE through `os.homedir()`,
 * `CLAUDE_CONFIG_DIR`, `CODEX_HOME`, `SKILLX_HOME`), so tests point all of
 * them at a temporary directory and never touch real user state.
 */

export type Env = Record<string, string | undefined>;

export interface HarnessAdapter {
  /** Runtime id, the key used by compatibility declarations and kit `runtimes`. */
  id: 'claude-code' | 'codex';
  displayName: string;
  /** Directory holding one sub-directory per installed skill. */
  skillsDir(env?: Env): string;
  /** The runtime's project skills directory under `projectDir`. */
  projectSkillsDir(projectDir: string): string;
}

/** HOME on POSIX and USERPROFILE on Windows, as `os.homedir()` reads them, but from `env`. */
export function homeDir(env: Env = process.env): string {
  const fromEnv = process.platform === 'win32' ? env.USERPROFILE : env.HOME;
  return fromEnv ? resolve(fromEnv) : homedir();
}

/** SkillX local state: receipts, journals, owner records, the blob cache. */
export function skillxHome(env: Env = process.env): string {
  return env.SKILLX_HOME ? resolve(env.SKILLX_HOME) : join(homeDir(env), '.skillx');
}

export const claudeCodeAdapter: HarnessAdapter = {
  id: 'claude-code',
  displayName: 'Claude Code',
  skillsDir: (env = process.env) => join(env.CLAUDE_CONFIG_DIR ? resolve(env.CLAUDE_CONFIG_DIR) : join(homeDir(env), '.claude'), 'skills'),
  projectSkillsDir: (projectDir) => join(projectDir, '.claude', 'skills'),
};

export const codexAdapter: HarnessAdapter = {
  id: 'codex',
  displayName: 'Codex',
  skillsDir: (env = process.env) => join(env.CODEX_HOME ? resolve(env.CODEX_HOME) : join(homeDir(env), '.codex'), 'skills'),
  // Codex reads repository skills from `.agents/skills`.
  projectSkillsDir: (projectDir) => join(projectDir, '.agents', 'skills'),
};

export const ADAPTERS: readonly HarnessAdapter[] = [claudeCodeAdapter, codexAdapter];
export const DEFAULT_RUNTIME = claudeCodeAdapter.id;

export function getAdapter(id: string): HarnessAdapter {
  const adapter = ADAPTERS.find((a) => a.id === id);
  if (!adapter) throw usageError(`unknown runtime '${id}'; use one of: ${ADAPTERS.map((a) => a.id).join(', ')}`);
  return adapter;
}

/**
 * Staging and backup area of an adapter: a sibling of the skills directory,
 * so a rename never crosses a filesystem and the runtime never loads a
 * half-written skill from it.
 */
export function stagingDir(adapter: HarnessAdapter, env: Env = process.env): string {
  return stagingFor(adapter.skillsDir(env));
}

export const stagingFor = (skillsDir: string) => join(dirname(skillsDir), '.skillx-staging');

/**
 * Installer state of a project-scope install: its own receipts, owners,
 * journals and install lock under `<skillxHome>/projects/<digest of the
 * project's real path>`, so a project's skills never share ref-counts with
 * the user-scope install of the same runtime. The project gets the skills
 * and the runtime's `.skillx-staging` directory beside them.
 */
export function projectHome(env: Env, projectDir: string): string {
  return join(skillxHome(env), 'projects', createHash('sha256').update(projectDir).digest('hex').slice(0, 16));
}
