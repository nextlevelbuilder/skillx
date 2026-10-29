import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CliError } from '../output.js';
import { isCommitRef, parseAddSource, redactCredentials } from './add-source.js';
import { redactError } from '../../commands/add.js';

const refusal = (input: string) => {
  try {
    parseAddSource(input);
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error(`expected '${input}' to be refused`);
};

describe('parseAddSource', () => {
  it('reads github: sources with a path and a ref', () => {
    expect(parseAddSource('github:acme/skills')).toMatchObject({ kind: 'github', owner: 'acme', repo: 'skills', path: '', cloneUrl: 'https://github.com/acme/skills.git', label: 'github:acme/skills' });
    expect(parseAddSource('github:acme/skills/tools/lint@v1.2')).toMatchObject({ path: 'tools/lint', ref: 'v1.2', label: 'github:acme/skills/tools/lint@v1.2' });
    expect(parseAddSource('github:acme/skills@release/2026')).toMatchObject({ path: '', ref: 'release/2026' });
  });

  it('takes a full commit id as a ref, lowercased, in github: and /tree/ URLs', () => {
    const sha = 'AB'.repeat(20);
    expect(parseAddSource(`github:acme/skills/pdf@${sha}`)).toMatchObject({ ref: sha.toLowerCase(), label: `github:acme/skills/pdf@${sha.toLowerCase()}` });
    expect(parseAddSource(`https://github.com/acme/skills/tree/${'c'.repeat(64)}/skills/pdf`)).toMatchObject({ ref: 'c'.repeat(64), path: 'skills/pdf' });
    expect(isCommitRef('c'.repeat(40))).toBe(true);
    expect(isCommitRef('abc1234')).toBe(false);
    expect(() => parseAddSource('github:acme/skills@HEAD~1')).toThrow(/not a branch, tag or full commit id/);
  });

  it('reads the owner/repo[/skill] shorthand as a GitHub source with a skill name', () => {
    expect(parseAddSource('acme/skills')).toMatchObject({ kind: 'github', owner: 'acme', repo: 'skills', path: '' });
    expect(parseAddSource('acme/skills/pdf')).toMatchObject({ kind: 'github', skill: 'pdf', path: '' });
  });

  it('maps github.com web URLs to github: and keeps other https URLs as git sources', () => {
    expect(parseAddSource('https://github.com/acme/skills.git')).toMatchObject({ kind: 'github', owner: 'acme', repo: 'skills', path: '' });
    expect(parseAddSource('https://github.com/acme/skills/tree/main/skills/pdf')).toMatchObject({ kind: 'github', ref: 'main', path: 'skills/pdf' });
    expect(parseAddSource('https://git.example.com/team/skills.git')).toEqual({ kind: 'git', cloneUrl: 'https://git.example.com/team/skills.git', label: 'https://git.example.com/team/skills.git' });
  });

  it('reads local directories relative to the working directory', () => {
    const cwd = resolve('/work/project');
    expect(parseAddSource('./skills', cwd)).toEqual({ kind: 'local', dir: resolve(cwd, 'skills'), label: resolve(cwd, 'skills') });
    expect(parseAddSource('..', cwd)).toMatchObject({ kind: 'local', dir: resolve(cwd, '..') });
    expect(parseAddSource(resolve('/abs/skills'), cwd)).toMatchObject({ kind: 'local', dir: resolve('/abs/skills') });
  });

  it.each([
    ['ext::sh -c touch% /tmp/pwned', 'transport helpers'],
    ['fd::17', 'transport helpers'],
    ['file:///etc/passwd', 'only https'],
    ['http://git.example.com/x.git', 'only https'],
    ['ssh://git@github.com/acme/skills.git', 'only https'],
    ['git@github.com:acme/skills.git', 'scp-style'],
    ['--upload-pack=touch /tmp/pwned', 'option'],
    ['-u touch /tmp/pwned', 'option'],
    ['https://git.example.com/x.git?private_token=abc', 'no query'],
  ])('refuses %s as a usage error', (input, why) => {
    const error = refusal(input);
    expect(error.code).toBe('usage_error');
    expect(error.message).toContain(why);
  });

  it.each(['github:acme/skills/../../etc', 'github:acme/skills/a/./b', 'github:acme/skills/a\\b', 'github:acme/..', 'https://github.com/acme/skills/tree/main/..%2F..'])(
    'refuses the traversal or unsafe path in %s',
    (input) => {
      expect(refusal(input).code).toBe('usage_error');
    },
  );

  it.each(['github:acme/skills@-oops', 'github:acme/skills@a..b', 'github:acme/skills@x@{1}', 'github:acme/skills@main.lock'])('refuses the ref in %s', (input) => {
    expect(refusal(input).code).toBe('usage_error');
  });

  it('sends registry sources to skillx install and refuses @agentkit', () => {
    expect(refusal('@agentkit/plan').message).toContain('reserved');
    expect(refusal('@acme/pdf').message).toContain('skillx install');
    expect(refusal('kit:@acme/core').message).toContain('skillx install');
  });
});

describe('credentials in URLs', () => {
  const token = 'ghp_SECRETTOKEN123';

  it('clones with the credentials but never puts them in the label', () => {
    const source = parseAddSource(`https://${token}@git.example.com/team/skills.git`);
    expect(source).toMatchObject({ kind: 'git', cloneUrl: `https://${token}@git.example.com/team/skills.git`, label: 'https://git.example.com/team/skills.git' });
    // github.com with credentials stays a plain git source, so the token is never dropped silently either.
    const gh = parseAddSource(`https://user:${token}@github.com/acme/private.git`);
    expect(gh.kind).toBe('git');
    expect(gh.label).not.toContain(token);
  });

  it('redacts userinfo anywhere in a text, also inside JSON', () => {
    expect(redactCredentials(`fatal: could not read from https://user:${token}@host/x.git and http://${token}@h`)).toBe('fatal: could not read from https://***@host/x.git and http://***@h');
    const json = JSON.stringify({ hint: `https://a:${token}@h/x`, other: 'mail me@example.com' });
    expect(JSON.parse(redactCredentials(json))).toEqual({ hint: 'https://***@h/x', other: 'mail me@example.com' });
    expect(redactCredentials('https://github.com/acme/skills')).toBe('https://github.com/acme/skills');
  });

  it('never echoes a token in a refusal', () => {
    for (const input of [`http://${token}@host/x.git`, `https://${token}@host/x.git#main`, `ssh://${token}@host/x`]) {
      expect(refusal(input).message).not.toContain(token);
    }
  });

  it('redactError masks message, hint and details of any failure', () => {
    const error = new CliError('network_error', `cannot clone https://u:${token}@h/x`, { hint: `retry https://${token}@h`, details: { url: `https://${token}@h/x` } });
    const out = redactError(error) as CliError;
    expect(JSON.stringify({ m: out.message, e: out.extra })).not.toContain(token);
    expect(out.code).toBe('network_error');
    expect((redactError(new Error(`boom https://${token}@h`)) as Error).message).toBe('boom https://***@h');
  });
});
