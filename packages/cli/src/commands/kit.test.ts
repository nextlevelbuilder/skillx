import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

vi.mock('../utils/config-store.js', () => ({
  getApiKey: () => 'sk-test',
  getBaseUrl: () => 'https://skillx.test',
}));

import { parseGeneration, runKitActivate, runKitLock, runKitPush, runKitRevision, runKitRevisions, runKitShow } from './kit.js';
import { exitCodeFor, fromError } from '../lib/output.js';

const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const KIT = '@alpha/my-kit';
const BASE = `https://skillx.test/api/v1/kits/${KIT}`;

let calls: Array<{ url: string; method: string; body: any; ifMatch: string | null }>;
let answers: Response[];
let dir: string;

beforeEach(() => {
  calls = [];
  answers = [];
  dir = mkdtempSync(join(tmpdir(), 'skillx-kit-test-'));
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, ifMatch: new Headers(init.headers).get('If-Match') });
    return answers.shift() ?? reply({});
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  rmSync(dir, { recursive: true, force: true });
});

const document = () => {
  const file = join(dir, 'kit.json');
  writeFileSync(file, JSON.stringify({ schema: 'skillx.personal-kit/v1', kit: KIT }));
  return file;
};

describe('kit read commands', () => {
  it('call the kit routes', async () => {
    answers.push(reply({ kit: KIT, generation: 2, effectiveRevision: null }), reply({ revisions: [] }), reply({ id: 'r1', document: {} }), reply({ lock: {}, warnings: [] }));
    expect(await runKitShow(KIT)).toMatchObject({ generation: 2 });
    await runKitRevisions(KIT);
    await runKitRevision(KIT, 'pkr_1');
    await runKitLock(KIT, { revision: 'pkr_1' });
    expect(calls.map((c) => c.url.replace(BASE, ''))).toEqual(['', '/revisions', '/revisions/pkr_1', '/lock?revision=pkr_1']);
  });

  it('rejects a malformed kit name as a usage error without a request', async () => {
    await expect(runKitShow('my-kit')).rejects.toMatchObject({ code: 'usage_error' });
    expect(calls).toEqual([]);
  });
});

describe('kit push', () => {
  it('sends the document with If-Match and a stable idempotency key', async () => {
    answers.push(reply({ revision: { id: 'pkr_1', number: 1 }, generation: 1, replayed: false, warnings: [] }, 201), reply({}, 200));
    await runKitPush(KIT, { document: document(), ifMatch: '"g0"' });
    await runKitPush(KIT, { document: document(), ifMatch: '0' });
    expect(calls[0]).toMatchObject({ url: `${BASE}/revisions`, method: 'POST', ifMatch: '"g0"' });
    expect(calls[0]!.body).toMatchObject({ document: { kit: KIT } });
    expect(calls[0]!.body).not.toHaveProperty('expectedGeneration');
    expect(calls[0]!.body.idempotencyKey).toMatch(/^cli-[0-9a-f]{48}$/);
    expect(calls[1]!.body.idempotencyKey).toBe(calls[0]!.body.idempotencyKey);
  });

  it('maps a stale push (412) to the conflict envelope with the server code', async () => {
    answers.push(reply({ error: { code: 'kit.generation_conflict', message: 'generation is 4' } }, 412));
    const envelope = fromError(await runKitPush(KIT, { document: document(), ifMatch: '1' }).catch((e) => e));
    expect(envelope).toMatchObject({ ok: false, error: { code: 'conflict', details: { status: 412, code: 'kit.generation_conflict' } } });
    expect(exitCodeFor(envelope)).toBe(8);
  });

  it('rejects a missing/unreadable document and a bad generation before any request', async () => {
    await expect(runKitPush(KIT, { ifMatch: '1' })).rejects.toMatchObject({ code: 'usage_error' });
    await expect(runKitPush(KIT, { document: join(dir, 'missing.json'), ifMatch: '1' })).rejects.toMatchObject({ code: 'usage_error' });
    writeFileSync(join(dir, 'bad.json'), '{nope');
    await expect(runKitPush(KIT, { document: join(dir, 'bad.json'), ifMatch: '1' })).rejects.toMatchObject({ code: 'usage_error' });
    await expect(runKitPush(KIT, { document: document(), ifMatch: 'latest' })).rejects.toMatchObject({ code: 'usage_error' });
    expect(calls).toEqual([]);
  });

  it('parses generations', () => {
    expect([parseGeneration('3'), parseGeneration('g3'), parseGeneration('"g3"'), parseGeneration('W/"g3"')]).toEqual([3, 3, 3, 3]);
    expect(() => parseGeneration('*')).toThrow();
  });
});

describe('kit activate and rollback', () => {
  it('refuses activation without --digest (exit 2) and sends nothing', async () => {
    const error = await runKitActivate(KIT, 'pkr_1', {}).catch((e) => e);
    expect(error).toMatchObject({ code: 'usage_error' });
    expect(exitCodeFor(fromError(error))).toBe(2);
    await expect(runKitActivate(KIT, 'pkr_1', { digest: ' ' })).rejects.toMatchObject({ code: 'usage_error' });
    expect(calls).toEqual([]);
  });

  it('activates with the approved digest under the given or the current generation', async () => {
    answers.push(reply({ effectiveRevisionId: 'pkr_1', generation: 5, lock: {}, warnings: [] }));
    await runKitActivate(KIT, 'pkr_1', { digest: 'sha256:ab', ifMatch: '4' });
    expect(calls[0]).toMatchObject({ url: `${BASE}/activate`, ifMatch: '"g4"', body: { revisionId: 'pkr_1', approval: { revisionDigest: 'sha256:ab' } } });

    answers.push(reply({ kit: KIT, generation: 7, effectiveRevision: null }), reply({ effectiveRevisionId: 'pkr_0', generation: 8, lock: {}, warnings: [] }));
    await runKitActivate(KIT, 'pkr_0', { digest: 'sha256:cd' }, true);
    expect(calls.slice(1).map((c) => `${c.method} ${c.url.replace(BASE, '')} ${c.ifMatch ?? ''}`.trim())).toEqual(['GET', 'POST /rollback "g7"']);
  });

  it.each([
    [401, 'invalid_api_key', 'auth_error', 5],
    [403, 'kit.interactive_approval_required', 'auth_error', 5],
    [404, 'kit.not_found', 'not_found', 3],
    [412, 'kit.generation_conflict', 'conflict', 8],
    [409, 'kit.approval_required', 'api_error', 1],
  ])('maps %i %s to %s (exit %i)', async (status, code, cliCode, exit) => {
    answers.push(reply({ error: { code, message: 'no' } }, status));
    const envelope = fromError(await runKitActivate(KIT, 'pkr_1', { digest: 'sha256:ab', ifMatch: '1' }).catch((e) => e));
    expect(envelope).toMatchObject({ ok: false, error: { code: cliCode, details: { status, code } } });
    expect(exitCodeFor(envelope)).toBe(exit);
  });

  it('reports a deployment with kits off as not_found with kit.api_disabled', async () => {
    answers.push(reply({ error: { code: 'kit.api_disabled', message: 'off' } }, 404));
    const envelope = fromError(await runKitShow(KIT).catch((e) => e));
    expect(envelope).toMatchObject({ ok: false, error: { code: 'not_found', details: { code: 'kit.api_disabled' } } });
  });
});
