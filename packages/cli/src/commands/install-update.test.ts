import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { printUpdated } from './install.js';

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
    printUpdated({
      outcomes: [{ items: [], warnings: [], applied: [], lock: {} } as never],
      lockPath: '/tmp/skillx.lock.json',
    });
    const text = out.join('\n');
    expect(text).not.toContain('Nothing to update.');
    expect(text).toContain('lock written to /tmp/skillx.lock.json');
    expect(text).toContain('✓ done');
  });
});
