/**
 * Resolves what `skillx use <identifier>` refers to, without printing anything.
 *
 * Resolution chain:
 * - spaces → search mode, top hit
 * - x/y/z... (repo path) → identity lookup on repo + full path, fallback register from that path
 * - x/y (two-part) → DB lookup slug "x-y", fallback scan repo y for skills
 * - single word → DB lookup, fallback search
 * - `exact` → the identifier verbatim as a catalog slug; a miss is a 404 and an alias is
 *   refused, never a fallback
 *
 * The result is plain data, so `use --json` and the human renderer report the
 * same resolution. `notes` records the detours taken (a fallback search, the
 * top hit picked), which the human renderer prints and the envelope carries.
 */

import { apiRequest, ApiError } from './api-client.js';
import { CliError } from './output.js';
import { searchSkills } from './search-api.js';
import {
  buildSkillEndpoint,
  registerResult,
  skillResult,
  type RegisterResponse,
  type ResolvedSkill,
} from './skill-resolver-results.js';
import type { SkillDetailResponse } from '../commands/use-display.js';

export { buildSkillEndpoint, type ResolvedSkill } from './skill-resolver-results.js';

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
  if (options.exact) return byExactSlug(identifier, notes, progress);
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

/**
 * The slug endpoint only, with no fallback: a 404 ApiError propagates. The server also
 * answers an alias with its canonical skill, so a response for a different slug is
 * refused too; an approved slug never resolves to another one.
 */
async function byExactSlug(slug: string, notes: string[], progress: Progress): Promise<ResolvedSkill> {
  progress(`Fetching skill: ${slug}...`);
  const detail = await apiRequest<SkillDetailResponse>(buildSkillEndpoint(slug));
  const canonical = detail.skill?.slug;
  if (canonical !== slug) {
    throw new CliError('not_found', `${slug} is an alias of ${canonical}; rerun with the canonical slug`, {
      details: { requested: slug, canonical },
    });
  }
  return skillResult(detail, slug, false, notes);
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
