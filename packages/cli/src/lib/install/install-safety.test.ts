import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION, isInstallAlias } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import { sha256Hex } from './fetch-verify.js';
import { RECEIPT_SCHEMA, readReceipt, writeReceipt } from './install-state.js';
import type { InstallReceipt } from './install-state.js';
import { assertLockScope, dropFromLockFile, mergeLock, writeLockFile } from './lock-file.js';
import { planInstall } from './planner.js';
import { assertSecureRegistry } from './registry-client.js';
import { removeOwned } from './remove-owned.js';
import { containedPath, renameWithRetry } from './safe-fs.js';
import { memberDrift } from './sync-locked.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-safety-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const D = (c: string) => `sha256:${c.repeat(64)}`;
const pkg = (name: string, version = '1.0.0') => ({ alias: name, package: `@alpha/${name}`, version, releaseDigest: D('a'), compositionDigest: D('a'), overlayDigests: [] });
const lock = (packages = [pkg('demo')], source: InstallLock['source'] = { kind: 'packages' }): InstallLock => ({ schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, source, runtimes: {}, packages });

function write(path: string, text: string): string {
  mkdirSync(join(path, '..'), { recursive: true });
  writeFileSync(path, text);
  return sha256Hex(new TextEncoder().encode(text));
}
function receipt(alias: string, files: Record<string, string>): InstallReceipt {
  return {
    schema: RECEIPT_SCHEMA, runtime: 'claude-code', alias, package: `@alpha/${alias}`, version: '1.0.0', releaseDigest: D('a'), compositionDigest: D('a'), overlayDigests: [],
    files: Object.entries(files).map(([path, sha256]) => ({ path, sha256, mode: '100644' as const })), requiredBy: ['packages:@alpha/demo'], installedAt: '2026-10-19T00:00:00.000Z',
  };
}
/** Junctions need no privilege on Windows; elsewhere the type is ignored and a symlink is made. */
const link = (target: string, path: string) => symlinkSync(target, path, 'junction');
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

describe('uninstall never follows links', () => {
  it('keeps files reached through a linked subdirectory', () => {
    const home = join(root, '.skillx');
    const skill = join(root, 'skills', 'demo');
    const shaSkill = write(join(skill, 'SKILL.md'), '# demo\n');
    const shaGuide = write(join(root, 'outside', 'guide.md'), 'guide\n');
    link(join(root, 'outside'), join(skill, 'references'));
    const r = receipt('demo', { 'SKILL.md': shaSkill, 'references/guide.md': shaGuide });
    writeReceipt(home, r);

    const result = removeOwned(home, 'claude-code', join(root, 'skills'), r);
    expect(result).toMatchObject({ removed: ['SKILL.md'], keptModified: ['references/guide.md'], keptUnknown: ['references'] });
    expect(readFileSync(join(root, 'outside', 'guide.md'), 'utf8')).toBe('guide\n');
    expect(readReceipt(home, 'claude-code', 'demo')).toBeNull();
  });

  it('leaves a linked skill directory and everything behind it alone', () => {
    const home = join(root, '.skillx');
    const sha = write(join(root, 'elsewhere', 'SKILL.md'), '# demo\n');
    mkdirSync(join(root, 'skills'), { recursive: true });
    link(join(root, 'elsewhere'), join(root, 'skills', 'demo'));
    const result = removeOwned(home, 'claude-code', join(root, 'skills'), receipt('demo', { 'SKILL.md': sha }));
    expect(result).toMatchObject({ removed: [], keptUnknown: ['.'] });
    expect(existsSync(join(root, 'elsewhere', 'SKILL.md'))).toBe(true);
  });

  it.skipIf(!fileLinksWork)('keeps a file symlink even when its target matches the receipt', () => {
    const sha = write(join(root, 'outside.md'), '# demo\n');
    mkdirSync(join(root, 'skills', 'demo'), { recursive: true });
    symlinkSync(join(root, 'outside.md'), join(root, 'skills', 'demo', 'SKILL.md'), 'file');
    const result = removeOwned(join(root, '.skillx'), 'claude-code', join(root, 'skills'), receipt('demo', { 'SKILL.md': sha }));
    expect(result.keptModified).toEqual(['SKILL.md']);
    expect(existsSync(join(root, 'outside.md'))).toBe(true);
  });

  it('plans a conflict for a linked skill directory, even with --force and a receipt', () => {
    mkdirSync(join(root, 'elsewhere'));
    mkdirSync(join(root, 'skills'));
    link(join(root, 'elsewhere'), join(root, 'skills', 'demo'));
    const home = join(root, '.skillx');
    writeReceipt(home, receipt('demo', {}));
    for (const force of [false, true]) {
      const plan = planInstall({ home, runtime: 'claude-code', skillsDir: join(root, 'skills'), owner: 'packages:@alpha/demo', packages: [pkg('demo', '2.0.0')], owners: { schema: 'skillx.install-owners/v1', owners: {} }, force });
      expect(plan.actions).toEqual([expect.objectContaining({ action: 'conflict', reason: 'unowned_directory', files: ['.'] })]);
    }
  });
});

