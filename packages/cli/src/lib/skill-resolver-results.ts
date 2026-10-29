/**
 * Result builders for `skill-resolver.ts`: the detail endpoint, the
 * `ResolvedSkill` shape, and turning a detail or register response into one.
 */

import { apiRequest } from './api-client.js';
import { hasPublishedRelease } from './release-lookup.js';
import type { SkillDetailResponse, SkillDetails } from '../commands/use-display.js';

export type ResolvedSkill =
  | {
      kind: 'skill';
      displayId: string;
      /** True when the register fallback created the listing just now. */
      registered: boolean;
      detail: SkillDetailResponse;
      /** A published release exists, so the listing is not discovery-only. */
      releaseExists: boolean;
      notes: string[];
    }
  | {
      kind: 'repo';
      displayId: string;
      skills: Array<{ slug: string; name: string; author: string }>;
      registered: number;
      skipped: number;
      notes: string[];
    }
  | { kind: 'none'; displayId: string; notes: string[] };

export interface RegisterResponse {
  skill?: SkillDetails;
  created?: boolean;
  skills?: Array<{ slug: string; name: string; author: string }>;
  registered?: number;
  skipped?: number;
}

/** Skill detail endpoint, optionally pinned to a source identity. */
export function buildSkillEndpoint(slug: string, identity?: { repo: string; path: string }): string {
  const endpoint = `/api/skills/${encodeURIComponent(slug)}`;
  if (!identity) return endpoint;

  const query = new URLSearchParams({ repo: identity.repo, path: identity.path });
  return `${endpoint}?${query.toString()}`;
}

/**
 * Only a multi-file listing can be discovery-only, so only then is the release
 * listing asked whether a published release exists.
 */
export async function skillResult(
  detail: SkillDetailResponse,
  displayId: string,
  registered: boolean,
  notes: string[],
): Promise<ResolvedSkill> {
  const multiFile = (detail.references?.length ?? 0) + (detail.scripts?.length ?? 0) > 0;
  const releaseExists = multiFile ? await hasPublishedRelease(displayId) : false;
  return { kind: 'skill', displayId, registered, detail, releaseExists, notes };
}

/**
 * The register response carries the skill row only, so its references and
 * scripts come from the detail endpoint. If that read fails, the row is
 * shown without them (and so without the discovery-only label).
 */
export async function registerResult(res: RegisterResponse, displayId: string, notes: string[]): Promise<ResolvedSkill> {
  if (res.skill) {
    let detail: SkillDetailResponse;
    try {
      detail = await apiRequest<SkillDetailResponse>(buildSkillEndpoint(res.skill.slug));
    } catch {
      detail = { skill: res.skill };
    }
    return skillResult(detail, displayId, res.created === true, notes);
  }
  if (res.skills && res.skills.length > 0) {
    return { kind: 'repo', displayId, skills: res.skills, registered: res.registered ?? 0, skipped: res.skipped ?? 0, notes };
  }
  return { kind: 'none', displayId, notes };
}
