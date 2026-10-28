import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION } from '@skillx/contracts';
import type { InstallLock } from '@skillx/contracts';
import { claudeCodeAdapter, codexAdapter, getAdapter, skillxHome, stagingDir } from './adapters.js';
import { writeLockFile } from './lock-file.js';
import { planInstall } from './planner.js';
import { newestVersion } from './release-pins.js';
import { parseRefs, resolveSource } from './resolver.js';
import type { Registry } from './registry-client.js';
import { loadTrustedKeys } from './trusted-keys.js';

let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-units-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const D = (c: string) => `sha256:${c.repeat(64)}`;
const lock = (extra: Partial<InstallLock> = {}): InstallLock => ({
  schema: INSTALL_LOCK_SCHEMA,
  resolver: INSTALL_RESOLVER_VERSION,
  source: { kind: 'packages' },
  runtimes: {},
  packages: [{ alias: 'demo', package: '@alpha/demo', version: '1.0.0', releaseDigest: D('a'), compositionDigest: D('a'), overlayDigests: [] }],
  ...extra,
});

describe('adapters', () => {
  it('derive every location from the given environment', () => {
    const env = { HOME: root, USERPROFILE: root };
    expect(claudeCodeAdapter.skillsDir(env)).toBe(join(root, '.claude', 'skills'));
    expect(codexAdapter.skillsDir(env)).toBe(join(root, '.codex', 'skills'));
    expect(codexAdapter.skillsDir({ ...env, CODEX_HOME: join(root, 'cx') })).toBe(join(root, 'cx', 'skills'));
    expect(claudeCodeAdapter.skillsDir({ ...env, CLAUDE_CONFIG_DIR: join(root, 'cc') })).toBe(join(root, 'cc', 'skills'));
    expect(skillxHome(env)).toBe(join(root, '.skillx'));
    expect(skillxHome({ ...env, SKILLX_HOME: join(root, 'sx') })).toBe(join(root, 'sx'));
    expect(stagingDir(codexAdapter, env)).toBe(join(root, '.codex', '.skillx-staging'));
    expect(() => getAdapter('cursor')).toThrow(/unknown runtime/);
  });
});

describe('refs and versions', () => {
  it('parses kit, collection and package refs', () => {
    const rev = 'rev_00000000-0000-4000-8000-000000000000';
    const col = 'col_00000000-0000-4000-8000-000000000000';
    expect(parseRefs([`kit:@alpha/my-kit#${rev}`])).toEqual({ kind: 'kit', kit: '@alpha/my-kit', revisionId: rev });
    expect(parseRefs([`collection:${col}#3`])).toEqual({ kind: 'collection', id: col, revision: 3 });
    expect(parseRefs([`collection:${col}`])).toEqual({ kind: 'collection', id: col, revision: 'latest' });
    expect(parseRefs(['@alpha/demo@1.2.0', '@alpha/tools'])).toEqual({ kind: 'packages', packages: [{ name: '@alpha/demo', version: '1.2.0' }, { name: '@alpha/tools' }] });
    expect(parseRefs([`@alpha/demo@1.2.0#${D('a')}`])).toEqual({ kind: 'packages', packages: [{ name: '@alpha/demo', version: '1.2.0', digest: D('a') }] });
    expect(() => parseRefs(['@alpha/demo@1.2.0#sha256:abc'])).toThrow(/is not/);
    expect(() => parseRefs(['demo'])).toThrow(/is not/);
    expect(() => parseRefs([`kit:@alpha/my-kit`, '@alpha/demo'])).toThrow(/one kit/);
  });

  it('prefers the newest stable version', () => {
    expect(newestVersion(['1.2.0', '1.10.0', '2.0.0-beta.1'])).toBe('1.10.0');
    expect(newestVersion(['2.0.0-beta.1', '2.0.0-alpha.3'])).toBe('2.0.0-beta.1');
    expect(newestVersion([])).toBeNull();
  });
});

