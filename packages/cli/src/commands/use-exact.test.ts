import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/config-store.js', () => ({
  getApiKey: () => undefined,
  getBaseUrl: () => 'https://skillx.test',
  getDeviceId: () => 'device-test',
}));
vi.mock('ora', () => ({
  default: () => {
    const spinner = { text: '', start: () => spinner, stop: () => spinner };
    return spinner;
  },
}));

const skill = { slug: 'demo-skill', name: 'Skill', description: 'Demo', category: 'testing', avg_rating: 4, risk_label: 'safe', content: '# Demo' };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let out: string[];
let requested: string[];
/** Answers by URL; anything unrouted is a 404. */
let routes: Record<string, () => Response>;

beforeEach(() => {
  out = [];
  requested = [];
  routes = {
    // Present so a fallback, if one ran, would succeed instead of failing silently.
    'POST /api/search': () => json({ results: [{ slug: 'other-skill', name: 'other', author: 'someone' }] }),
    'POST /api/skills/register': () => json({ skill: { ...skill, slug: 'other-skill' }, created: true }),
  };
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = `${init?.method ?? 'GET'} ${url.pathname}`;
      requested.push(key);
      if (url.pathname.endsWith('/install')) return new Response(null, { status: 204 });
      return routes[key]?.() ?? json({ error: 'not found' }, 404);
    }),
  );
  process.exitCode = undefined;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  process.exitCode = undefined;
});

/** A fresh module graph per run, so commander option values never carry over between tests. */
async function runUse(...args: string[]): Promise<void> {
  vi.resetModules();
  const { useCommand } = await import('./use.js');
  await useCommand.parseAsync(args, { from: 'user' });
}

const fallbackCalls = () => requested.filter((r) => r.endsWith(' /api/search') || r === 'POST /api/skills/register');
const envelope = () => JSON.parse(out.join('\n')) as { ok: boolean; error?: { code: string } };

describe('skillx use --exact', () => {
  it('fetches only the slug endpoint and names the slug in the raw header', async () => {
    routes['GET /api/skills/demo-skill'] = () => json({ skill });
    await runUse('demo-skill', '--exact', '--raw');
    expect(requested).toContain('GET /api/skills/demo-skill');
    expect(fallbackCalls()).toEqual([]);
    expect(out).toContain('--- BEGIN EXTERNAL SKILL CONTENT (untrusted, slug: demo-skill, risk: safe) ---');
    expect(process.exitCode).toBe(0);
  });

  it('fails with not_found (exit 3) on a miss, without searching', async () => {
    await runUse('missing-skill', '--exact', '--json');
    expect(envelope()).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(process.exitCode).toBe(3);
    expect(requested).toEqual(['GET /api/skills/missing-skill']);
  });

  it('takes the identifier verbatim, never mapping it to another slug', async () => {
    routes['GET /api/skills/author-name'] = () => json({ skill: { ...skill, slug: 'author-name' } });
    await runUse('author/name', '--exact', '--json');
    expect(envelope()).toMatchObject({ ok: false, error: { code: 'usage_error' } });
    expect(process.exitCode).toBe(2);
    expect(requested).toEqual([]);
  });

  it('refuses --exact together with --search', async () => {
    await runUse('demo-skill', '--exact', '--search', '--json');
    expect(envelope()).toMatchObject({ ok: false, error: { code: 'usage_error' } });
    expect(process.exitCode).toBe(2);
    expect(requested).toEqual([]);
  });
});

describe('skillx use without --exact', () => {
  it('still falls back to search on a slug miss', async () => {
    await runUse('missing-skill', '--json');
    expect(requested).toContain('POST /api/search');
  });
});
