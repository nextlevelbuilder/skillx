import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstallLock } from '@skillx/contracts';
import type { ApplyOutcome } from '../lib/install/install-operations.js';
import { printUpdated } from './install.js';

const outcome: ApplyOutcome = {
  lock: {} as InstallLock,
  lockDigest: 'sha256:lock',
  items: [],
  planDigest: 'sha256:plan',
  warnings: [],
  applied: [],
  recovered: { rolledBack: [], rolledForward: [] },
};

let out: string[];

beforeEach(() => {
  out = [];
  vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => void out.push(args.join(' ')));
});

afterEach(() => vi.restoreAllMocks());

describe('printUpdated', () => {
  it('says so when nothing is installed', () => {
    printUpdated({ outcomes: [], lockPath: null });
    expect(out.join('\n')).toContain('Nothing to update.');
  });

  it('prints each applied source and no empty-state line', () => {
    printUpdated({ outcomes: [outcome, outcome], lockPath: '/tmp/skillx.lock.json' });
    const text = out.join('\n');
    expect(text).not.toContain('Nothing to update.');
    expect(text.match(/✓ done/g)).toHaveLength(2);
    // The lock line follows only the last source.
    expect(text.match(/lock written to/g)).toHaveLength(1);
    expect(text.trimEnd().endsWith('✓ done')).toBe(true);
    expect(text.lastIndexOf('lock written to /tmp/skillx.lock.json')).toBeGreaterThan(text.indexOf('✓ done'));
  });
});
