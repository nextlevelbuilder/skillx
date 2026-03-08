import { readdir, readFile, stat } from 'fs/promises';
import { join, basename, dirname, normalize, resolve, sep } from 'path';
import matter from 'gray-matter';
import type { Skill } from './add-types.js';

const SKIP_DIRS = ['node_modules', '.git', 'dist', 'build', '__pycache__'];

async function hasSkillMd(dir: string): Promise<boolean> {
  try {
    const stats = await stat(join(dir, 'SKILL.md'));
    return stats.isFile();
  } catch {
    return false;
  }
}

/** Parse a SKILL.md file into a Skill object. Returns null if invalid. */
export async function parseSkillMd(skillMdPath: string): Promise<Skill | null> {
  try {
    const content = await readFile(skillMdPath, 'utf-8');
    const { data } = matter(content);

    if (!data.name || !data.description) return null;
    if (typeof data.name !== 'string' || typeof data.description !== 'string') return null;

    return {
      name: data.name,
      description: data.description,
      path: dirname(skillMdPath),
      rawContent: content,
      metadata: data.metadata,
    };
  } catch {
    return null;
  }
}

/** Recursively find directories containing SKILL.md */
async function findSkillDirs(dir: string, depth = 0, maxDepth = 5): Promise<string[]> {
  if (depth > maxDepth) return [];

  try {
    const [hasSkill, entries] = await Promise.all([
      hasSkillMd(dir),
      readdir(dir, { withFileTypes: true }).catch(() => []),
    ]);

    const currentDir = hasSkill ? [dir] : [];
    const subResults = await Promise.all(
      entries
        .filter((e) => e.isDirectory() && !SKIP_DIRS.includes(e.name))
        .map((e) => findSkillDirs(join(dir, e.name), depth + 1, maxDepth))
    );

    return [...currentDir, ...subResults.flat()];
  } catch {
    return [];
  }
}

export interface DiscoverOptions {
  fullDepth?: boolean;
}

/** Validate subpath stays within base directory */
function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(join(basePath, subpath)));
  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

/**
 * Discover all skills in a directory by searching for SKILL.md files.
 * Priority: root → common skill directories → recursive fallback.
 */
export async function discoverSkills(
  basePath: string,
  subpath?: string,
  options?: DiscoverOptions
): Promise<Skill[]> {
  const skills: Skill[] = [];
  const seenNames = new Set<string>();

  if (subpath && !isSubpathSafe(basePath, subpath)) {
    throw new Error(`Invalid subpath: "${subpath}" resolves outside the repository directory.`);
  }

  const searchPath = subpath ? join(basePath, subpath) : basePath;

  // If pointing directly at a skill, add it
  if (await hasSkillMd(searchPath)) {
    const skill = await parseSkillMd(join(searchPath, 'SKILL.md'));
    if (skill) {
      skills.push(skill);
      seenNames.add(skill.name);
      if (!options?.fullDepth) return skills;
    }
  }

  // Search common skill locations first
  const priorityDirs = [
    searchPath,
    join(searchPath, 'skills'),
    join(searchPath, '.agent/skills'),
    join(searchPath, '.agents/skills'),
    join(searchPath, '.claude/skills'),
    join(searchPath, '.cline/skills'),
    join(searchPath, '.github/skills'),
    join(searchPath, '.goose/skills'),
    join(searchPath, '.kiro/skills'),
    join(searchPath, '.opencode/skills'),
    join(searchPath, '.roo/skills'),
    join(searchPath, '.trae/skills'),
    join(searchPath, '.windsurf/skills'),
  ];

  for (const dir of priorityDirs) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;
        const skillDir = join(dir, entry.name);
        if (await hasSkillMd(skillDir)) {
          const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
          if (skill && !seenNames.has(skill.name)) {
            skills.push(skill);
            seenNames.add(skill.name);
          }
        }
      }
    } catch {
      // Directory doesn't exist — skip
    }
  }

  // Recursive fallback if nothing found, or fullDepth requested
  if (skills.length === 0 || options?.fullDepth) {
    const allDirs = await findSkillDirs(searchPath);
    for (const skillDir of allDirs) {
      const skill = await parseSkillMd(join(skillDir, 'SKILL.md'));
      if (skill && !seenNames.has(skill.name)) {
        skills.push(skill);
        seenNames.add(skill.name);
      }
    }
  }

  return skills;
}

export function getSkillDisplayName(skill: Skill): string {
  return skill.name || basename(skill.path);
}

/** Filter skills by name (case-insensitive) */
export function filterSkills(skills: Skill[], inputNames: string[]): Skill[] {
  const normalized = inputNames.map((n) => n.toLowerCase());
  return skills.filter((skill) => {
    const name = skill.name.toLowerCase();
    const display = getSkillDisplayName(skill).toLowerCase();
    return normalized.some((input) => input === name || input === display);
  });
}
