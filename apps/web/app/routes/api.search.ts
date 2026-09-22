/**
 * Search API endpoint — supports both API key and session authentication.
 *
 * POST /api/search { query, category?, is_paid?, limit?, compatible? }
 * GET  /api/search?q=...&compatible=... for the web UI.
 * Returns { results, count, compatibilityFilter?, note? }
 *
 * Search execution (including the FTS5 fallback and the `compatible` filter)
 * lives in `search-executor.ts`, which projects every row through the public DTO
 * and the protected content resolver.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authenticateRequest } from '~/lib/auth/authenticate-request';
import { executeSearch } from '~/lib/search/search-executor';
import type { SearchOutcome } from '~/lib/search/search-executor';
import { parseCompatibilityFilter } from '~/lib/search/compatibility-filter';
import type { SearchFilters } from '~/lib/search/hybrid-search';

interface SearchRequest {
  query: string;
  category?: string;
  is_paid?: boolean;
  limit?: number;
  /** Runtime name, optionally `runtime@version`; the version is not evaluated here. */
  compatible?: string;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(value: number | undefined): number {
  const requested = value && value > 0 ? value : DEFAULT_LIMIT;
  return Math.min(requested, MAX_LIMIT);
}

/**
 * Serializes a search run.
 *
 * When the compatibility filter ran, its report travels with the page: a filter
 * that hides undecidable listings without saying so would make an agent believe
 * the catalog is smaller than it is.
 */
function searchResponse(outcome: SearchOutcome): Response {
  return Response.json({
    results: outcome.results,
    count: outcome.results.length,
    ...(outcome.compatibilityFilter ? { compatibilityFilter: outcome.compatibilityFilter } : {}),
    ...(outcome.note ? { note: outcome.note } : {}),
  });
}

function searchFailed(scope: string, error: unknown): Response {
  console.error(`${scope}:`, error);
  return Response.json(
    {
      error: 'Search failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    },
    { status: 500 },
  );
}

/** POST handler for search requests. */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const userId = (await authenticateRequest(request, env))?.userId;

    // SAFETY: request bodies are untrusted; every field is validated below.
    const body = (await request.json()) as SearchRequest;

    if (!body.query || typeof body.query !== 'string') {
      return Response.json(
        { error: 'Query parameter is required and must be a string' },
        { status: 400 },
      );
    }

    if (body.compatible !== undefined && typeof body.compatible !== 'string') {
      return Response.json(
        { error: 'compatible must be a runtime name, optionally runtime@version' },
        { status: 400 },
      );
    }

    const compatible = parseCompatibilityFilter(body.compatible);
    const outcome = await executeSearch(env, {
      query: body.query,
      filters: { category: body.category, is_paid: body.is_paid },
      userId,
      limit: clampLimit(body.limit),
      ...(compatible ? { compatible } : {}),
    });

    return searchResponse(outcome);
  } catch (error) {
    return searchFailed('Search API error', error);
  }
}

/** GET handler for the web UI search page (supports ?q= query param). */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const url = new URL(request.url);
    const query = url.searchParams.get('q');

    if (!query) {
      return Response.json({ results: [], count: 0 });
    }

    const userId = (await authenticateRequest(request, env))?.userId;
    const isPaidParam = url.searchParams.get('is_paid');
    const filters: SearchFilters = {
      category: url.searchParams.get('category') || undefined,
      is_paid: isPaidParam ? isPaidParam === 'true' : undefined,
    };
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);
    const compatible = parseCompatibilityFilter(url.searchParams.get('compatible'));

    const outcome = await executeSearch(env, {
      query,
      filters,
      userId,
      limit: clampLimit(Number.isNaN(requestedLimit) ? undefined : requestedLimit),
      ...(compatible ? { compatible } : {}),
    });

    return searchResponse(outcome);
  } catch (error) {
    return searchFailed('Search loader error', error);
  }
}
