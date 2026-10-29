import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CliError } from '../output.js';
import { cloneArgs, openGitSource } from './git-source.js';
import { gitEnv, remoteOf, remoteRefNames } from './git-run.js';
import { openScratchDirs } from './scratch-dirs.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';

/**
 * Clones a local repository through the `file` transport, which only tests
 * may allow; the CLI always passes `https`. The repository holds a skill and
 * a skill with a symlink entry that points out of the repository.
 */

let root: string;
let repoUrl: string;
let partialUrl: string;

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
  // A second repository whose server allows partial clones, with a large blob outside the skills and a branch with a slash.
  const partial = join(root, 'partial');
  mkdirSync(partial);
  git(partial, ['init', '-q', '-b', 'main']);
  git(partial, ['config', 'uploadpack.allowFilter', 'true']);
  const writeIn = (rel: string, text: string) => {
    mkdirSync(dirname(join(partial, rel)), { recursive: true });
    writeFileSync(join(partial, rel), text);
  };
  writeIn('skills/demo/SKILL.md', '---\nname: demo\ndescription: Demo skill\n---\n');
  writeIn('skills/demo/notes.md', 'notes\n');
  writeIn('skills/huge/SKILL.md', `---\nname: huge\ndescription: Huge\n---\n${'x'.repeat(1024 * 1024)}`);
  writeIn('assets/big.bin', 'y'.repeat(3 * 1024 * 1024));
  git(partial, ['add', '-A']);
  git(partial, ['commit', '-q', '-m', 'skills']);
  git(partial, ['branch', 'feature/x']);
  partialUrl = pathToFileURL(partial).href;
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
    expect(args).toContain('--filter=blob:none');
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

  it('clones without blobs where the server allows it and fetches only what it reads', () => {
    const source = openGitSource(partialUrl, 'partial', undefined, 'file');
    try {
      const clone = join(openScratchDirs().at(-1)!, 'repo');
      const present = (rev: string) => {
        try {
          execFileSync('git', ['-C', clone, 'cat-file', '-e', rev], { env: { ...process.env, GIT_NO_LAZY_FETCH: '1' }, stdio: 'ignore' });
          return true;
        } catch {
          return false;
        }
      };
      expect(execFileSync('git', ['-C', clone, 'config', '--get', 'remote.origin.promisor'], { encoding: 'utf8' }).trim()).toBe('true');
      expect(execFileSync('git', ['-C', clone, 'config', '--get', 'remote.origin.url'], { encoding: 'utf8' }).trim()).toBe(partialUrl);
      const { skills, skipped } = discoverSkills(source, 'skills');
      expect(skills.map((s) => s.name)).toEqual(['demo']);
      expect(skipped).toEqual([{ dir: 'skills/huge', reason: 'SKILL.md is larger than 1048576 bytes' }]);
      expect(prepareSkill(source, skills[0]!).files.map((f) => f.path)).toEqual(['SKILL.md', 'notes.md']);
      // The over-size SKILL.md is sized, never read; the blob outside every skill is never fetched.
      expect(present('HEAD:skills/demo/notes.md')).toBe(true);
      expect(present('HEAD:assets/big.bin')).toBe(false);
    } finally {
      source.dispose();
    }
    expect(openScratchDirs()).toEqual([]);
  });

  it('finds which /tree/ segments name a branch on the remote', () => {
    const found = remoteRefNames(remoteOf(partialUrl), 'partial', ['feature/x/skills', 'feature/x', 'feature'], 'file');
    expect([...found]).toEqual(['feature/x']);
  });

  it('keeps URL credentials out of the clone URL and git config, as a header scoped to the origin', () => {
    const remote = remoteOf('https://user:pa%2Fss@git.example.com:8443/team/x.git');
    expect(remote.url).toBe('https://git.example.com:8443/team/x.git');
    expect(remote.config).toEqual([['http.https://git.example.com:8443/.extraHeader', `Authorization: Basic ${Buffer.from('user:pa/ss').toString('base64')}`]]);
    expect(remoteOf('https://host/x.git')).toEqual({ url: 'https://host/x.git', config: [] });
    // Entries already in the environment are kept; ours are appended after them.
    expect(gitEnv({ GIT_CONFIG_COUNT: '1', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_VALUE_0: 'c' }, remote.config)).toMatchObject({
      GIT_CONFIG_COUNT: '2', GIT_CONFIG_KEY_0: 'a.b', GIT_CONFIG_KEY_1: 'http.https://git.example.com:8443/.extraHeader',
    });
    expect(cloneArgs(remote.url, '/tmp/dest').join(' ')).not.toContain('pa');
  });

  it('removes the clone on dispose and drops its signal handlers', () => {
    const before = process.listenerCount('SIGINT');
    const source = openGitSource(repoUrl, 'test-repo', 'main', 'file');
    const [dir] = openScratchDirs();
    expect(process.listenerCount('SIGINT')).toBe(before + 1);
    source.dispose();
    expect(existsSync(dir!)).toBe(false);
    expect(process.listenerCount('SIGINT')).toBe(before);
  });
});
