import { apiRequest } from './api-client.js';

export interface CompatibilitySummary {
  runtime: string;
  status: string;
  versions: string | null;
  reasonCodes: string[];
  verifiedAt: string | null;
  probeId: string | null;
}

export interface SearchResult {
  slug: string;
  name: string;
  author: string;
  category: string;
  avg_rating: number | null;
  description: string;
  compatibility?: CompatibilitySummary[];
}

/**
 * What a `--compatible` run did, so a caller never has to guess why the page is
 * short. `undecided` counts listings that declare nothing, which is not support.
 */
export interface CompatibilityFilterReport {
  runtime: string;
  evaluated: number;
  matched: number;
  undecided: number;
  refused: number;
  poolExhausted: boolean;
}

export interface SearchOutcome {
  results: SearchResult[];
  compatibilityFilter?: CompatibilityFilterReport;
  note?: string;
}

interface SearchResponse {
  results?: SearchResult[];
  count?: number;
  compatibilityFilter?: CompatibilityFilterReport;
  note?: string;
}

export interface SearchOptions {
  /** Runtime name; `runtime@version` is accepted and the version is not evaluated. */
  compatible?: string;
  limit?: number;
}

/** Search the SkillX API and return the page plus any filter report. */
export async function searchSkills(query: string, options: SearchOptions = {}): Promise<SearchOutcome> {
  const body: Record<string, unknown> = { query };
  if (options.compatible) body.compatible = options.compatible;
  if (options.limit) body.limit = options.limit;

  const response = await apiRequest<SearchResponse>('/api/search', {
    method: 'POST',
    body: JSON.stringify(body),
  });

  return {
    results: response.results ?? [],
    ...(response.compatibilityFilter ? { compatibilityFilter: response.compatibilityFilter } : {}),
    ...(response.note ? { note: response.note } : {}),
  };
}
