import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { readTarTree } from '@skillx/skill-tree';
import { packRelease } from '../commands/release-pack.js';
import { httpsRepoUrl } from '../commands/release-publish.js';
import { writeDeterministicTar } from './deterministic-tar.js';

/**
 * Determinism of `skillx release pack`: a 94-file skill (the multi-file case
 * of issue #21) packs to one releaseDigest and byte-identical tar twice, from
 * a fresh clone, and under a simulated CI environment (other umask, CRLF
 * conversion, no file-mode tracking, touched mtimes, dirty working tree).
 */
const GIT_ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: 'Test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'Test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
  GIT_AUTHOR_DATE: '2026-10-13T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-10-13T00:00:00Z',
};

const git = (cwd: string, ...args: string[]) =>
  execFileSync('git', ['-c', 'core.autocrlf=false', '-c', 'commit.gpgsign=false', ...args], { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

let root: string;
let repo: string;
const SKILL_DIR = 'skills/big-skill';

function write(path: string, content: string | Uint8Array) {
  const full = join(repo, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, content);
}

/** 94 files: nested docs, CRLF text, binary, unicode and >100-byte paths, an executable script. */
function writeFixture() {
  write(`${SKILL_DIR}/SKILL.md`, '---\nname: big-skill\ndescription: Many files\n---\n# Big\n');
  write(`${SKILL_DIR}/scripts/run.sh`, '#!/bin/sh\necho run\n');
  write(`${SKILL_DIR}/notes/crlf.txt`, 'line one\r\nline two\r\n');
  write(`${SKILL_DIR}/assets/blob.bin`, new Uint8Array(Array.from({ length: 4096 }, (_, i) => (i * 31) % 256)));
  write(`${SKILL_DIR}/docs/café-résumé.md`, 'unicode name\n');
  write(`${SKILL_DIR}/${'deep/'.repeat(24)}long-file-name.md`, 'long path\n');
  for (let i = 0; i < 88; i++) write(`${SKILL_DIR}/references/ref-${String(i).padStart(2, '0')}.md`, `# Ref ${i}\n${'x'.repeat(i * 7)}\n`);
  write(`${SKILL_DIR}/.DS_Store`, 'noise');
  write('README.md', 'outside the package\n');
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-pack-'));
  repo = join(root, 'repo');
  mkdirSync(repo);
  git(repo, 'init', '-q');
  writeFixture();
  git(repo, 'add', '-A');
  git(repo, 'update-index', '--chmod=+x', `${SKILL_DIR}/scripts/run.sh`);
  git(repo, 'commit', '-q', '-m', 'fixture');
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('release pack determinism', () => {
  it('packs the 94-file skill twice to one digest and identical bytes', async () => {
    const a = await packRelease(join(repo, SKILL_DIR));
    const b = await packRelease(join(repo, SKILL_DIR));
    expect(a.fileCount).toBe(94);
    expect(a.source.excludedNoise).toEqual(['.DS_Store']);
    expect(a.releaseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(b.releaseDigest).toBe(a.releaseDigest);
    expect(Buffer.from(b.tar).equals(Buffer.from(a.tar))).toBe(true);
    const tree = await readTarTree(a.tar);
    expect(tree.files.find((f) => f.path === 'scripts/run.sh')?.mode).toBe('100755');
    expect(tree.files.find((f) => f.path === 'notes/crlf.txt')?.size).toBe(20);
  });

  it('packs a git ref with --path to the same digest as the directory form', async () => {
    const fromDir = await packRelease(join(repo, SKILL_DIR));
    const fromRef = await packRelease('HEAD', { packagePath: SKILL_DIR, cwd: repo });
    expect(fromRef.releaseDigest).toBe(fromDir.releaseDigest);
    expect(fromRef.commit).toBe(fromDir.commit);
    expect(fromRef.path).toBe(SKILL_DIR);
  });

  it('gives the same digest from a fresh clone under a CI-like environment', async () => {
    const local = await packRelease(join(repo, SKILL_DIR));
    const clone = join(root, 'ci-clone');
    const previousUmask = process.umask(0o077);
    try {
      execFileSync('git', ['-c', 'core.autocrlf=true', 'clone', '-q', '--no-local', repo, clone], { env: GIT_ENV });
      git(clone, 'config', 'core.fileMode', 'false');
      git(clone, 'config', 'core.autocrlf', 'true');
      // Working-tree noise a CI checkout may have: touched mtimes, lost exec bit, local edits.
      utimesSync(join(clone, SKILL_DIR, 'SKILL.md'), new Date(0), new Date(0));
      chmodSync(join(clone, SKILL_DIR, 'scripts/run.sh'), 0o600);
      writeFileSync(join(clone, SKILL_DIR, 'references/ref-00.md'), 'uncommitted edit\n');
      const ci = await packRelease(join(clone, SKILL_DIR));
      expect(ci.releaseDigest).toBe(local.releaseDigest);
      expect(Buffer.from(ci.tar).equals(Buffer.from(local.tar))).toBe(true);
      expect(ci.source.uncommitted.length).toBeGreaterThan(0);
    } finally {
      process.umask(previousUmask);
    }
  });

  it('rejects symlinks and missing package paths', async () => {
    const linked = join(root, 'linked');
    mkdirSync(linked);
    git(linked, 'init', '-q');
    writeFileSync(join(linked, 'SKILL.md'), '# x\n');
    // A symlink blob (mode 120000) recorded directly in the index works on every OS.
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: linked, input: 'SKILL.md' }).toString().trim();
    git(linked, 'update-index', '--add', '--cacheinfo', `120000,${blob},link.md`);
    git(linked, 'add', 'SKILL.md');
    git(linked, 'commit', '-q', '-m', 'link');
    await expect(packRelease(linked)).rejects.toThrow(/symlink/);
    await expect(packRelease('HEAD', { packagePath: 'nope', cwd: repo })).rejects.toThrow(/no files/);
    await expect(packRelease('--upload-pack=x', { cwd: repo })).rejects.toThrow(/invalid git ref/);
  });
});

describe('deterministic tar', () => {
  it('sorts by UTF-8 bytes and is independent of input order', () => {
    const enc = new TextEncoder();
    const files = [
      { path: 'b.md', mode: '100644' as const, bytes: enc.encode('b') },
      { path: 'a.md', mode: '100755' as const, bytes: enc.encode('a') },
    ];
    expect(writeDeterministicTar(files)).toEqual(writeDeterministicTar([...files].reverse()));
    expect(() => writeDeterministicTar([files[0]!, files[0]!])).toThrow(/duplicate/);
  });
});

describe('provenance URL', () => {
  it.each([
    ['https://github.com/o/r.git', 'https://github.com/o/r'],
    ['git@github.com:o/r.git', 'https://github.com/o/r'],
    ['https://user:token@github.com/o/r', 'https://github.com/o/r'],
    ['http://github.com/o/r', null],
  ])('%s -> %s', (remote, expected) => {
    expect(httpsRepoUrl(remote)).toBe(expected);
  });
});
