import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/config-store.js', () => ({
  getApiKey: () => 'sk-test',
  getBaseUrl: () => 'https://skillx.test',
}));

import { listLibrary } from '../lib/library-api.js';
import { exitCodeFor, fromError } from '../lib/output.js';

const skill = (identity: string) => ({ kind: 'skill', identity, relation: 'owner', visibility: 'private', packageKind: 'skill', state: 'published', latest: { version: '1.0.0', releaseDigest: 'sha256:aa' }, installRef: `${identity}@1.0.0` });
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const page = (items: unknown[], nextCursor: string | null) => ({ schema: 'skillx.library/v1', items, nextCursor, kits: { status: 'available' } });

let urls: string[];
let answers: Response[];

beforeEach(() => {
  urls = [];
  answers = [];
  vi.stubGlobal('fetch', async (url: string) => {
    urls.push(url);
    return answers.shift() ?? reply(page([], null));
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('library list', () => {
  it('follows every page and sends the filters', async () => {
    answers.push(reply(page([skill('@a/one')], 'c1')), reply(page([skill('@a/two')], null)));
    const result = await listLibrary({ kind: 'skill', query: 'o', limit: '1' });
    expect(result.items.map((i) => i.identity)).toEqual(['@a/one', '@a/two']);
    expect(result.nextCursor).toBeNull();
    expect(urls).toEqual([
      'https://skillx.test/api/v1/library?kind=skill&q=o&limit=1',
      'https://skillx.test/api/v1/library?kind=skill&q=o&limit=1&cursor=c1',
    ]);
  });

  it('reads exactly one page when --cursor is given', async () => {
    answers.push(reply(page([skill('@a/two')], 'c3')));
    const result = await listLibrary({ cursor: 'c2' });
    expect(urls).toEqual(['https://skillx.test/api/v1/library?cursor=c2']);
    expect(result.nextCursor).toBe('c3');
  });

  it('reports the kits status and refuses a repeating cursor', async () => {
    answers.push(reply({ ...page([], null), kits: { status: 'unavailable', code: 'kit.api_disabled' } }));
    expect((await listLibrary({})).kits).toEqual({ status: 'unavailable', code: 'kit.api_disabled' });
    answers.push(reply(page([], 'same')), reply(page([], 'same')));
    await expect(listLibrary({})).rejects.toMatchObject({ code: 'api_error' });
  });

  it.each([
    [{ kind: 'bundle' }],
    [{ limit: '0' }],
    [{ limit: '101' }],
    [{ limit: 'ten' }],
    [{ query: 'x'.repeat(65) }],
    [{ cursor: '' }],
  ])('rejects %j as a usage error before any request', async (options) => {
    await expect(listLibrary(options)).rejects.toMatchObject({ code: 'usage_error' });
    expect(urls).toEqual([]);
  });

  it.each([
    [401, 'invalid_api_key', 'auth_error', 5],
    [403, 'auth.scope_missing', 'auth_error', 5],
    [404, 'not_found', 'not_found', 3],
    [429, 'rate_limited', 'rate_limited', 7],
    [400, 'invalid_cursor', 'api_error', 1],
  ])('maps %i %s to the %s envelope (exit %i) and keeps the server code', async (status, code, cliCode, exit) => {
    answers.push(reply({ error: { code, message: 'nope' } }, status));
    const error = await listLibrary({}).catch((e) => e);
    const envelope = fromError(error);
    expect(envelope).toMatchObject({ ok: false, error: { code: cliCode, details: { status, code } } });
    expect(exitCodeFor(envelope)).toBe(exit);
  });
});