describe('path and name guards', () => {
  it('refuses traversal, absolute and drive paths', () => {
    for (const bad of ['../../evil.txt', 'a/../../b', '/etc/passwd', 'C:/x', 'a\\..\\b', 'a//b', '.', '']) expect(() => containedPath(root, bad)).toThrow(/unsafe path/);
    expect(containedPath(root, 'references/guide.md')).toBe(join(root, 'references', 'guide.md'));
  });

  it('rejects aliases ending in a dot and Windows device names', () => {
    for (const bad of ['demo.', 'con', 'nul', 'com1', 'lpt9', 'aux.md', 'Demo']) expect(isInstallAlias(bad)).toBe(false);
    for (const good of ['demo', 'my.skill', 'console', 'com10', 'a']) expect(isInstallAlias(good)).toBe(true);
  });

  it('allows https anywhere and plain http only to this machine', () => {
    for (const ok of ['https://skillx.sh', 'http://localhost:5173', 'http://127.0.0.1:8787', 'http://[::1]:5173', 'http://app.localhost']) expect(() => assertSecureRegistry(ok)).not.toThrow();
    for (const bad of ['http://skillx.sh', 'http://10.0.0.5', 'ftp://skillx.sh', 'nope']) expect(() => assertSecureRegistry(bad)).toThrow();
  });

  it('retries a busy rename, then gives up with the last error', () => {
    let calls = 0;
    const busy = Object.assign(new Error('busy'), { code: 'EBUSY' });
    renameWithRetry('a', 'b', { rename: () => { calls += 1; if (calls < 3) throw busy; } });
    expect(calls).toBe(3);
    expect(() => renameWithRetry('a', 'b', { rename: () => { throw busy; } })).toThrow('busy');
  });
});

describe('collection lock drift', () => {
  it('requires exactly the members, at their pinned version or digest', () => {
    const l = lock([pkg('demo', '1.0.0'), pkg('tools', '1.1.0')]);
    expect(memberDrift([{ packageName: '@alpha/demo', version: '1.0.0' }, { packageName: '@alpha/tools' }], l)).toEqual([]);
    expect(memberDrift([{ packageName: '@alpha/demo', version: '1.0.1' }, { packageName: '@alpha/tools' }], l)).toEqual(['@alpha/demo: member pins 1.0.1, lock has 1.0.0']);
    expect(memberDrift([{ packageName: '@alpha/demo', digest: D('b') }], l)).toEqual(['@alpha/demo: member pins another release digest', '@alpha/tools: locked but not a member']);
    expect(memberDrift([{ packageName: '@alpha/demo' }, { packageName: '@alpha/tools' }, { packageName: '@alpha/new' }], l)).toEqual(['@alpha/new: member not locked']);
  });
});

describe('lock file scope', () => {
  it('merges packages, refuses another scope, and drops uninstalled packages', () => {
    const path = join(root, 'skillx.lock.json');
    writeLockFile(path, lock([pkg('demo')]));
    const merged = mergeLock(lock([pkg('demo')]), lock([pkg('tools'), pkg('demo', '1.1.0')]));
    expect(merged.packages.map((p) => `${p.alias}@${p.version}`)).toEqual(['demo@1.1.0', 'tools@1.0.0']);
    writeLockFile(path, merged);
    expect(() => assertLockScope(path, 'kit:@alpha/my-kit')).toThrow(/locks packages/);
    expect(() => assertLockScope(path, 'packages')).not.toThrow();
    dropFromLockFile(path, '@alpha/demo');
    expect(JSON.parse(readFileSync(path, 'utf8')).packages.map((p: { alias: string }) => p.alias)).toEqual(['tools']);
  });
});
