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

import { resolveAndUseSkill } from './use.js';
import { candidatePackage } from '../lib/release-lookup.js';

const skill = { slug: 'demo-skill', name: 'Skill', description: 'Demo', category: 'testing', avg_rating: 4, content: '# Demo' };
const references = [{ title: 'Guide', filename: 'references/guide.md', url: null, type: 'docs' }];
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let out: string[];
let requested: string[];
/** Answers by URL; anything unrouted is a 404. */
let routes: Record<string, () => Response>;

beforeEach(() => {
  out = [];
  requested = [];
  routes = {};
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      const key = `${init?.method ?? 'GET'} ${url.pathname}${url.search}`;
      requested.push(key);
      if (url.pathname.endsWith('/install')) return new Response(null, { status: 204 });
      return routes[key]?.() ?? json({ error: 'not found' }, 404);
    }),
  );
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const label = () => out.join('\n').includes('Discovery-only');
const releases = (...states: string[]) => () => json({ identity: '@demo/skill', releases: states.map((state, i) => ({ version: `1.0.${i}`, state })) });

describe('skillx use: discovery-only label', () => {
  it('shows the label for a multi-file listing when the candidate package has no release', async () => {
    routes['GET /api/skills/demo-skill'] = () => json({ skill, references });
    await resolveAndUseSkill('demo/skill', { raw: false });
    expect(requested).toContain('GET /api/v1/packages/@demo/skill/releases');
    expect(label()).toBe(true);
  });

  it('drops the label once a published release exists', async () => {
    routes['GET /api/skills/demo-skill'] = () => json({ skill, references });
    routes['GET /api/v1/packages/@demo/skill/releases'] = releases('yanked', 'published');
    await resolveAndUseSkill('demo/skill', { raw: false });
    expect(label()).toBe(false);
  });

  it('keeps the label when no release of the package is published', async () => {
    routes['GET /api/skills/demo-skill'] = () => json({ skill, references });
    routes['GET /api/v1/packages/@demo/skill/releases'] = releases('yanked', 'quarantined');
    await resolveAndUseSkill('demo/skill', { raw: false });
    expect(label()).toBe(true);
  });

  it('does not ask for releases for a single-file listing', async () => {
    routes['GET /api/skills/demo-skill'] = () => json({ skill });
    await resolveAndUseSkill('demo/skill', { raw: false });
    expect(requested.some((key) => key.includes('/api/v1/'))).toBe(false);
    expect(label()).toBe(false);
  });

  it('shows the label on the register fallback, reading references from the detail endpoint', async () => {
    routes['POST /api/skills/register'] = () => json({ skill, created: true });
    routes['GET /api/skills/demo-skill'] = () => json({ skill, references });
    await resolveAndUseSkill('demo/repo/skill', { raw: false });
    // The first lookup is pinned to the source identity and misses; the register path reads the plain detail.
    expect(requested[0]).toMatch(/^GET \/api\/skills\/demo-skill\?repo=demo%2Frepo&path=skill$/);
    expect(requested).toContain('GET /api/v1/packages/@demo/skill/releases');
    expect(out.join('\n')).toContain('Registered new skill from GitHub');
    expect(label()).toBe(true);
  });
});

describe('candidatePackage', () => {
  it('maps typed identifiers onto a @handle/slug candidate', () => {
    expect(candidatePackage('Demo/Skill')).toBe('@demo/skill');
    expect(candidatePackage('org/repo/skills/deep/leaf')).toBe('@org/leaf');
  });

  it('has no candidate for a bare slug, a search or an invalid segment', () => {
    expect(candidatePackage('find-skills')).toBeNull();
    expect(candidatePackage('ui ux design')).toBeNull();
    expect(candidatePackage('_local/skill')).toBeNull();
  });
});
