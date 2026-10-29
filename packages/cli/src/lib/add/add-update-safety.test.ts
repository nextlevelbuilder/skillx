import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAdd } from '../../commands/add.js';
import { createInstallContext } from '../install/install-context.js';
import { createRegistry } from '../install/registry-client.js';
import { CliError } from '../output.js';
import type { InstallLockAdded } from '@skillx/contracts';
import { existingLock } from '../install/lock-file.js';
import { entrySourceRef, writeAddedLock } from './add-lock.js';
import { applyAdd } from './add-install.js';
import { openLocalSource } from './local-source.js';
import { prepareSkill } from './skill-discovery.js';
import { pickUpdated, updateAdded, updateFailure } from './add-refresh.js';
import { parseAddSource } from './add-source.js';
import { openGitSource } from './git-source.js';

/**
 * Safety of re-reading added skills: `update` keeps the skill it installed
 * when a source grows another of the same name and goes on past a broken
 * source, a commit id must be on a branch or tag of the repository, and a
 * project directory reached through a link is refused.
 */

let root: string;
const saved = { ...process.env };
const env = () => ({ HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), SKILLX_HOME: join(root, 'skillx'), CLAUDE_CONFIG_DIR: join(root, 'claude'), CODEX_HOME: join(root, 'codex') });
const ctx = (projectDir?: string) => createInstallContext({ registry: createRegistry({ baseUrl: 'http://127.0.0.1:9' }), env: env(), ...(projectDir ? { projectDir } : {}) });
const skillMd = (name: string, body = '') => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n${body}`;

function write(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
function git(cwd: string, args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { cwd, encoding: 'utf8' }).trim();
}
function thrown(run: () => unknown): CliError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error('expected a failure');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-add-safety-'));
  Object.assign(process.env, env());
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

describe('update of added skills', () => {
  it('keeps the skill at the directory it was installed from when another of its name appears', async () => {
    const src = join(root, 'src');
    write(join(src, 'two', 'same', 'SKILL.md'), skillMd('same'));
    await runAdd(src, { json: true });
    write(join(src, 'one', 'same', 'SKILL.md'), skillMd('same', 'impostor\n'));
    write(join(src, 'two', 'same', 'SKILL.md'), skillMd('same', 'v2\n'));
    const result = await updateAdded(ctx(), []);
    expect(result.failures).toEqual([]);
    expect(readFileSync(join(root, 'claude', 'skills', 'same', 'SKILL.md'), 'utf8')).toBe(skillMd('same', 'v2\n'));
  });

  it('refuses to guess between two skills of the name when neither is where it was', () => {
    const source = parseAddSource(join(root, 'src'));
    const skills = [{ name: 'same', description: '', dir: 'one' }, { name: 'same', description: '', dir: 'two' }];
    expect(thrown(() => pickUpdated(skills, source, 'same', 'elsewhere')).code).toBe('conflict');
    expect(pickUpdated(skills.slice(1), source, 'same', 'elsewhere').dir).toBe('two');
  });

  it('updates the sources it can read and reports the one it cannot', async () => {
    const [a, b] = [join(root, 'a'), join(root, 'b')];
    write(join(a, 'alpha', 'SKILL.md'), skillMd('alpha'));
    write(join(b, 'beta', 'SKILL.md'), skillMd('beta'));
    await runAdd(a, { json: true });
    await runAdd(b, { json: true });
    rmSync(a, { recursive: true });
    write(join(b, 'beta', 'SKILL.md'), skillMd('beta', 'v2\n'));
    const result = await updateAdded(ctx(), []);
    expect(result.failures.map((f) => f.aliases)).toEqual([['alpha']]);
    expect(readFileSync(join(root, 'claude', 'skills', 'beta', 'SKILL.md'), 'utf8')).toBe(skillMd('beta', 'v2\n'));
    const error = updateFailure(result, null)!;
    // A missing local directory is a usage error, as when it is added.
    expect(error.code).toBe('usage_error');
    expect(error.message).toContain('could not be updated');
    expect(error.details).toMatchObject({ updated: ['add:beta'], failures: [{ aliases: ['alpha'], code: 'usage_error' }] });
  });
});

describe('the lock of added skills', () => {
  const C = 'c'.repeat(40);
  const entry: InstallLockAdded = { alias: 'demo', repository: 'https://github.com/acme/skills.git', path: 'skills/demo', ref: 'v1', commit: C, treeDigest: `sha256:${'0'.repeat(64)}` };

  it('gives the whole repository as the source of a path holding @', () => {
    expect(entrySourceRef({ ...entry, path: 'team@x/demo' })).toBe('github:acme/skills@v1');
  });

  it('drops the pin of a skill from git that a local copy replaces, and no other', async () => {
    const lockPath = join(root, 'skillx.lock.json');
    writeAddedLock(lockPath, [entry, { ...entry, alias: 'other', path: 'skills/other' }]);
    const src = join(root, 'src');
    write(join(src, 'other', 'SKILL.md'), skillMd('other'));
    // Never added from git here: the lock is not this install's to change.
    await runAdd(src, { json: true, skill: ['other'], lock: lockPath });
    expect((existingLock(lockPath)?.added ?? []).map((a) => a.alias)).toEqual(['demo', 'other']);
    write(join(src, 'demo', 'SKILL.md'), skillMd('demo'));
    const snapshot = openLocalSource(src);
    const tree = prepareSkill(snapshot, { name: 'demo', description: '', dir: 'demo' });
    snapshot.dispose();
    await applyAdd(ctx(), [{ alias: 'demo', origin: 'github:acme/skills/skills/demo@v1', ref: 'github:acme/skills/skills/demo@v1', version: C, tree }]);
    const result = await runAdd(src, { json: true, skill: ['demo'], force: true, lock: lockPath });
    expect(result).toMatchObject({ status: 'installed', lockPath });
    expect((existingLock(lockPath)?.added ?? []).map((a) => a.alias)).toEqual(['other']);
  });
});

describe('commit ids', () => {
  it('reads a commit on another branch or a tag, and refuses one no branch or tag has', () => {
    const src = join(root, 'src');
    write(join(src, 'demo', 'SKILL.md'), skillMd('demo'));
    git(src, ['init', '-q', '-b', 'main']);
    git(src, ['add', '-A']);
    git(src, ['commit', '-q', '-m', 'one']);
    const tree = git(src, ['rev-parse', 'HEAD^{tree}']);
    git(src, ['checkout', '-q', '-b', 'side']);
    git(src, ['commit', '-q', '--allow-empty', '-m', 'side']);
    const side = git(src, ['rev-parse', 'HEAD']);
    git(src, ['checkout', '-q', '--detach']);
    git(src, ['commit', '-q', '--allow-empty', '-m', 'tagged']);
    const tagged = git(src, ['rev-parse', 'HEAD']);
    git(src, ['tag', '-a', '-m', 'v1', 'v1']);
    git(src, ['checkout', '-q', 'main']);
    // A commit no ref names, as one pushed only to a fork looks from its parent.
    const loose = git(src, ['commit-tree', tree, '-m', 'loose']);
    const url = pathToFileURL(src).href;
    for (const commit of [side, tagged]) {
      const snapshot = openGitSource(url, 'repo', commit, 'file');
      expect(snapshot.commit).toBe(commit);
      expect(snapshot.skillFiles('')).toEqual(['demo/SKILL.md']);
      snapshot.dispose();
    }
    expect(thrown(() => openGitSource(url, 'repo', loose, 'file')).code).toBe('integrity_error');
    // A remote whose HEAD names no branch still has the commit on its branches.
    git(src, ['symbolic-ref', 'HEAD', 'refs/heads/gone']);
    const followed = openGitSource(url, 'repo', side, 'file', 'side');
    expect(followed.commit).toBe(side);
    followed.dispose();
    openGitSource(url, 'repo', side, 'file').dispose();
  });
});

describe('project scope', () => {
  it('refuses a skills or staging directory that is a link out of the project', async () => {
    const outside = join(root, 'outside');
    mkdirSync(outside, { recursive: true });
    const project = join(root, 'project');
    mkdirSync(join(project, '.claude'), { recursive: true });
    symlinkSync(outside, join(project, '.claude', 'skills'), 'junction');
    expect(thrown(() => ctx(project)).code).toBe('conflict');
    rmSync(join(project, '.claude'), { recursive: true });
    symlinkSync(outside, join(project, '.claude'), 'junction');
    expect(thrown(() => ctx(project)).code).toBe('conflict');
    // The project reached through a link is the same project, with the same state.
    rmSync(join(project, '.claude'));
    symlinkSync(project, join(root, 'alias'), 'junction');
    expect(ctx(join(root, 'alias')).home).toBe(ctx(project).home);
    expect(ctx(join(root, 'alias')).skillsDir).toBe(join(project, '.claude', 'skills'));
  });
});
