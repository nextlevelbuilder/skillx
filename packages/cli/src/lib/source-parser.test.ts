import { describe, it, expect } from 'vitest';
import { parseSource, getOwnerRepo, parseOwnerRepo, isSubpathSafe } from './source-parser.js';

describe('parseSource', () => {
  it('parses GitHub shorthand: owner/repo', () => {
    const result = parseSource('vercel-labs/agent-skills');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/vercel-labs/agent-skills.git');
    expect(result.subpath).toBeUndefined();
  });

  it('parses GitHub shorthand with subpath: owner/repo/path', () => {
    const result = parseSource('vercel-labs/agent-skills/skills/pr-review');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/vercel-labs/agent-skills.git');
    expect(result.subpath).toBe('skills/pr-review');
  });

  it('parses GitHub shorthand with @skill filter', () => {
    const result = parseSource('vercel-labs/agent-skills@find-skills');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/vercel-labs/agent-skills.git');
    expect(result.skillFilter).toBe('find-skills');
  });

  it('parses GitHub URL: https://github.com/owner/repo', () => {
    const result = parseSource('https://github.com/vercel-labs/agent-skills');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/vercel-labs/agent-skills.git');
  });

  it('parses GitHub URL with tree/branch/path', () => {
    const result = parseSource('https://github.com/owner/repo/tree/main/skills/web');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
    expect(result.ref).toBe('main');
    expect(result.subpath).toBe('skills/web');
  });

  it('parses GitHub URL with tree/branch only', () => {
    const result = parseSource('https://github.com/owner/repo/tree/develop');
    expect(result.type).toBe('github');
    expect(result.ref).toBe('develop');
  });

  it('parses GitLab URL', () => {
    const result = parseSource('https://gitlab.com/myorg/myrepo');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/myorg/myrepo.git');
  });

  it('parses local absolute path', () => {
    const result = parseSource('/home/user/my-skills');
    expect(result.type).toBe('local');
    expect(result.localPath).toBeTruthy();
  });

  it('parses local relative path ./', () => {
    const result = parseSource('./my-skills');
    expect(result.type).toBe('local');
    expect(result.localPath).toBeTruthy();
  });

  it('parses github: prefix shorthand', () => {
    const result = parseSource('github:owner/repo');
    expect(result.type).toBe('github');
    expect(result.url).toBe('https://github.com/owner/repo.git');
  });

  it('parses gitlab: prefix shorthand', () => {
    const result = parseSource('gitlab:myorg/myrepo');
    expect(result.type).toBe('gitlab');
    expect(result.url).toBe('https://gitlab.com/myorg/myrepo.git');
  });

  it('falls back to git type for unknown URLs', () => {
    const result = parseSource('git@custom-host.com:org/repo.git');
    expect(result.type).toBe('git');
  });

  it('rejects path traversal in subpath', () => {
    expect(() => parseSource('owner/repo/../../../etc/passwd')).toThrow('Unsafe subpath');
  });
});

describe('getOwnerRepo', () => {
  it('extracts owner/repo from github parsed source', () => {
    const parsed = parseSource('vercel-labs/agent-skills');
    expect(getOwnerRepo(parsed)).toBe('vercel-labs/agent-skills');
  });

  it('returns null for local sources', () => {
    const parsed = parseSource('./local-path');
    expect(getOwnerRepo(parsed)).toBeNull();
  });
});

describe('parseOwnerRepo', () => {
  it('parses valid owner/repo', () => {
    expect(parseOwnerRepo('vercel/next.js')).toEqual({ owner: 'vercel', repo: 'next.js' });
  });

  it('returns null for invalid format', () => {
    expect(parseOwnerRepo('just-a-name')).toBeNull();
    expect(parseOwnerRepo('a/b/c')).toBeNull();
  });
});

describe('isSubpathSafe', () => {
  it('returns true for valid subpath', () => {
    expect(isSubpathSafe('/base', 'skills/web')).toBe(true);
  });

  it('returns false for path traversal', () => {
    expect(isSubpathSafe('/base', '../../etc')).toBe(false);
  });
});
