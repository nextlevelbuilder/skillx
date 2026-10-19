import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/config-store.js', () => ({
  getApiKey: () => 'sk-test',
  getBaseUrl: () => 'https://skillx.test',
}));

import { KitApiDisabledError, kitApi } from './kit-api.js';
import { ApiError } from './api-client.js';

let calls: Array<{ url: string; method: string; body: unknown; auth: string | null }>;
let reply: () => Response;

beforeEach(() => {
  calls = [];
  reply = () => new Response(JSON.stringify({ ok: true }), { status: 200 });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const headers = new Headers(init.headers);
    calls.push({ url, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined, auth: headers.get('Authorization') });
    return reply();
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('kit API client', () => {
  it('sends canonical documents and generation guards to the kit routes', async () => {
    await kitApi.storeRevision('@alpha/my-kit', { schema: 'skillx.personal-kit/v1' }, 3, 'idem-key-0001');
    await kitApi.rebase('@alpha/my-kit', [{ package: '@agentkit/core', version: '2.0.0' }], 4, 'idem-key-0002');
    await kitApi.lock('@alpha/my-kit', 'pkr_x');
    expect(calls).toEqual([
      { url: 'https://skillx.test/api/v1/kits/@alpha/my-kit/revisions', method: 'POST', auth: 'Bearer sk-test', body: { expectedGeneration: 3, idempotencyKey: 'idem-key-0001', document: { schema: 'skillx.personal-kit/v1' } } },
      { url: 'https://skillx.test/api/v1/kits/@alpha/my-kit/rebase', method: 'POST', auth: 'Bearer sk-test', body: { expectedGeneration: 4, idempotencyKey: 'idem-key-0002', updates: [{ package: '@agentkit/core', version: '2.0.0' }] } },
      { url: 'https://skillx.test/api/v1/kits/@alpha/my-kit/lock?revision=pkr_x', method: 'GET', auth: 'Bearer sk-test', body: undefined },
    ]);
  });

  it('marks a resolution as the user decision and names the approved digest on activation', async () => {
    await kitApi.resolveConflict('@alpha/my-kit', 'pkc_1', { expectedGeneration: 5, idempotencyKey: 'idem-key-0003', decisions: [{ identity: '@agentkit/core', choice: 'keep-old' }] });
    await kitApi.activate('@alpha/my-kit', { id: 'pkr_2', digest: 'sha256:ab' }, 6, true);
    expect(calls[0]!.body).toMatchObject({ approvedBy: 'user' });
    expect(calls[1]).toMatchObject({ url: 'https://skillx.test/api/v1/kits/@alpha/my-kit/rollback', body: { revisionId: 'pkr_2', approval: { revisionDigest: 'sha256:ab' } } });
  });

  it('validates and submits proposals, and offers no API-key review', async () => {
    await kitApi.validateProposal('@alpha/my-kit', { schema: 'skillx.kit-proposal/v1' });
    await kitApi.submitProposal('@alpha/my-kit', { schema: 'skillx.kit-proposal/v1' }, 2, 'idem-key-0004');
    expect(calls.map((c) => c.url.replace('https://skillx.test/api/v1/kits/@alpha/my-kit/', ''))).toEqual(['proposals/validate', 'proposals']);
    expect(calls[0]!.body).toEqual({ proposal: { schema: 'skillx.kit-proposal/v1' } });
    expect('reviewProposal' in kitApi).toBe(false);
  });

  it('refuses malformed kit names before any request and surfaces API errors', async () => {
    expect(() => kitApi.get('../etc')).toThrow(/invalid kit name/);
    reply = () => new Response(JSON.stringify({ error: { code: 'kit.generation_conflict' } }), { status: 409 });
    await expect(kitApi.get('@alpha/my-kit')).rejects.toBeInstanceOf(ApiError);
    await expect(kitApi.get('@alpha/my-kit')).rejects.not.toBeInstanceOf(KitApiDisabledError);
    expect(calls).toHaveLength(2);
  });

  it('reports a deployment with the kit API off as unsupported, not as a missing kit', async () => {
    reply = () => new Response(JSON.stringify({ error: { code: 'kit.api_disabled', message: 'personal kits are not enabled' } }), { status: 404 });
    const err = await kitApi.storeRevision('@alpha/my-kit', {}, 0, 'idem-key-0005').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(KitApiDisabledError);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 404, code: 'kit.api_disabled' });
    expect((err as Error).message).toMatch(/does not offer personal kits yet/);
    expect((err as Error).message).toMatch(/local kits are unaffected/);

    // A plain 404 (an unknown or foreign kit) stays an ordinary API error.
    reply = () => new Response(JSON.stringify({ error: { code: 'not_found' } }), { status: 404 });
    const missing = await kitApi.get('@alpha/my-kit').catch((e: unknown) => e);
    expect(missing).toBeInstanceOf(ApiError);
    expect(missing).not.toBeInstanceOf(KitApiDisabledError);
    expect(missing).toMatchObject({ status: 404, code: 'not_found' });
  });
});
