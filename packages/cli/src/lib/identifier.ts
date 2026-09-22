/**
 * Skill identifier parsing and resolution mapping.
 *
 * Pure: no network, no filesystem, no I/O. `use`, `inspect`, and `check` all
 * classify and map an identifier here, so a slug that resolves for one command
 * resolves for every command, and the three cannot drift apart.
 *
 * Resolution chain:
 * - spaces          -> search mode
 * - x/y/z           -> DB slug "x-z", fallback: register repo y with skill_path z
 * - x/y             -> DB slug "x-y", fallback: scan repo y
 * - single word     -> DB slug as typed, fallback: search
 */

export type IdentifierType = 'search' | 'three-part' | 'two-part' | 'slug';

export interface ParsedIdentifier {
  type: IdentifierType;
  parts: string[];
}

/** Parse identifier into type + parts. */
export function parseIdentifier(input: string): ParsedIdentifier {
  if (input.includes(' ')) return { type: 'search', parts: [input] };

  const slashParts = input.split('/');
  if (slashParts.length === 3) return { type: 'three-part', parts: slashParts };
  if (slashParts.length === 2) return { type: 'two-part', parts: slashParts };
  return { type: 'slug', parts: [input] };
}

export interface RegisterFallback {
  owner: string;
  repo: string;
  skill_path?: string;
  scan?: boolean;
}

/** How to resolve one identifier: which slug to try, and what to do on a miss. */
export interface Resolution {
  parsed: ParsedIdentifier;
  /** The identifier as typed, used in messages and as the display id. */
  displayId: string;
  /** Slug to look up, or `null` for search mode (there is no slug yet). */
  slug: string | null;
  registerFallback?: RegisterFallback;
  searchFallback?: boolean;
}

export function planResolution(input: string): Resolution {
  const parsed = parseIdentifier(input);
  const displayId = input;

  switch (parsed.type) {
    case 'search':
      return { parsed, displayId, slug: null };

    case 'three-part': {
      const [org, repo, skillName] = parsed.parts;
      return {
        parsed,
        displayId,
        slug: `${org}-${skillName}`.toLowerCase(),
        registerFallback: { owner: org, repo, skill_path: skillName },
      };
    }

    case 'two-part': {
      const [author, skillName] = parsed.parts;
      return {
        parsed,
        displayId,
        slug: `${author}-${skillName}`.toLowerCase(),
        registerFallback: { owner: author, repo: skillName, scan: true },
      };
    }

    default:
      return { parsed, displayId, slug: parsed.parts[0], searchFallback: true };
  }
}
