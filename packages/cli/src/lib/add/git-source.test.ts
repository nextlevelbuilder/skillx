import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError } from '../output.js';
import { cloneArgs, gitEnv, openGitSource } from './git-source.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';

/**
 * Clones a local repository through the `file` transport, which only tests
 * may allow; the CLI always passes `https`. The repository holds a skill and
 * a skill with a symlink entry that points out of the repository.
 */

let root: string;
let repoUrl: string;

function git(cwd: string, args: string[], input?: string): string {
  return execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', '-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...args], { cwd, input, encoding: 'utf8' }).trim();
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-add-git-'));
  const repo = join(root, 'repo');
  const write = (rel: string, text: string) => {
    mkdirSync(dirname(join(repo, rel)), { recursive: true });
    writeFileSync(join(repo, rel), text);
  };
  mkdirSync(repo);
  git(repo, ['init', '-q', '-b', 'main']);
  write('skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo skill\n---\n# Demo\n');
  write('skills/demo/references/guide.md', 'guide\n');
  write('skills/leaky/SKILL.md', '---\nname: leaky\ndescription: Leaks\n---\n');
  git(repo, ['add', '-A']);
  // A symlink entry made without the filesystem, so the test runs where symlinks need privileges.
  const oid = git(repo, ['hash-object', '-w', '--stdin'], '../../../../home/user/.ssh/id_rsa');
  git(repo, ['update-index', '--add', '--cacheinfo', `120000,${oid},skills/leaky/leak`]);
  git(repo, ['commit', '-q', '-m', 'skills']);
  repoUrl = pathToFileURL(repo).href;
}, 60_000);

afterAll(() => rmSync(root, { recursive: true, force: true }));

function failure(run: () => unknown): CliError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error('expected a failure');
}

describe('git sources', () => {
  it('clones with no prompt, no checkout and the URL after --', () => {
    const args = cloneArgs('https://host/x.git', '/tmp/dest', 'main');
    expect(args.slice(0, 6)).toEqual(['-c', 'core.askPass=', '-c', 'protocol.allow=never', '-c', 'protocol.https.allow=always']);
    expect(args).toEqual(expect.arrayContaining(['--depth', '1', '--no-checkout', '--branch', 'main']));
    expect(args.slice(-3)).toEqual(['--', 'https://host/x.git', '/tmp/dest']);
    expect(gitEnv({})).toMatchObject({ GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '' });
  });

  it('reads skills from git objects and refuses a skill holding a symlink entry', () => {
    const source = openGitSource(repoUrl, 'test-repo', 'main', 'file');
    try {
      expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
      const { skills } = discoverSkills(source, '');
      expect(skills.map((s) => s.name)).toEqual(['demo', 'leaky']);
      expect(prepareSkill(source, skills[0]!).files.map((f) => f.path)).toEqual(['SKILL.md', 'references/guide.md']);
      const refused = failure(() => prepareSkill(source, skills[1]!));
      expect(refused.code).toBe('incompatible');
      expect(refused.extra.details).toMatchObject({ code: 'tree.unsupported_entry', path: 'leak' });
      expect(discoverSkills(source, 'skills/demo').skills.map((s) => s.name)).toEqual(['demo']);
      expect(failure(() => discoverSkills(source, 'skills/leaky/leak')).code).toBe('not_found');
    } finally {
      source.dispose();
    }
  });

  it('drops inherited variables that point git at another repository', () => {
    const env = gitEnv({ GIT_DIR: '/x/.git', git_work_tree: '/x', GIT_INDEX_FILE: 'i', GIT_COMMON_DIR: 'c', PATH: '/bin' });
    expect(env).not.toHaveProperty('GIT_DIR');
    expect(env).not.toHaveProperty('git_work_tree');
    expect(env).not.toHaveProperty('GIT_INDEX_FILE');
    expect(env).not.toHaveProperty('GIT_COMMON_DIR');
    expect(env.PATH).toBe('/bin');
  });

  it('reads the clone even when GIT_DIR names another repository', () => {
    const other = join(root, 'other');
    mkdirSync(join(other, 'skills', 'intruder'), { recursive: true });
    writeFileSync(join(other, 'skills', 'intruder', 'SKILL.md'), '---\nname: intruder\ndescription: Wrong repo\n---\n');
    git(other, ['init', '-q', '-b', 'main']);
    git(other, ['add', '-A']);
    git(other, ['commit', '-q', '-m', 'other']);
    const expected = git(join(root, 'repo'), ['rev-parse', 'HEAD']);
    const saved = process.env.GIT_DIR;
    process.env.GIT_DIR = join(other, '.git');
    try {
      const source = openGitSource(repoUrl, 'test-repo', 'main', 'file');
      try {
        expect(source.commit).toBe(expected);
        expect(discoverSkills(source, '').skills.map((s) => s.name)).toEqual(['demo', 'leaky']);
      } finally {
        source.dispose();
      }
    } finally {
      if (saved === undefined) delete process.env.GIT_DIR;
      else process.env.GIT_DIR = saved;
    }
  });

  it('lets git itself refuse every transport but https', () => {
    const refused = failure(() => openGitSource(repoUrl, 'test-repo'));
    expect(refused.code).toBe('usage_error');
    expect(refused.message).toContain('not allowed');
  });

  it('reports a missing branch as not found', () => {
    expect(failure(() => openGitSource(repoUrl, 'test-repo', 'no-such-branch', 'file')).code).toBe('not_found');
  });

  it('never prints the credentials of a failing clone', () => {
    const token = 'ghp_SECRETTOKEN123';
    const refused = failure(() => openGitSource(`https://user:${token}@127.0.0.1:9/x.git`, 'https://127.0.0.1:9/x.git'));
    expect(refused.code).toBe('network_error');
    expect(JSON.stringify({ m: refused.message, e: refused.extra })).not.toContain(token);
  }, 60_000);
});
