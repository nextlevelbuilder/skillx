import { describe, expect, it } from 'vitest';
import { defaultVisibilityNote, releaseMetadataHeader, requestedVisibility } from './release-publish.js';

const decode = (header: string) => JSON.parse(Buffer.from(header, 'base64').toString('utf8')) as Record<string, unknown>;

describe('requestedVisibility', () => {
  it('leaves the choice to the registry when --visibility is omitted', () => {
    expect(requestedVisibility(undefined)).toBeUndefined();
  });

  it('accepts exactly public, unlisted and private', () => {
    expect(requestedVisibility('public')).toBe('public');
    expect(requestedVisibility('unlisted')).toBe('unlisted');
    expect(requestedVisibility('private')).toBe('private');
    for (const bad of ['internal', 'Public', '']) expect(() => requestedVisibility(bad)).toThrow(/--visibility must be one of: public, unlisted, private/);
  });
});

describe('releaseMetadataHeader visibility', () => {
  it('sends visibility only when the flag is given', () => {
    expect(decode(releaseMetadataHeader({ version: '1.0.0', visibility: undefined }))).toEqual({ version: '1.0.0' });
    expect(decode(releaseMetadataHeader({ version: '1.0.0', visibility: 'private' }))).toEqual({ version: '1.0.0', visibility: 'private' });
  });
});

describe('defaultVisibilityNote', () => {
  it('notes a private result only when no visibility was requested', () => {
    expect(defaultVisibilityNote(undefined, { visibility: 'private' }, '@a/s')).toMatch(/^note: @a\/s is private/);
    expect(defaultVisibilityNote(undefined, { visibility: 'public' }, '@a/s')).toBeNull();
    expect(defaultVisibilityNote('private', { visibility: 'private' }, '@a/s')).toBeNull();
    // An older registry that does not answer visibility gets no guess.
    expect(defaultVisibilityNote(undefined, {}, '@a/s')).toBeNull();
  });
});
