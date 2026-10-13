import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../utils/config-store.js', () => ({
  getApiKey: () => undefined,
  getBaseUrl: () => 'https://skillx.test',
  getDeviceId: () => 'device-test',
}));

import { discoveryOnlyNotice, displaySkill } from './use-display.js';
import type { SkillDetails, SkillReference, SkillScript } from './use-display.js';

const skill: SkillDetails = {
  slug: 'demo',
  name: 'Demo',
  description: 'Demo skill',
  category: 'testing',
  avg_rating: 4,
  content: '# Demo',
};
const refs: SkillReference[] = [{ title: 'Guide', filename: 'references/guide.md', url: null, type: 'docs' }];
const scripts: SkillScript[] = [{ name: 'setup', command: 'sh scripts/setup.sh', url: 'https://example.test/setup.sh' }];

let out: string[];
let err: string[];

beforeEach(() => {
  out = [];
  err = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
  vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => void err.push(args.join(' ')));
  vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 204 })));
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('discoveryOnlyNotice', () => {
  it('labels a multi-file legacy listing as discovery-only, counting its extra files', () => {
    expect(discoveryOnlyNotice(refs, scripts)).toMatch(/^Discovery-only: .*\(2 more files listed as links\).*not installed or pinned/);
    expect(discoveryOnlyNotice(refs, [])).toMatch(/\(1 more file listed as links\)/);
  });

  it('leaves a single-file listing unlabelled', () => {
    expect(discoveryOnlyNotice()).toBeNull();
    expect(discoveryOnlyNotice([], [])).toBeNull();
  });
});

describe('displaySkill discovery-only label', () => {
  it('shows the label in human output for a multi-file listing', () => {
    displaySkill(skill, 'demo', { raw: false }, refs, scripts);
    expect(out.join('\n')).toContain('Discovery-only: legacy listing of a multi-file skill');
  });

  it('writes the label to stderr in raw mode, keeping the piped content unchanged', () => {
    displaySkill(skill, 'demo', { raw: true }, refs, scripts);
    expect(err.join('\n')).toContain('Discovery-only');
    expect(out.join('\n')).not.toContain('Discovery-only');
  });

  it('prints no label for a single-file listing', () => {
    displaySkill(skill, 'demo', { raw: false });
    expect([...out, ...err].join('\n')).not.toContain('Discovery-only');
  });
});
