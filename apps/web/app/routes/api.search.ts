/**
 * Search API endpoint — supports both API key and session authentication.
 *
 * POST /api/search with { query, category?, is_paid?, limit? }
 * GET  /api/search?q=... for the web UI.
 * Returns { results, count }
 *
 * Search execution (including the FTS5 fallback) lives in `search-executor.ts`,
 * which projects every row through the public DTO and the protected content
 * resolver.
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { authenticateRequest } from '~/lib/auth/authenticate-request';
import { executeSearch } from '~/lib/search/search-executor';
import type { SearchFilters } from '~/lib/search/hybrid-search';

interface SearchRequest {
  query: string;
  category?: string;
  is_paid?: boolean;
  limit?: number;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

function clampLimit(value: number | undefined): number {
  const requested = value && value > 0 ? value : DEFAULT_LIMIT;
  return Math.min(requested, MAX_LIMIT);
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

    const results = await executeSearch(env, {
      query: body.query,
      filters: { category: body.category, is_paid: body.is_paid },
      userId,
      limit: clampLimit(body.limit),
    });

    return Response.json({ results, count: results.length });
  } catch (error) {
    return searchFailed('Search API error', error);
  }
}

/** GET handler for the web UI search page (supports ?q= query param). */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  if (!query) {
    return Response.json({ results: [], count: 0 });
  }

  try {
    const userId = (await authenticateRequest(request, env))?.userId;
    const isPaidParam = url.searchParams.get('is_paid');
    const filters: SearchFilters = {
      category: url.searchParams.get('category') || undefined,
      is_paid: isPaidParam ? isPaidParam === 'true' : undefined,
    };
    const requestedLimit = Number.parseInt(url.searchParams.get('limit') ?? '', 10);

    const results = await executeSearch(env, {
      query,
      filters,
      userId,
      limit: clampLimit(Number.isNaN(requestedLimit) ? undefined : requestedLimit),
    });

    return Response.json({ results, count: results.length });
  } catch (error) {
    return searchFailed('Search loader error', error);
  }
}
