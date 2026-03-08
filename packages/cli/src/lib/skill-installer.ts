import { mkdir, cp, lstat, rm, symlink, readlink, realpath } from 'fs/promises';
import { join, basename, normalize, resolve, sep, relative, dirname } from 'path';
import { homedir } from 'os';
import type { Skill, AgentType, InstallMode, InstallResult } from './add-types.js';
import { agents, isUniversalAgent, getCanonicalSkillsDir, getAgentBaseDir } from './agent-registry.js';

/**
 * Sanitize a name for safe use in file paths.
 * Lowercase, replace special chars with hyphens, trim dots/hyphens.
 */
export function sanitizeName(name: string): string {
  const sanitized = name
    .toLowerCase()
    .replace(/[^a-z0-9._]+/g, '-')
    .replace(/^[.\-]+|[.\-]+$/g, '');
  return sanitized.substring(0, 255) || 'unnamed-skill';
}

/** Check if a skill is already installed for an agent */
export async function isSkillInstalled(
  skillName: string,
  agent: AgentType,
  options: { global?: boolean }
): Promise<boolean> {
  const baseDir = getAgentBaseDir(agent, options.global ?? false);
  const skillDir = join(baseDir, sanitizeName(skillName));
  try {
    await lstat(skillDir);
    return true;
  } catch {
    return false;
  }
}

/** Get the canonical install path for a skill */
export function getCanonicalPath(
  skillName: string,
  options: { global?: boolean }
): string {
  return join(getCanonicalSkillsDir(options.global ?? false), sanitizeName(skillName));
}

/** Get the install path for a specific agent */
export function getInstallPath(
  skillName: string,
  agent: AgentType,
  options: { global?: boolean }
): string {
  return join(getAgentBaseDir(agent, options.global ?? false), sanitizeName(skillName));
}

/** Clean and recreate a directory */
async function cleanAndCreateDir(path: string): Promise<void> {
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    // Ignore — mkdir will fail if real problem
  }
  await mkdir(path, { recursive: true });
}

/** Resolve parent symlinks while keeping final component */
async function resolveParentSymlinks(path: string): Promise<string> {
  const resolved = resolve(path);
  const dir = dirname(resolved);
  const base = basename(resolved);
  try {
    const realDir = await realpath(dir);
    return join(realDir, base);
  } catch {
    return resolved;
  }
}

/** Create symlink with cross-platform handling. Returns false if fallback to copy needed. */
async function createSymlink(target: string, linkPath: string): Promise<boolean> {
  try {
    const resolvedTarget = resolve(target);
    const resolvedLinkPath = resolve(linkPath);

    // Check if paths resolve to same location
    const [realTarget, realLinkPath] = await Promise.all([
      realpath(resolvedTarget).catch(() => resolvedTarget),
      realpath(resolvedLinkPath).catch(() => resolvedLinkPath),
    ]);

    if (realTarget === realLinkPath) return true;

    // Check with parent symlinks resolved
    const realTargetParent = await resolveParentSymlinks(target);
    const realLinkParent = await resolveParentSymlinks(linkPath);
    if (realTargetParent === realLinkParent) return true;

    // Remove existing link/dir if present
    try {
      const stats = await lstat(linkPath);
      if (stats.isSymbolicLink()) {
        const existing = await readlink(linkPath);
        if (resolve(dirname(linkPath), existing) === resolvedTarget) return true;
        await rm(linkPath);
      } else {
        await rm(linkPath, { recursive: true });
      }
    } catch (err: unknown) {
      if (err && typeof err === 'object' && 'code' in err && err.code === 'ELOOP') {
        try { await rm(linkPath, { force: true }); } catch { /* noop */ }
      }
    }

    const linkDir = dirname(linkPath);
    await mkdir(linkDir, { recursive: true });

    const realLinkDir = await resolveParentSymlinks(linkDir);
    const relTarget = relative(realLinkDir, resolvedTarget);

    // Use 'junction' on Windows for directory symlinks (no admin rights needed)
    const symlinkType = process.platform === 'win32' ? 'junction' : undefined;
    await symlink(
      symlinkType === 'junction' ? resolvedTarget : relTarget,
      linkPath,
      symlinkType
    );
    return true;
  } catch {
    return false;
  }
}

/** Install a skill for a specific agent (copy or symlink) */
export async function installSkillForAgent(
  skill: Skill,
  agent: AgentType,
  options: { global?: boolean; mode?: InstallMode }
): Promise<InstallResult> {
  const global = options.global ?? false;
  const mode = options.mode ?? 'symlink';
  const safeName = sanitizeName(skill.name);

  const canonicalDir = join(getCanonicalSkillsDir(global), safeName);
  const agentDir = join(getAgentBaseDir(agent, global), safeName);

  try {
    // Always copy to canonical directory first
    await cleanAndCreateDir(canonicalDir);
    await cp(skill.path, canonicalDir, { recursive: true });

    // For universal agents, canonical IS the agent dir
    if (isUniversalAgent(agent)) {
      return { success: true, path: canonicalDir, canonicalPath: canonicalDir, mode };
    }

    if (mode === 'copy') {
      await cleanAndCreateDir(agentDir);
      await cp(skill.path, agentDir, { recursive: true });
      return { success: true, path: agentDir, canonicalPath: canonicalDir, mode: 'copy' };
    }

    // Symlink mode: link agent dir → canonical dir
    const linked = await createSymlink(canonicalDir, agentDir);
    if (linked) {
      return { success: true, path: agentDir, canonicalPath: canonicalDir, mode: 'symlink' };
    }

    // Fallback to copy if symlink fails (e.g., Windows without Developer Mode)
    await cleanAndCreateDir(agentDir);
    await cp(skill.path, agentDir, { recursive: true });
    return {
      success: true,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode: 'symlink',
      symlinkFailed: true,
    };
  } catch (error) {
    return {
      success: false,
      path: agentDir,
      canonicalPath: canonicalDir,
      mode,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
