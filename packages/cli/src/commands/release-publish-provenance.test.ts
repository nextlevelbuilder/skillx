import { describe, expect, it } from 'vitest';
import { kitProvenance, releaseMetadataHeader } from './release-publish.js';

describe('kitProvenance', () => {
  it('sends no provenance without --kit-origin, so the release stays skillx.release/v1', () => {
    expect(kitProvenance('alpha', undefined)).toBeUndefined();
    expect(kitProvenance('agentkit', undefined)).toBeUndefined();
  });

  it('marks an @agentkit release as a kit release with its origin', () => {
    expect(kitProvenance('agentkit', 'remote-signed')).toEqual({ provider: 'kit', origin: 'remote-signed' });
    expect(kitProvenance('agentkit', 'local-dev')).toEqual({ provider: 'kit', origin: 'local-dev' });
  });

  it('refuses an unknown origin and a kit origin for any other publisher', () => {
    expect(() => kitProvenance('agentkit', 'signed')).toThrow(/--kit-origin must be one of/);
    expect(() => kitProvenance('bestagentkits', 'remote-signed')).toThrow(/only for @agentkit/);
  });
});

describe('releaseMetadataHeader', () => {
  const decode = (header: string) => JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Record<string, unknown>;

  it('sends the kit provenance in X-SkillX-Release and omits it for a skillx release', () => {
    const kit = decode(releaseMetadataHeader({ version: '1.0.0', provenance: kitProvenance('agentkit', 'local-dev') }));
    expect(kit).toEqual({ version: '1.0.0', provenance: { provider: 'kit', origin: 'local-dev' } });
    const plain = decode(releaseMetadataHeader({ version: '1.0.0', provenance: kitProvenance('alpha', undefined) }));
    expect(plain).toEqual({ version: '1.0.0' });
  });
});
