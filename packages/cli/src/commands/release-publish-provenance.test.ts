import { describe, expect, it } from 'vitest';
import { kitProvenance, releaseMetadataHeader } from './release-publish.js';

describe('kitProvenance', () => {
  it('sends no provenance without --kit-origin, so the release stays skillx.release/v1', () => {
    expect(kitProvenance({ handle: 'alpha', slug: 'review' }, undefined)).toBeUndefined();
    expect(kitProvenance({ handle: 'agentkit', slug: 'review' }, undefined)).toBeUndefined();
  });

  it('marks an @agentkit release as a kit release with its origin', () => {
    expect(kitProvenance({ handle: 'agentkit', slug: 'review' }, 'remote-signed')).toEqual({ provider: 'kit', origin: 'remote-signed' });
    expect(kitProvenance({ handle: 'agentkit', slug: 'review' }, 'local-dev')).toEqual({ provider: 'kit', origin: 'local-dev' });
  });

  it('refuses an unknown origin and a kit origin for any other publisher', () => {
    expect(() => kitProvenance({ handle: 'agentkit', slug: 'review' }, 'signed')).toThrow(/--kit-origin must be one of/);
    expect(() => kitProvenance({ handle: 'bestagentkits', slug: 'review' }, 'remote-signed')).toThrow(/only for @agentkit/);
  });

  it('refuses an ak- kit slug before packing, naming the identity to use', () => {
    expect(() => kitProvenance({ handle: 'agentkit', slug: 'ak-plan' }, 'remote-signed')).toThrow(/use @agentkit\/plan/);
  });
});

describe('releaseMetadataHeader', () => {
  const decode = (header: string) => JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Record<string, unknown>;

  it('sends the kit provenance in X-SkillX-Release and omits it for a skillx release', () => {
    const kit = decode(releaseMetadataHeader({ version: '1.0.0', provenance: kitProvenance({ handle: 'agentkit', slug: 'review' }, 'local-dev') }));
    expect(kit).toEqual({ version: '1.0.0', provenance: { provider: 'kit', origin: 'local-dev' } });
    const plain = decode(releaseMetadataHeader({ version: '1.0.0', provenance: kitProvenance({ handle: 'alpha', slug: 'review' }, undefined) }));
    expect(plain).toEqual({ version: '1.0.0' });
  });
});
