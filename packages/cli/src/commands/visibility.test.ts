import { afterEach, describe, expect, it, vi } from 'vitest';
import { runVisibilityGet, runVisibilitySet } from './visibility.js';
import { withVisibilityMismatchHint } from '../lib/visibility-hints.js';
import { CliError } from '../lib/release-cli.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const REG = { registry: 'https://reg.test' };
const LIST = 'https://reg.test/api/v1/packages/@alpha/demo/releases';
const SET = 'https://reg.test/api/v1/packages/@alpha/demo/visibility';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('skillx visibility get', () => {
  it('reads the visibility from the release list, with the API key when one is set', async () => {
    vi.stubEnv('SKILLX_API_KEY', 'sx_owner');
    const fetchMock = vi.fn(async () => json({ identity: '@alpha/demo', visibility: 'private', releases: [] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await runVisibilityGet('@alpha/demo', REG)).toEqual({ identity: '@alpha/demo', visibility: 'private' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(LIST);
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sx_owner');
  });

  it('fails clearly against a registry that does not report visibility', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ identity: '@alpha/demo', releases: [] })));
    await expect(runVisibilityGet('@alpha/demo', REG)).rejects.toMatchObject({ code: 'api_error', extra: { hint: expect.stringContaining('--from') } });
  });

  it('refuses a malformed package name as a usage error', async () => {
    await expect(runVisibilityGet('alpha/demo', REG)).rejects.toMatchObject({ code: 'usage_error' });
  });
});

describe('skillx visibility set', () => {
  it('reads the current visibility, then posts the compare-and-set with the API key', async () => {
    vi.stubEnv('SKILLX_API_KEY', 'sx_owner');
    const fetchMock = vi.fn(async (url: string) =>
      url === LIST ? json({ identity: '@alpha/demo', visibility: 'public', releases: [] }) : json({ identity: '@alpha/demo', from: 'public', to: 'private', visibility: 'private', changedAt: 't' }),
    );
    vi.stubGlobal('fetch', fetchMock);
    expect(await runVisibilitySet('@alpha/demo', 'private', REG)).toMatchObject({ from: 'public', to: 'private', visibility: 'private', changed: true });
    const [url, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe(SET);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual({ from: 'public', to: 'private' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sx_owner');
  });

  it('uses --from without reading, and writes nothing when the stored visibility already matches', async () => {
    vi.stubEnv('SKILLX_API_KEY', 'sx_owner');
    const fetchMock = vi.fn(async () => json({ visibility: 'unlisted' }));
    vi.stubGlobal('fetch', fetchMock);
    await runVisibilitySet('@alpha/demo', 'unlisted', { ...REG, from: 'public' });
    expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([SET]);
    // --from equal to the target is confirmed against the registry, never trusted.
    fetchMock.mockClear();
    fetchMock.mockResolvedValueOnce(json({ visibility: 'private' }));
    expect(await runVisibilitySet('@alpha/demo', 'private', { ...REG, from: 'private' })).toMatchObject({ changed: false, visibility: 'private' });
    expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([LIST]);
    fetchMock.mockResolvedValueOnce(json({ visibility: 'public' }));
    await expect(runVisibilitySet('@alpha/demo', 'private', { ...REG, from: 'private' })).rejects.toMatchObject({
      code: 'api_error',
      extra: { details: { code: 'visibility_conflict', stored: 'public' } },
    });
    expect(fetchMock.mock.calls.map((call) => (call as unknown as [string])[0])).toEqual([LIST, LIST]);
  });

  it('validates the visibility and --from before any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.stubEnv('SKILLX_API_KEY', 'sx_owner');
    await expect(runVisibilitySet('@alpha/demo', 'internal', REG)).rejects.toMatchObject({ code: 'usage_error' });
    await expect(runVisibilitySet('@alpha/demo', 'public', { ...REG, from: 'Public' })).rejects.toMatchObject({ code: 'usage_error' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('names the dashboard when the registry refuses a widening, and the next step for other refusals', async () => {
    vi.stubEnv('SKILLX_API_KEY', 'sx_owner');
    const fetchMock = vi.fn(async () => json({ error: { code: 'visibility.approval_required', message: 'needs approval' } }, 403));
    vi.stubGlobal('fetch', fetchMock);
    await expect(runVisibilitySet('@alpha/demo', 'public', { ...REG, from: 'private' })).rejects.toMatchObject({
      code: 'auth_error',
      extra: { hint: expect.stringContaining('https://reg.test/dashboard'), details: { status: 403, code: 'visibility.approval_required' } },
    });
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'visibility_conflict', message: 'changed' } }, 409));
    await expect(runVisibilitySet('@alpha/demo', 'private', { ...REG, from: 'public' })).rejects.toMatchObject({
      code: 'api_error',
      extra: { hint: expect.stringContaining('skillx visibility get @alpha/demo') },
    });
    fetchMock.mockResolvedValueOnce(json({ error: { code: 'invalid_api_key', message: 'scoped' } }, 401));
    await expect(runVisibilitySet('@alpha/demo', 'private', { ...REG, from: 'public' })).rejects.toMatchObject({
      code: 'auth_error',
      extra: { hint: expect.stringContaining('unscoped account API key') },
    });
  });
});

describe('publish visibility mismatch hint', () => {
  it('adds the next step to release.visibility_mismatch and leaves other errors alone', () => {
    const mismatch = new CliError('api_error', 'registry answered 409', { details: { status: 409, code: 'release.visibility_mismatch' } });
    const hinted = withVisibilityMismatchHint(mismatch, 'https://reg.test', '@alpha/demo', 'public') as CliError;
    expect(hinted).toMatchObject({ code: 'api_error', message: 'registry answered 409', extra: { details: { code: 'release.visibility_mismatch' } } });
    expect(hinted.extra.hint).toContain('skillx visibility set @alpha/demo public');
    expect(hinted.extra.hint).toContain('https://reg.test/dashboard');
    const other = new CliError('api_error', 'x', { details: { status: 409, code: 'release.version_exists' } });
    expect(withVisibilityMismatchHint(other, 'https://reg.test', '@alpha/demo', 'public')).toBe(other);
  });
});