describe('collection resolve', () => {
  const col = 'col_00000000-0000-4000-8000-000000000000';
  const registryWith = (revisionDigest: string | null) =>
    ({ collectionRevision: async () => ({ collectionId: col, revisionNumber: 2, members: [], config: {}, revisionDigest }) }) as unknown as Registry;

  it('warns that the view may be partial when the registry sends no digest', async () => {
    const res = await resolveSource(registryWith(null), { kind: 'collection', id: col, revision: 'latest' });
    expect(res.warnings).toHaveLength(1);
    expect(res.warnings[0]).toMatch(/no digest.*partial/);
  });

  it('stays quiet when the digest matches', async () => {
    const probe = await resolveSource(registryWith(null), { kind: 'collection', id: col, revision: 'latest' });
    const digest = (probe.lock.source as { revisionDigest: string }).revisionDigest;
    const res = await resolveSource(registryWith(digest), { kind: 'collection', id: col, revision: 'latest' });
    expect(res.warnings).toEqual([]);
  });
});

describe('digest pins', () => {
  const registry = { releases: async () => [{ version: '1.2.0', state: 'published', releaseDigest: D('b') }] } as unknown as Registry;

  it('refuses a release whose digest differs from the pinned one, before fetching anything', async () => {
    const ref = parseRefs([`@alpha/demo@1.2.0#${D('a')}`]);
    await expect(resolveSource(registry, ref)).rejects.toMatchObject({ code: 'integrity_error' });
  });
});

describe('trusted keys', () => {
  it('merges the file and SKILLX_TRUSTED_KEYS and rejects malformed keys', () => {
    const key = Buffer.alloc(32, 7).toString('base64');
    writeFileSync(join(root, 'trusted-keys.json'), JSON.stringify({ keys: { 'file-key': key } }));
    const keys = loadTrustedKeys(root, { SKILLX_TRUSTED_KEYS: `env-key=${key}` });
    expect([...keys.keys()].sort()).toEqual(['env-key', 'file-key', 'skillx-reg-993cd14a011f7b76']);
    expect([...loadTrustedKeys(join(root, 'none'), {}).keys()]).toEqual(['skillx-reg-993cd14a011f7b76']);
    expect(() => loadTrustedKeys(root, { SKILLX_TRUSTED_KEYS: 'short=AAAA' })).toThrow(/32-byte/);
  });
});

describe('lock file', () => {
  it('writes a clean lock and refuses one that carries a secret or an absolute path', () => {
    const path = writeLockFile(join(root, 'skillx.lock.json'), lock());
    expect(JSON.parse(readFileSync(path, 'utf8'))).toEqual(lock());
    expect(() => writeLockFile(join(root, 'x.json'), lock({ runtimes: { 'claude-code': '/home/alice/.claude' } }))).toThrow(/leaking/);
    expect(() => writeLockFile(join(root, 'x.json'), lock({ runtimes: { codex: 'ghp_0123456789abcdefghijklmnopqrstuvwxyz' } }))).toThrow(/leaking/);
  });
});

describe('planner', () => {
  const plan = (force: boolean) =>
    planInstall({ home: join(root, '.skillx'), runtime: 'claude-code', skillsDir: join(root, 'skills'), owner: 'packages:@alpha/demo', packages: lock().packages, owners: { schema: 'skillx.install-owners/v1', owners: {} }, force });

  it('installs into an empty slot, and treats an unowned directory as a conflict unless forced', () => {
    expect(plan(false).actions).toEqual([expect.objectContaining({ action: 'install', alias: 'demo', preserve: [] })]);
    mkdirSync(join(root, 'skills', 'demo'), { recursive: true });
    writeFileSync(join(root, 'skills', 'demo', 'notes.md'), 'mine');
    expect(plan(false)).toMatchObject({ conflicts: 1, actions: [{ action: 'conflict', reason: 'unowned_directory', files: ['notes.md'] }] });
    expect(plan(true).actions).toEqual([expect.objectContaining({ action: 'install', preserve: ['notes.md'] })]);
    expect(plan(true).planDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
