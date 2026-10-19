/**
 * Read-only skill lookup shared by `inspect` and `check`.
 *
 * Both commands answer questions about a skill that already exists, so neither
 * registers or scans anything: a read must not mutate the catalog. Resolution
 * uses `use`'s identifier parsing and endpoint builder, so a slug (or source
 * identity) that `use` finds is the one `inspect` reports.
 *
 * The compatibility shapes here describe the API's JSON as received, so status
 * fields stay `string`. The decision about a status is never made here: it is
 * `isCompatibilityActionable` from `@skillx/contracts`, bundled into the CLI.
 */

import { COMPATIBILITY_STATUSES, isCompatibilityActionable, type CompatibilityStatus } from '@skillx/contracts';
import { apiRequest } from './api-client.js';
import { buildSkillEndpoint, parseIdentifier, parseRepoPath } from './skill-resolver.js';
import type { SkillReference, SkillScript } from '../commands/use-display.js';

export interface CompatibilityRequirement {
  capability: string;
  optional?: boolean;
}

export interface CompatibilityEvidence {
  harness: string;
  harnessVersion: string;
  probeId: string;
  verifiedAt: string;
  verifier: string;
  os?: string;
}

export interface CompatibilityReason {
  code: string;
  message: string;
  detail?: string;
}

/** The version-aware answer for one requested target. */
export interface CompatibilityAnswer {
  runtime: string;
  status: string;
  versions: string | null;
  scopes: string[];
  requirements: CompatibilityRequirement[];
  evidence: CompatibilityEvidence | null;
  reasons: CompatibilityReason[];
}

/** Compact per-runtime summary carried on listing payloads. */
export interface CompatibilitySummary {
  runtime: string;
  status: string;
  versions: string | null;
  reasonCodes: string[];
  verifiedAt: string | null;
  probeId: string | null;
}

export interface SkillCompatibility {
  declared: CompatibilitySummary[];
  target?: CompatibilityAnswer;
}

/**
 * The public detail payload.
 *
 * These are the fields the API returns after the protected boundary runs: the
 * boundary drops `content` and nothing else, so the metadata below is always
 * present and `content` is present only when the viewer may read it.
 */
export interface SkillMetadata {
  slug: string;
  name: string;
  description: string;
  author: string;
  category: string;
  version: string | null;
  source_url: string | null;
  install_command: string | null;
  risk_label: string | null;
  is_paid: boolean | null;
  price_cents: number | null;
  avg_rating: number | null;
  rating_count: number | null;
  install_count: number | null;
  favorite_count: number | null;
  net_votes: number | null;
  updated_at: string | number | null;
  content?: string;
}

export interface SkillInspection {
  skill: SkillMetadata;
  references?: SkillReference[];
  scripts?: SkillScript[];
  compatibility?: SkillCompatibility;
}

export interface InspectionResult {
  /** The slug actually queried, so a caller can log what it asked for. */
  slug: string;
  inspection: SkillInspection;
}

/**
 * Fetches one skill's public detail, optionally asking for a target answer.
 *
 * Only `declared` and `verified` mean a skill will run. `unknown` is the absence
 * of a declaration, which is why callers must read the reason codes rather than
 * treat a missing entry as permission.
 */
export async function fetchSkillInspection(
  identifier: string,
  target?: string,
): Promise<InspectionResult> {
  const { slug, identity } = resolveLookupTarget(identifier);
  const endpoint = buildSkillEndpoint(slug, identity);
  const query = target ? `${endpoint.includes('?') ? '&' : '?'}target=${encodeURIComponent(target)}` : '';
  const inspection = await apiRequest<SkillInspection>(`${endpoint}${query}`);

  return { slug, inspection };
}

/** Maps an identifier onto the slug (and source identity) `use` would query. */
function resolveLookupTarget(identifier: string): { slug: string; identity?: { repo: string; path: string } } {
  const parsed = parseIdentifier(identifier);

  switch (parsed.type) {
    case 'search':
      throw new Error(
        `"${identifier}" looks like a search phrase. Pass a slug, author/skill, or org/repo/skill.`,
      );
    case 'repo-path':
      return parseRepoPath(parsed.parts);
    case 'two-part':
      return { slug: `${parsed.parts[0]}-${parsed.parts[1]}`.toLowerCase() };
    default:
      return { slug: parsed.parts[0] };
  }
}

/** True when the API sent a status from the contract's vocabulary. */
function isKnownStatus(status: string | null | undefined): status is CompatibilityStatus {
  return (COMPATIBILITY_STATUSES as readonly string[]).includes(status ?? '');
}

/**
 * True when the answer permits action without further evidence. The rule is the
 * contract's; a status outside its vocabulary (or none) is never actionable.
 */
export function isActionable(status: string | null | undefined): boolean {
  return isKnownStatus(status) && isCompatibilityActionable(status);
}
