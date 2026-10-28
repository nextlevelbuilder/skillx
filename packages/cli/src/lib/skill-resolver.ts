/**
 * Resolves what `skillx use <identifier>` refers to, without printing anything.
 *
 * Resolution chain:
 * - spaces → search mode, top hit
 * - x/y/z... (repo path) → identity lookup on repo + full path, fallback register from that path
 * - x/y (two-part) → DB lookup slug "x-y", fallback scan repo y for skills
 * - single word → DB lookup, fallback search
 * - `exact` → the identifier verbatim as a catalog slug; a miss is a 404, never a fallback
 *
 * The result is plain data, so `use --json` and the human renderer report the
 * same resolution. `notes` records the detours taken (a fallback search, the
 * top hit picked), which the human renderer prints and the envelope carries.
 */

import { apiRequest, ApiError } from './api-client.js';
import { searchSkills } from './search-api.js';
import { hasPublishedRelease } from './release-lookup.js';
import type { SkillDetailResponse, SkillDetails } from '../commands/use-display.js';

type IdentifierType = 'search' | 'repo-path' | 'two-part' | 'slug';

interface ParsedIdentifier {
  type: IdentifierType;
  parts: string[];
}

/** Source identity of an `org/repo/<skill path...>` identifier. */
export interface SourceTarget {
  /** Slug guess, used only when the server has no skill for the identity yet. */
  slug: string;
  identity: { repo: string; path: string };
}

/** Parse identifier into type + parts */
export function parseIdentifier(input: string): ParsedIdentifier {
  if (input.includes(' ')) return { type: 'search', parts: [input] };

  const slashParts = input.split('/');
  // org/repo/<skill path...>: the skill path can be several segments deep, so none of it is dropped
  if (slashParts.length >= 3) return { type: 'repo-path', parts: slashParts };
  if (slashParts.length === 2) return { type: 'two-part', parts: slashParts };
  return { type: 'slug', parts: [input] };
}

/**
 * Map `org/repo/<skill path...>` onto a full source identity. The last path segment is the
 * readable name; the whole path is kept so deep paths round-trip to the server.
 */
export function parseRepoPath(parts: string[]): SourceTarget {
  const [owner, repo, ...rest] = parts;
  const path = rest.join('/');
  const leaf = rest.length > 0 ? rest[rest.length - 1] : repo;

  return {
    slug: `${owner}-${leaf}`.toLowerCase(),
    identity: { repo: `${owner}/${repo}`, path },
  };
}

/** Skill detail endpoint, optionally pinned to a source identity. */
export function buildSkillEndpoint(slug: string, identity?: { repo: string; path: string }): string {
  const endpoint = `/api/skills/${encodeURIComponent(slug)}`;
  if (!identity) return endpoint;

  const query = new URLSearchParams({ repo: identity.repo, path: identity.path });
  return `${endpoint}?${query.toString()}`;
}

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

interface RegisterResponse {
  skill?: SkillDetails;
  created?: boolean;
  skills?: Array<{ slug: string; name: string; author: string }>;
  registered?: number;
  skipped?: number;
}

interface Fallback {
  registerFallback?: { owner: string; repo: string; skill_path?: string; scan?: boolean };
  searchFallback?: boolean;
  identity?: { repo: string; path: string };
}

type Progress = (text: string) => void;

export async function resolveSkill(
  identifier: string,
  options: { forceSearch?: boolean; exact?: boolean; progress?: Progress } = {},
): Promise<ResolvedSkill> {
  const progress = options.progress ?? (() => {});
  const notes: string[] = [];
  // No fallback: the 404 ApiError propagates, so an approved slug never resolves to another skill.
  if (options.exact) return bySlug(identifier, identifier, notes, progress, {});
  if (options.forceSearch) return searchTop(identifier, notes, progress);

  const parsed = parseIdentifier(identifier);
  switch (parsed.type) {
    case 'search':
      return searchTop(parsed.parts[0], notes, progress);
    case 'repo-path': {
      const [org, repo] = parsed.parts;
      const { slug, identity } = parseRepoPath(parsed.parts);
      return bySlug(slug, identifier, notes, progress, {
        identity,
        registerFallback: { owner: org, repo, skill_path: identity.path },
      });
    }
    case 'two-part': {
      const [author, skillName] = parsed.parts;
      return bySlug(`${author}-${skillName}`.toLowerCase(), identifier, notes, progress, {
        registerFallback: { owner: author, repo: skillName, scan: true },
      });
    }
    case 'slug':
      return bySlug(parsed.parts[0], identifier, notes, progress, { searchFallback: true });
  }
}

/** Core resolution: DB lookup with fallback to register or search */
async function bySlug(
  slug: string,
  displayId: string,
  notes: string[],
  progress: Progress,
  fallback: Fallback,
): Promise<ResolvedSkill> {
  progress(`Fetching skill: ${displayId}...`);
  try {
    const detail = await apiRequest<SkillDetailResponse>(buildSkillEndpoint(slug, fallback.identity));
    return skillResult(detail, displayId, false, notes);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;

    if (fallback.registerFallback) {
      progress('Skill not found. Scanning GitHub...');
      const res = await apiRequest<RegisterResponse>('/api/skills/register', {
        method: 'POST',
        body: JSON.stringify(fallback.registerFallback),
      });
      return registerResult(res, displayId, notes);
    }
    if (fallback.searchFallback) {
      notes.push(`Skill "${displayId}" not found, searching...`);
      return searchTop(displayId, notes, progress);
    }
    throw err;
  }
}

/**
 * Only a multi-file listing can be discovery-only, so only then is the release
 * listing asked whether a published release exists.
 */
async function skillResult(
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
async function registerResult(res: RegisterResponse, displayId: string, notes: string[]): Promise<ResolvedSkill> {
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

/** Search for a keyword and resolve the top result */
async function searchTop(query: string, notes: string[], progress: Progress): Promise<ResolvedSkill> {
  progress(`Searching for "${query}"...`);
  const { results } = await searchSkills(query);
  const top = results[0];
  if (!top) return { kind: 'none', displayId: query, notes };

  const topId = `${top.author}/${top.name}`;
  notes.push(`Top result for "${query}": ${topId}`);
  const resolved = await resolveSkill(topId, { progress });
  return { ...resolved, notes: [...notes, ...resolved.notes] };
}
