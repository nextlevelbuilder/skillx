import { describe, expect, it } from 'vitest';
import { exitCodeFor, fromError } from '../output.js';
import { createRegistry } from './registry-client.js';

/** A registry whose every read answers `status`, so the error class is all that is left to check. */
function registryAnswering(status: number) {
  return createRegistry({ baseUrl: 'https://reg.test', fetch: async () => new Response('{}', { status }) });
}

describe('registry client failures', () => {
  it.each([
    [404, 'not_found', 3],
    [401, 'auth_error', 5],
    [403, 'auth_error', 5],
    [429, 'rate_limited', 7],
    [500, 'api_error', 1],
  ])('maps %i to %s (exit %i), like the release commands', async (status, code, exit) => {
    const error = await registryAnswering(status).releases('@alpha/demo').catch((e: unknown) => e);
    const envelope = fromError(error);
    expect(envelope.error.code).toBe(code);
    expect(exitCodeFor(envelope)).toBe(exit);
  });

  it('tells a rate-limited caller to retry later', async () => {
    const error = await registryAnswering(429).releases('@alpha/demo').catch((e: unknown) => e);
    expect(fromError(error).error).toMatchObject({ details: { status: 429 }, hint: 'Retry later.' });
  });
});
