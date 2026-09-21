/**
 * Search API endpoint - supports both API key and session authentication
 * POST /api/search with { query, category?, is_paid?, limit? }
 * Returns { results, count }
 */

import type { ActionFunctionArgs, LoaderFunctionArgs } from 'react-router';
import { getDb } from '~/lib/db';
import { apiKeys } from '~/lib/db/schema';
import { getSession } from '~/lib/auth/session-helpers';
import { hybridSearch } from '~/lib/search/hybrid-search';
import { fts5Search } from '~/lib/search/fts5-search';
import { fetchSkillRows, toSearchResult } from '~/lib/search/search-result-projection';
import type { SearchResult } from '~/lib/search/search-result-projection';
import { eq } from 'drizzle-orm';

interface SearchRequest {
  query: string;
  category?: string;
  is_paid?: boolean;
  limit?: number;
}

/**
 * Authenticate request via API key (Authorization: Bearer) or session
 * Returns userId if authenticated, null otherwise
 */
async function authenticateRequest(
  request: Request,
  env: Env
): Promise<string | null> {
  // Try API key auth first
  const authHeader = request.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const apiKey = authHeader.substring(7);

    // Hash the provided key
    const encoder = new TextEncoder();
    const data = encoder.encode(apiKey);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hash = Array.from(new Uint8Array(hashBuffer))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Look up key in database
    const db = getDb(env.DB);
    const [keyRecord] = await db
      .select()
      .from(apiKeys)
      .where(eq(apiKeys.key_hash, hash))
      .limit(1);

    if (keyRecord && !keyRecord.revoked_at) {
      // Update last_used_at timestamp
      await db
        .update(apiKeys)
        .set({ last_used_at: new Date() })
        .where(eq(apiKeys.id, keyRecord.id));

      return keyRecord.user_id;
    }
  }

  // Try session auth
  try {
    const session = await getSession(request, env);
    if (session?.user?.id) {
      return session.user.id;
    }
  } catch (error) {
    // Session auth failed, continue as anonymous
  }

  // Anonymous access is allowed for search
  return null;
}

/**
 * POST handler for search requests
 */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;

  try {
    // Authenticate (returns userId or null for anonymous)
    const userId = await authenticateRequest(request, env);

    // Parse request body
    const body: SearchRequest = await request.json();

    if (!body.query || typeof body.query !== 'string') {
      return Response.json(
        { error: 'Query parameter is required and must be a string' },
        { status: 400 }
      );
    }

    // Validate limit
    const limit = Math.min(body.limit || 20, 100); // Max 100 results

    // Execute hybrid search
    const db = getDb(env.DB);
    let results: SearchResult[] = [];

    try {
      results = await hybridSearch(
        db,
        env.DB,
        env.VECTORIZE,
        env.AI,
        body.query,
        {
          category: body.category,
          is_paid: body.is_paid,
        },
        userId || undefined,
        limit
      );
    } catch (vectorError) {
      console.error('Vectorize search failed, falling back to FTS5:', vectorError);

      // Fallback to FTS5-only search with filters
      const fts5Results = await fts5Search(env.DB, body.query, limit, {
        category: body.category,
        is_paid: body.is_paid,
      });

      // Project through the public DTO + protected content resolver
      const rows = await fetchSkillRows(db, fts5Results.map((r) => r.skill_id));
      results = fts5Results.flatMap((r, i) => {
        const row = rows.get(r.skill_id);
        return row
          ? [
              toSearchResult(
                row,
                { final_score: 1 / (60 + (i + 1)), rrf_score: 0, semantic_rank: null, keyword_rank: i + 1 },
                { userId }
              ),
            ]
          : [];
      });
    }

    return Response.json({
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search API error:', error);
    return Response.json(
      {
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET handler for web UI search page (supports ?q= query param)
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const query = url.searchParams.get('q');

  // If no query, return empty results
  if (!query) {
    return Response.json({ results: [], count: 0 });
  }

  try {
    // Authenticate (returns userId or null for anonymous)
    const userId = await authenticateRequest(request, env);

    // Get optional filters from query params
    const category = url.searchParams.get('category') || undefined;
    const isPaidParam = url.searchParams.get('is_paid');
    const is_paid = isPaidParam ? isPaidParam === 'true' : undefined;
    const limit = Math.min(
      parseInt(url.searchParams.get('limit') || '20', 10),
      100
    );

    // Execute hybrid search
    const db = getDb(env.DB);
    let results: SearchResult[] = [];

    try {
      results = await hybridSearch(
        db,
        env.DB,
        env.VECTORIZE,
        env.AI,
        query,
        { category, is_paid },
        userId || undefined,
        limit
      );
    } catch (vectorError) {
      console.error('Vectorize search failed, falling back to FTS5:', vectorError);

      // Fallback to FTS5-only search with filters
      const fts5Results = await fts5Search(env.DB, query, limit, {
        category,
        is_paid,
      });

      // Project through the public DTO + protected content resolver
      const rows = await fetchSkillRows(db, fts5Results.map((r) => r.skill_id));
      results = fts5Results.flatMap((r, i) => {
        const row = rows.get(r.skill_id);
        return row
          ? [
              toSearchResult(
                row,
                { final_score: 1 / (60 + (i + 1)), rrf_score: 0, semantic_rank: null, keyword_rank: i + 1 },
                { userId }
              ),
            ]
          : [];
      });
    }

    return Response.json({
      results,
      count: results.length,
    });
  } catch (error) {
    console.error('Search loader error:', error);
    return Response.json(
      {
        error: 'Search failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
