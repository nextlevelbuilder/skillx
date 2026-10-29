import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { INSTALL_LOCK_SCHEMA, INSTALL_RESOLVER_VERSION, validateInstallLock } from '@skillx/contracts';
import type { InstallLock, InstallLockAdded } from '@skillx/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAdd, runtimesOf } from '../../commands/add.js';
import { createInstallContext } from '../install/install-context.js';
import { listInstalled } from '../install/install-operations.js';
import { mergeLock } from '../install/lock-file.js';
import { planLocked } from '../install/sync-locked.js';
import { createRegistry } from '../install/registry-client.js';
import { CliError } from '../output.js';
import { addedEntryOf, dropAddedFromLockFile, entrySourceRef, mergeAdded, writeAddedLock } from './add-lock.js';
import { readLockedAdded, syncWithAdded, updateAdded } from './add-refresh.js';
import { parseAddSource } from './add-source.js';
import { openGitSource } from './git-source.js';

/**
 * Lock entries, `update` and `sync --locked` of skills from `skillx add`,
 * project scope and several runtimes. Git sources are local repositories
 * read through the `file` transport, which only tests may allow.
 */

let root: string;
let src: string;
const saved = { ...process.env };
const D = (c: string) => `sha256:${c.repeat(64)}`;
const env = () => ({ HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), SKILLX_HOME: join(root, 'skillx'), CLAUDE_CONFIG_DIR: join(root, 'claude'), CODEX_HOME: join(root, 'codex') });
const ctx = (projectDir?: string, runtime = 'claude-code') => createInstallContext({ registry: createRegistry({ baseUrl: 'http://127.0.0.1:9' }), env: env(), runtime, ...(projectDir ? { projectDir } : {}) });
const skillMd = (name: string, body = '') => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n${body}`;

function write(rel: string, text: string): void {
  const path = join(src, ...rel.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
function git(args: string[]): string {
  return execFileSync('git', ['-c', 'commit.gpgsign=false', '-c', 'user.name=T', '-c', 'user.email=t@example.com', ...args], { cwd: src, encoding: 'utf8' }).trim();
}
async function failure(run: () => unknown): Promise<CliError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error('expected a failure');
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-add-lock-'));
  src = join(root, 'src');
  Object.assign(process.env, env());
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

describe('added skills in skillx.lock.json', () => {
  const C = 'c'.repeat(40);
  it('records git sources without credentials and never a local one', () => {
    const gh = parseAddSource('github:acme/skills/skills@v1');
    expect(addedEntryOf(gh, 'lint', 'skills/lint', C, D('1'))).toEqual({ alias: 'lint', repository: 'https://github.com/acme/skills.git', path: 'skills/lint', ref: 'v1', commit: C, treeDigest: D('1') });
    const other = parseAddSource('https://user:tok@git.example.com/t/s.git');
    expect(addedEntryOf(other, 'pdf', '', C, D('2'))).toEqual({ alias: 'pdf', repository: 'https://git.example.com/t/s.git', path: '', commit: C, treeDigest: D('2') });
    expect(addedEntryOf(parseAddSource('./x', root), 'x', '', undefined, D('3'))).toBeNull();
  });

  it('turns an entry back into the source update follows', () => {
    const entry: InstallLockAdded = { alias: 'lint', repository: 'https://github.com/acme/skills.git', path: 'skills/lint', ref: 'v1', commit: C, treeDigest: D('1') };
    expect(entrySourceRef(entry)).toBe('github:acme/skills/skills/lint@v1');
    expect(parseAddSource(entrySourceRef(entry, C))).toMatchObject({ kind: 'github', path: 'skills/lint', ref: C });
    expect(entrySourceRef({ ...entry, repository: 'https://git.example.com/t/s.git' })).toBe('https://git.example.com/t/s.git');
  });

  it('merges by alias next to packages, writes a valid lock and drops an entry on uninstall', () => {
    const pkg = { alias: 'demo', package: '@alpha/demo', version: '1.0.0', releaseDigest: D('a'), compositionDigest: D('a'), overlayDigests: [] };
    const packages: InstallLock = { schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, source: { kind: 'packages' }, runtimes: {}, packages: [pkg] };
    const entry: InstallLockAdded = { alias: 'lint', repository: 'https://github.com/acme/skills.git', path: 'lint', commit: C, treeDigest: D('1') };
    const merged = mergeAdded(packages, [entry, { ...entry, alias: 'demo' }]);
    expect(merged.packages).toEqual([]);
    expect(merged.added!.map((a) => a.alias)).toEqual(['demo', 'lint']);
    expect(validateInstallLock(merged).valid).toBe(true);
    // A package installed later takes the alias back, and other added skills stay.
    expect(mergeLock(merged, packages)).toMatchObject({ packages: [pkg], added: [entry] });

    const path = join(root, 'skillx.lock.json');
    expect(writeAddedLock(path, [])).toBeNull();
    writeAddedLock(path, [entry]);
    expect(JSON.parse(readFileSync(path, 'utf8')).added).toEqual([entry]);
    expect(dropAddedFromLockFile(path, 'other')).toBeNull();
    dropAddedFromLockFile(path, 'lint');
    expect(JSON.parse(readFileSync(path, 'utf8'))).not.toHaveProperty('added');
  });
});

describe('scope and runtimes', () => {
  it('splits and dedupes runtimes, claude-code by default', () => {
    expect(runtimesOf({})).toEqual(['claude-code']);
    expect(runtimesOf({ runtime: ['codex,claude-code', 'codex'] })).toEqual(['codex', 'claude-code']);
  });

  it('installs one read into several runtimes and a project directory, with its own state', async () => {
    write('demo/SKILL.md', skillMd('demo'));
    const both = await runAdd(src, { json: true, skill: ['demo'], runtime: 'claude-code,codex' });
    expect(both).toMatchObject({ status: 'installed', runtime: 'claude-code', scope: 'user', lockPath: null });
    if (both.status !== 'installed') throw new Error('not installed');
    expect(both.targets.map((t) => [t.runtime, t.skillsDir])).toEqual([['claude-code', join(root, 'claude', 'skills')], ['codex', join(root, 'codex', 'skills')]]);
    expect(existsSync(join(root, 'codex', 'skills', 'demo', 'SKILL.md'))).toBe(true);

    const project = join(root, 'project');
    mkdirSync(project);
    const cwd = process.cwd();
    process.chdir(project);
    try {
      const local = await runAdd(src, { json: true, skill: ['demo'], runtime: ['codex'], project: true });
      expect(local).toMatchObject({ scope: 'project', skillsDir: join(project, '.agents', 'skills') });
    } finally {
      process.chdir(cwd);
    }
    expect(readFileSync(join(project, '.agents', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(skillMd('demo'));
    // The project install has its own owners: the user install is untouched, and neither sees the other.
    expect(listInstalled(ctx(project, 'codex')).sources.map((s) => s.owner)).toEqual(['add:demo']);
    expect(listInstalled(ctx(project)).sources).toEqual([]);
    expect(ctx(project).home).not.toBe(ctx().home);
    expect(existsSync(join(project, 'skillx.lock.json'))).toBe(false);
  });

  it('plans every runtime before writing, so a conflict in one installs nothing', async () => {
    write('demo/SKILL.md', skillMd('demo'));
    mkdirSync(join(root, 'codex', 'skills', 'demo'), { recursive: true });
    writeFileSync(join(root, 'codex', 'skills', 'demo', 'SKILL.md'), 'mine\n');
    expect((await failure(() => runAdd(src, { json: true, skill: ['demo'], runtime: 'claude-code,codex' }))).code).toBe('conflict');
    expect(existsSync(join(root, 'claude', 'skills', 'demo'))).toBe(false);
  });
});

describe('update and sync --locked of added skills', () => {
  it('update re-reads a local source and installs the skill of the same name', async () => {
    write('skills/demo/SKILL.md', skillMd('demo'));
    await runAdd(src, { json: true, skill: ['demo'] });
    write('skills/demo/SKILL.md', skillMd('demo', 'v2\n'));
    const { outcomes, entries } = await updateAdded(ctx(), []);
    expect(outcomes[0]!.applied[0]!.changed[0]).toMatchObject({ alias: 'demo', action: 'update' });
    expect(entries).toEqual([]);
    expect(readFileSync(join(root, 'claude', 'skills', 'demo', 'SKILL.md'), 'utf8')).toContain('v2');

    rmSync(join(src, 'skills', 'demo'), { recursive: true });
    write('skills/other/SKILL.md', skillMd('other'));
    expect((await failure(() => updateAdded(ctx(), ['add:demo']))).code).toBe('not_found');
    expect((await failure(() => updateAdded(ctx(), ['add:nope']))).code).toBe('not_found');
  });

  it('reads a locked commit, also one behind the branch tip, and refuses another tree', () => {
    write('skills/demo/SKILL.md', skillMd('demo'));
    mkdirSync(src, { recursive: true });
    git(['init', '-q', '-b', 'main']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'one']);
    const first = git(['rev-parse', 'HEAD']);
    write('skills/demo/SKILL.md', skillMd('demo', 'v2\n'));
    git(['commit', '-q', '-am', 'two']);
    const url = pathToFileURL(src).href;

    const snapshot = openGitSource(url, 'repo', first, 'file');
    expect(snapshot.commit).toBe(first);
    snapshot.dispose();
    const entry: InstallLockAdded = { alias: 'demo', repository: url, path: 'skills/demo', commit: first, treeDigest: D('0') };
    const wrong = (() => {
      try {
        readLockedAdded([entry], 'file');
      } catch (error) {
        return error as CliError;
      }
      return null;
    })();
    expect(wrong?.code).toBe('integrity_error');
    const digest = (wrong?.extra.details as { actual: string }).actual;
    const [skill] = readLockedAdded([{ ...entry, treeDigest: digest }], 'file');
    expect(skill).toMatchObject({ alias: 'demo', version: first, ref: url, origin: `${url}//skills/demo` });
    expect(new TextDecoder().decode(skill!.tree.files.find((f) => f.path === 'SKILL.md')!.bytes)).toBe(skillMd('demo'));
  });

  it('sync --locked installs the locked tree with the packages, then refuses local edits', async () => {
    write('skills/demo/SKILL.md', skillMd('demo'));
    git(['init', '-q', '-b', 'main']);
    git(['add', '-A']);
    git(['commit', '-q', '-m', 'one']);
    const url = pathToFileURL(src).href;
    const commit = git(['rev-parse', 'HEAD']);
    const probe: InstallLockAdded = { alias: 'demo', repository: url, path: 'skills/demo', commit, treeDigest: D('0') };
    const digest = (() => {
      try {
        readLockedAdded([probe], 'file');
      } catch (error) {
        return ((error as CliError).extra.details as { actual: string }).actual;
      }
      return '';
    })();
    const lock: InstallLock = { schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, source: { kind: 'packages' }, runtimes: {}, packages: [], added: [{ ...probe, treeDigest: digest }] };
    const c = ctx();
    const outcome = await syncWithAdded(c, () => planLocked(c, lock), lock.added!, 'file');
    expect(outcome.applied.map((a) => a.owner)).toEqual(['add:demo']);
    expect(readFileSync(join(root, 'claude', 'skills', 'demo', 'SKILL.md'), 'utf8')).toBe(skillMd('demo'));
    const again = await syncWithAdded(c, () => planLocked(c, lock), lock.added!, 'file');
    expect(again.applied[0]!.changed).toEqual([]);
    writeFileSync(join(root, 'claude', 'skills', 'demo', 'SKILL.md'), 'edited\n');
    expect((await failure(() => syncWithAdded(c, () => planLocked(c, lock), lock.added!, 'file'))).code).toBe('conflict');
  });
});
