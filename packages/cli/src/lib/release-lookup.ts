import { apiRequest } from './api-client.js';

/**
 * Best-effort check whether a pinned release exists for a skill shown from a
 * legacy listing. A legacy listing carries no link to a release package, so
 * the candidate package is derived from the identifier the user typed:
 * `author/skill` -> `@author/skill`, `org/repo/.../leaf` -> `@org/leaf`. A
 * bare slug or search has no candidate. Any failure (release API off, unknown
 * package, network error, timeout) counts as "no release", so the caller
 * keeps the conservative discovery-only label.
 */

const SEGMENT = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const LOOKUP_TIMEOUT_MS = 5000;

interface ReleaseListResponse {
  releases?: Array<{ state?: unknown }>;
}

/** The `@handle/slug` package a typed identifier may correspond to, or null. */
export function candidatePackage(identifier: string): string | null {
  if (identifier.includes(' ')) return null;
  const parts = identifier.split('/');
  if (parts.length < 2) return null;
  const handle = parts[0].toLowerCase();
  const slug = parts[parts.length - 1].toLowerCase();
  if (!SEGMENT.test(handle) || !SEGMENT.test(slug)) return null;
  return `@${handle}/${slug}`;
}

/** Whether the candidate package of `identifier` has at least one `published` release. */
export async function hasPublishedRelease(identifier: string): Promise<boolean> {
  const name = candidatePackage(identifier);
  if (name === null) return false;
  try {
    // Both segments matched SEGMENT, so the path needs no escaping.
    const res = await apiRequest<ReleaseListResponse>(`/api/v1/packages/${name}/releases`, {
      signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
    });
    return Array.isArray(res.releases) && res.releases.some((release) => release.state === 'published');
  } catch {
    return false;
  }
}
