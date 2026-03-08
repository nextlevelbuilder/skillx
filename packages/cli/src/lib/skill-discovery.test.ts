import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { discoverSkills, filterSkills, getSkillDisplayName, parseSkillMd } from './skill-discovery.js';

let testDir: string;

beforeEach(async () => {
  testDir = join(tmpdir(), `skillx-test-${Date.now()}`);
  await mkdir(testDir, { recursive: true });
});

afterEach(async () => {
  await rm(testDir, { recursive: true, force: true });
});

async function createSkill(dir: string, name: string, description: string): Promise<void> {
  await mkdir(dir, { recursive: true });
  await writeFile(
    join(dir, 'SKILL.md'),
    `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\nContent here.`
  );
}

describe('parseSkillMd', () => {
  it('parses valid SKILL.md with frontmatter', async () => {
    await createSkill(testDir, 'test-skill', 'A test skill');
    const skill = await parseSkillMd(join(testDir, 'SKILL.md'));
    expect(skill).not.toBeNull();
    expect(skill!.name).toBe('test-skill');
    expect(skill!.description).toBe('A test skill');
  });

  it('returns null for missing name', async () => {
    await mkdir(testDir, { recursive: true });
    await writeFile(join(testDir, 'SKILL.md'), '---\ndescription: no name\n---\n');
    const skill = await parseSkillMd(join(testDir, 'SKILL.md'));
    expect(skill).toBeNull();
  });

  it('returns null for non-existent file', async () => {
    const skill = await parseSkillMd(join(testDir, 'nonexistent', 'SKILL.md'));
    expect(skill).toBeNull();
  });
});

describe('discoverSkills', () => {
  it('finds root-level SKILL.md', async () => {
    await createSkill(testDir, 'root-skill', 'Root skill');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('root-skill');
  });

  it('finds skills in skills/ subdirectory', async () => {
    await createSkill(join(testDir, 'skills', 'alpha'), 'alpha', 'Alpha skill');
    await createSkill(join(testDir, 'skills', 'beta'), 'beta', 'Beta skill');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(2);
    const names = skills.map((s) => s.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('finds skills in .claude/skills/ subdirectory', async () => {
    await createSkill(join(testDir, '.claude', 'skills', 'my-skill'), 'my-skill', 'Claude skill');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('my-skill');
  });

  it('deduplicates skills by name', async () => {
    await createSkill(join(testDir, 'skills', 'dupe'), 'same-name', 'First');
    await createSkill(join(testDir, '.claude', 'skills', 'dupe'), 'same-name', 'Second');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
  });

  it('respects subpath parameter', async () => {
    await createSkill(join(testDir, 'sub', 'skills', 'nested'), 'nested', 'Nested');
    const skills = await discoverSkills(testDir, 'sub');
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('nested');
  });

  it('rejects path traversal in subpath', async () => {
    await expect(discoverSkills(testDir, '../../etc')).rejects.toThrow('Invalid subpath');
  });

  it('returns empty for directory with no skills', async () => {
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(0);
  });

  it('recursive fallback finds deeply nested skills', async () => {
    await createSkill(join(testDir, 'deep', 'nested', 'skill'), 'deep-skill', 'Deep');
    const skills = await discoverSkills(testDir);
    expect(skills).toHaveLength(1);
    expect(skills[0]!.name).toBe('deep-skill');
  });
});

describe('filterSkills', () => {
  const skills = [
    { name: 'alpha', description: 'A', path: '/a' },
    { name: 'Beta', description: 'B', path: '/b' },
    { name: 'gamma', description: 'G', path: '/g' },
  ];

  it('filters by exact name (case-insensitive)', () => {
    const result = filterSkills(skills, ['alpha']);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('alpha');
  });

  it('filters case-insensitively', () => {
    const result = filterSkills(skills, ['BETA']);
    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('Beta');
  });

  it('filters multiple names', () => {
    const result = filterSkills(skills, ['alpha', 'gamma']);
    expect(result).toHaveLength(2);
  });

  it('returns empty for no matches', () => {
    const result = filterSkills(skills, ['nonexistent']);
    expect(result).toHaveLength(0);
  });
});

describe('getSkillDisplayName', () => {
  it('returns skill name when available', () => {
    expect(getSkillDisplayName({ name: 'my-skill', description: '', path: '/x/my-skill' })).toBe('my-skill');
  });

  it('falls back to basename when name is empty', () => {
    expect(getSkillDisplayName({ name: '', description: '', path: '/x/fallback-dir' })).toBe('fallback-dir');
  });
});
