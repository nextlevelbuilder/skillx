import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runAdd } from '../../commands/add.js';
import { assertCanPrompt } from '../../commands/add-prompts.js';
import type { AddResult } from '../../commands/add-display.js';
import { createInstallContext } from '../install/install-context.js';
import type { InstallContext } from '../install/install-context.js';
import { listInstalled, uninstallRef, updateInstalled } from '../install/install-operations.js';
import { readOwners, readReceipt } from '../install/install-state.js';
import { createRegistry } from '../install/registry-client.js';
import { CliError } from '../output.js';
import { applyAdd } from './add-install.js';
import { openLocalSource } from './local-source.js';
import { discoverSkills, prepareSkill } from './skill-discovery.js';

/**
 * `skillx add` from a local path, end to end into a temporary home: the
 * skills directory, receipts and owners all live under `root`, and the
 * registry is never contacted.
 */

let root: string;
let src: string;
let ctx: (force?: boolean) => InstallContext;
const saved = { ...process.env };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'skillx-add-e2e-'));
  src = join(root, 'src');
  const env = { HOME: join(root, 'home'), USERPROFILE: join(root, 'home'), SKILLX_HOME: join(root, 'skillx'), CLAUDE_CONFIG_DIR: join(root, 'claude') };
  // runAdd builds its context from process.env, like the CLI.
  Object.assign(process.env, env);
  ctx = (force = false) => createInstallContext({ registry: createRegistry({ baseUrl: 'http://127.0.0.1:9' }), env, force });
});
afterEach(() => {
  process.env = { ...saved };
  rmSync(root, { recursive: true, force: true });
});

function write(rel: string, text: string): void {
  const path = join(src, ...rel.split('/'));
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text);
}
const skillMd = (name: string, body = '') => `---\nname: ${name}\ndescription: ${name} skill\n---\n# ${name}\n${body}`;
const skillsDir = () => join(root, 'claude', 'skills');

async function add(names: string[], force = false): Promise<AddResult> {
  return runAdd(src, { json: true, skill: names, ...(force ? { force } : {}) });
}

async function refusal(run: () => Promise<unknown>): Promise<CliError> {
  try {
    await run();
  } catch (error) {
    expect(error).toBeInstanceOf(CliError);
    return error as CliError;
  }
  throw new Error('expected a refusal');
}

