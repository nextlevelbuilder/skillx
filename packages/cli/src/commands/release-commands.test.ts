import { afterEach, describe, expect, it, vi } from 'vitest';
import { publishMode } from './publish.js';
import { parseReleaseTarget, runPromote } from './promote.js';
import { CliError, publishCredential } from '../lib/release-cli.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('publish mode', () => {
  it('treats GitHub repositories as the deprecated import and everything else as a release', () => {
    expect(publishMode('nextlevelbuilder/skillx', {})).toBe('import');
    expect(publishMode('https://github.com/nextlevelbuilder/skillx', {})).toBe('import');
    expect(publishMode(undefined, {})).toBe('import');
    expect(publishMode('.', {})).toBe('release');
    expect(publishMode('src', {})).toBe('release');
    expect(publishMode('HEAD', {})).toBe('release');
    expect(publishMode('owner/repo', { name: '@a/b' })).toBe('release');
  });
});

describe('promote', () => {
  it('parses @publisher/slug@version', () => {
    expect(parseReleaseTarget('@alpha/demo@1.2.0-beta.1')).toMatchObject({ handle: 'alpha', slug: 'demo', version: '1.2.0-beta.1' });
    expect(() => parseReleaseTarget('@alpha/demo')).toThrow(CliError);
    expect(() => parseReleaseTarget('alpha/demo@1.0.0')).toThrow(CliError);
  });

  it('posts the move with the API key and maps registry failures onto envelope codes', async () => {
    vi.stubEnv('SKILLX_API_KEY', 'sx_key');
    const fetchMock = vi.fn(async () => json({ from: 'beta', to: 'stable' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await runPromote('@alpha/demo@1.0.0', { to: 'stable', from: 'beta', registry: 'https://reg.test' })).toEqual({ from: 'beta', to: 'stable' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://reg.test/api/v1/packages/@alpha/demo/releases/1.0.0/promote');
    expect(JSON.parse(String(init.body))).toEqual({ to: 'stable', from: 'beta' });
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sx_key');

    fetchMock.mockResolvedValueOnce(json({ error: { code: 'promote.demotion_forbidden', message: 'no' } }, 403));
    await expect(runPromote('@alpha/demo@1.0.0', { to: 'beta', registry: 'https://reg.test' })).rejects.toMatchObject({ failure: { error: { code: 'auth_error' } } });
    await expect(runPromote('@alpha/demo@1.0.0', { to: 'nightly', registry: 'https://reg.test' })).rejects.toMatchObject({ failure: { error: { code: 'usage_error' } } });
  });
});

describe('OIDC credential', () => {
  it('exchanges the GitHub Actions token for a publish token', async () => {
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', 'https://gh.test/token?x=1');
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_TOKEN', 'runner-bearer');
    const fetchMock = vi.fn(async (url: string) => (url.startsWith('https://gh.test') ? json({ value: 'id-token' }) : json({ token: 'sxo_short' })));
    vi.stubGlobal('fetch', fetchMock);
    expect(await publishCredential('https://reg.test', 'bestagentkits', { oidc: true })).toBe('sxo_short');
    expect(fetchMock.mock.calls[0][0]).toBe('https://gh.test/token?x=1&audience=skillx');
    const [, init] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(init.body))).toEqual({ token: 'id-token', publisher: '@bestagentkits' });
  });

  it('fails as auth_error outside GitHub Actions', async () => {
    vi.stubEnv('ACTIONS_ID_TOKEN_REQUEST_URL', '');
    await expect(publishCredential('https://reg.test', 'a', { oidc: true })).rejects.toMatchObject({ failure: { error: { code: 'auth_error' } } });
  });
});
