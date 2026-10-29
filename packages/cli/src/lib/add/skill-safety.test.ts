import { linkSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CliError } from '../output.js';
import { openLocalSource } from './local-source.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';
import { readFrontmatter } from './skill-frontmatter.js';

const enc = (text: string) => new TextEncoder().encode(text);
const skillMd = (name: string, extra = '') => `---\nname: ${name}\ndescription: ${name} does things\n${extra}---\n# ${name}\n`;

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-add-safety-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function write(rel: string, text: string): string {
  const path = join(root, ...rel.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
  return path;
}

const fileLinksWork = (() => {
  const dir = mkdtempSync(join(tmpdir(), 'skillx-probe-'));
  try {
    writeFileSync(join(dir, 'a'), '');
    symlinkSync(join(dir, 'a'), join(dir, 'b'), 'file');
    return true;
  } catch {
    return false;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
})();

function refusedWith(run: () => unknown): CliError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error('expected a refusal');
}

describe('front matter is data, never code', () => {
  it.each(['---js', '---javascript', '---coffee'])('treats a %s fence as no front matter and runs nothing', (fence) => {
    const marker = '__skillx_frontmatter_ran__';
    const text = `${fence}\n(globalThis['${marker}'] = true, { name: 'evil', description: 'x' })\n---\n# body\n`;
    const result = readFrontmatter(enc(text));
    expect(result).toEqual({ ok: false, reason: expect.stringContaining('no front matter') });
    expect((globalThis as Record<string, unknown>)[marker]).toBeUndefined();
  });

  it('refuses YAML tags, duplicate keys and non-mappings', () => {
    expect(readFrontmatter(enc(skillMd('demo', 'x: !!js/function "function () {}"\n'))).ok).toBe(false);
    expect(readFrontmatter(enc('---\nname: !!str demo\ndescription: d\n---\n')).ok).toBe(false);
    expect(readFrontmatter(enc('---\nname: a\nname: b\ndescription: d\n---\n')).ok).toBe(false);
    expect(readFrontmatter(enc('---\n- a\n---\n')).ok).toBe(false);
  });

  it('refuses alias abuse as a skipped skill instead of aborting discovery', () => {
    const laughs = 'a: &a [x, x, x, x, x, x, x, x, x]\nb: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a]\nc: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b]\nd: [*c, *c, *c, *c, *c, *c, *c, *c, *c]\n';
    expect(readFrontmatter(enc(skillMd('bomb', laughs)))).toEqual({ ok: false, reason: 'SKILL.md front matter uses too many aliases' });
    write('skills/bomb/SKILL.md', skillMd('bomb', laughs));
    write('skills/fine/SKILL.md', skillMd('fine'));
    const { skills, skipped } = discoverSkills(openLocalSource(root), '');
    expect(skills.map((s) => s.name)).toEqual(['fine']);
    expect(skipped).toEqual([{ dir: 'skills/bomb', reason: 'SKILL.md front matter uses too many aliases' }]);
  });

  it('accepts plain front matter with a BOM and CRLF', () => {
    expect(readFrontmatter(enc('﻿---\r\nname: demo\r\ndescription: Does a thing\r\n---\r\n'))).toEqual({ ok: true, name: 'demo', description: 'Does a thing' });
  });

  it.each(['ak-plan', 'AK-plan', 'ak:plan'])('refuses the AgentKit-reserved name %s', (name) => {
    expect(readFrontmatter(enc(skillMd(name)))).toEqual({ ok: false, reason: expect.stringContaining('reserved') });
  });

  it.each(['Foo Bar', 'con', 'trailing.', '../up', 'a/b'])('refuses %s as a directory name instead of rewriting it', (name) => {
    expect(readFrontmatter(enc(skillMd(JSON.stringify(name)))).ok).toBe(false);
  });
});

describe('discovery', () => {
  it('takes the search root alone when it is a skill', () => {
    write('SKILL.md', skillMd('root-skill'));
    write('skills/inner/SKILL.md', skillMd('inner'));
    const { skills } = discoverSkills(openLocalSource(root), '');
    expect(skills.map((s) => s.name)).toEqual(['root-skill']);
  });

  it('finds nested skills, skips node_modules and noise, and reports refused ones', () => {
    write('skills/a/SKILL.md', skillMd('a'));
    write('skills/a/examples/sub/SKILL.md', skillMd('a-example'));
    write('skills/b/SKILL.md', skillMd('ak-b'));
    write('node_modules/pkg/SKILL.md', skillMd('vendored'));
    write('.git/x/SKILL.md', skillMd('git-internal'));
    const { skills, skipped } = discoverSkills(openLocalSource(root), '');
    expect(skills.map((s) => [s.name, s.dir])).toEqual([['a', 'skills/a']]);
    expect(skipped).toEqual([{ dir: 'skills/b', reason: expect.stringContaining('reserved') }]);
  });

  it('never enters a linked directory', () => {
    const outside = mkdtempSync(join(tmpdir(), 'skillx-outside-'));
    try {
      write('skills/real/SKILL.md', skillMd('real'));
      mkdirSync(join(outside, 'secret'), { recursive: true });
      writeFileSync(join(outside, 'secret', 'SKILL.md'), skillMd('secret'));
      symlinkSync(join(outside, 'secret'), join(root, 'skills', 'linked'), 'junction');
      const { skills } = discoverSkills(openLocalSource(root), '');
      expect(skills.map((s) => s.name)).toEqual(['real']);
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });
});

describe('a chosen skill is refused, never copied, when it holds links', () => {
  const found = { name: 'leaky', description: 'd', dir: 'leaky' };

  it('refuses a junction inside the skill', () => {
    write('leaky/SKILL.md', skillMd('leaky'));
    mkdirSync(join(root, 'secret'));
    writeFileSync(join(root, 'secret', 'id_rsa'), 'PRIVATE');
    symlinkSync(join(root, 'secret'), join(root, 'leaky', 'dirleak'), 'junction');
    const error = refusedWith(() => prepareSkill(openLocalSource(root), found));
    expect(error.code).toBe('incompatible');
    expect(error.extra.details).toMatchObject({ code: 'tree.unsupported_entry', path: 'dirleak' });
  });

  it.skipIf(!fileLinksWork)('refuses a file symlink inside the skill', () => {
    write('leaky/SKILL.md', skillMd('leaky'));
    const secret = write('secret.txt', 'PRIVATE');
    symlinkSync(secret, join(root, 'leaky', 'leak'), 'file');
    expect(refusedWith(() => prepareSkill(openLocalSource(root), found)).extra.details).toMatchObject({ code: 'tree.unsupported_entry', path: 'leak' });
  });

  it('refuses a hardlink inside the skill', () => {
    write('leaky/SKILL.md', skillMd('leaky'));
    const secret = write('secret.txt', 'PRIVATE');
    linkSync(secret, join(root, 'leaky', 'hard'));
    expect(refusedWith(() => prepareSkill(openLocalSource(root), found)).extra.details).toMatchObject({ code: 'tree.unsupported_entry', path: 'hard' });
  });

  it('builds a tree of regular files only, leaving out noise', () => {
    write('leaky/SKILL.md', skillMd('leaky'));
    write('leaky/references/guide.md', 'guide\n');
    write('leaky/.git/config', '[remote "origin"]\n\turl = https://token@host/x\n');
    const tree = prepareSkill(openLocalSource(root), found);
    expect(tree.files.map((f) => f.path)).toEqual(['SKILL.md', 'references/guide.md']);
    expect(tree.digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('refuses a missing search path as not found', () => {
    write('a/SKILL.md', skillMd('a'));
    expect(refusedWith(() => discoverSkills(openLocalSource(root), 'nope')).code).toBe('not_found');
  });

  it('refuses a local source that is not a directory', () => {
    const file = write('file.txt', 'x');
    expect(refusedWith(() => openLocalSource(file)).code).toBe('usage_error');
  });
});