describe('skillx add from a local path', () => {
  it('installs through the installer: files, receipt and an add:<alias> owner', async () => {
    write('skills/demo/SKILL.md', skillMd('demo'));
    write('skills/demo/references/guide.md', 'guide\n');
    write('skills/other/SKILL.md', skillMd('other'));
    const result = await add(['demo']);
    expect(result).toMatchObject({ status: 'installed', source: src, runtime: 'claude-code', skillsDir: skillsDir(), skills: [{ alias: 'demo', origin: join(src, 'skills', 'demo') }] });
    expect(readFileSync(join(skillsDir(), 'demo', 'references', 'guide.md'), 'utf8')).toBe('guide\n');
    expect(existsSync(join(skillsDir(), 'other'))).toBe(false);

    const receipt = readReceipt(join(root, 'skillx'), 'claude-code', 'demo')!;
    expect(receipt).toMatchObject({ package: join(src, 'skills', 'demo'), version: 'local', requiredBy: ['add:demo'] });
    expect(receipt.files.map((f) => f.path)).toEqual(['SKILL.md', 'references/guide.md']);
    expect(readOwners(join(root, 'skillx'), 'claude-code').owners['add:demo']?.ref).toBe(src);
    expect(listInstalled(ctx()).skills.map((s) => s.alias)).toEqual(['demo']);
  });

  it('is a no-op when the same tree is added again, and refuses a changed one without --force', async () => {
    write('demo/SKILL.md', skillMd('demo'));
    await add([]);
    const again = await add([]);
    expect(again.status === 'installed' && again.applied[0]!.changed).toEqual([]);

    write('demo/SKILL.md', skillMd('demo', 'v2\n'));
    const refused = await refusal(() => add([]));
    expect(refused.code).toBe('conflict');
    expect(refused.message).toContain('--force');
    expect(readFileSync(join(skillsDir(), 'demo', 'SKILL.md'), 'utf8')).not.toContain('v2');

    await add([], true);
    expect(readFileSync(join(skillsDir(), 'demo', 'SKILL.md'), 'utf8')).toContain('v2');
  });

  it('never installs over an existing directory it does not own without --force, and keeps unknown files with it', async () => {
    write('demo/SKILL.md', skillMd('demo'));
    mkdirSync(join(skillsDir(), 'demo'), { recursive: true });
    writeFileSync(join(skillsDir(), 'demo', 'MY-EDITS.md'), 'mine\n');
    const refused = await refusal(() => add([]));
    expect(refused.code).toBe('conflict');
    expect(refused.extra.details).toMatchObject({ conflicts: [{ alias: 'demo', reason: 'unowned_directory' }] });
    expect(existsSync(join(skillsDir(), 'demo', 'SKILL.md'))).toBe(false);

    await add([], true);
    expect(readFileSync(join(skillsDir(), 'demo', 'MY-EDITS.md'), 'utf8')).toBe('mine\n');
    expect(existsSync(join(skillsDir(), 'demo', 'SKILL.md'))).toBe(true);
  });

  it('refuses reserved names when asked for one, and never installs them with *', async () => {
    write('skills/ak-plan/SKILL.md', skillMd('ak-plan'));
    write('skills/fine/SKILL.md', skillMd('fine'));
    expect((await refusal(() => add(['ak-plan']))).code).toBe('usage_error');
    const all = await add(['*']);
    expect(all.status === 'installed' && all.skills.map((s) => s.alias)).toEqual(['fine']);
    expect(all.status === 'installed' && all.skipped).toEqual([{ dir: 'skills/ak-plan', reason: expect.stringContaining('reserved') }]);
    expect(existsSync(join(skillsDir(), 'ak-plan'))).toBe(false);
  });

  it('asks for names under --json when the source holds several skills', async () => {
    write('a/SKILL.md', skillMd('a'));
    write('b/SKILL.md', skillMd('b'));
    expect((await refusal(() => runAdd(src, { json: true }))).code).toBe('usage_error');
    expect((await refusal(() => add(['nope']))).code).toBe('not_found');
  });

  it('refuses to prompt without a terminal unless --yes or --json says not to ask', () => {
    const refused = (() => {
      try {
        assertCanPrompt({}, false);
      } catch (error) {
        return error as CliError;
      }
      throw new Error('expected a refusal');
    })();
    expect(refused).toBeInstanceOf(CliError);
    expect(refused.code).toBe('usage_error');
    expect(refused.message).toContain('--yes');
    expect(() => assertCanPrompt({ yes: true }, false)).not.toThrow();
    expect(() => assertCanPrompt({ json: true }, false)).not.toThrow();
    expect(() => assertCanPrompt({}, true)).not.toThrow();
  });

  it('lists without installing anything', async () => {
    write('a/SKILL.md', skillMd('a'));
    const listed = await runAdd(src, { json: true, list: true });
    expect(listed).toMatchObject({ status: 'listed', skills: [{ name: 'a', dir: 'a', description: 'a skill' }], skipped: [] });
    expect(existsSync(skillsDir())).toBe(false);
  });

  it('uninstalls add:<alias> with ownership proof, and update leaves added skills alone', async () => {
    write('demo/SKILL.md', skillMd('demo'));
    await add([]);
    expect(await updateInstalled(ctx(), [])).toEqual([]);
    expect((await refusal(() => updateInstalled(ctx(), ['add:demo']))).code).toBe('usage_error');

    writeFileSync(join(skillsDir(), 'demo', 'notes.md'), 'my notes\n');
    const [removed] = await uninstallRef(ctx(), ['add:demo']);
    expect(removed!.removed[0]).toMatchObject({ alias: 'demo', removed: ['SKILL.md'], keptUnknown: ['notes.md'] });
    expect(readReceipt(join(root, 'skillx'), 'claude-code', 'demo')).toBeNull();
    expect(readOwners(join(root, 'skillx'), 'claude-code').owners['add:demo']).toBeUndefined();
  });

  it('refuses two selected skills that install under one name', async () => {
    write('one/SKILL.md', skillMd('same'));
    write('two/SKILL.md', skillMd('same'));
    const snapshot = openLocalSource(src);
    const added = discoverSkills(snapshot, '').skills.map((s) => ({ alias: s.name, origin: s.dir, tree: prepareSkill(snapshot, s) }));
    expect((await refusal(() => applyAdd(ctx(), { ref: src, version: 'local' }, added))).code).toBe('usage_error');
  });
});
