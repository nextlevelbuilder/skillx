/**
 * FTS5 (Full-Text Search) module for keyword-based search.
 * Uses SQLite FTS5 virtual table with weighted BM25 ranking (name 10x, desc 5x, content 1x).
 * Supports pre-filtering by category/is_paid and OR-based prefix matching.
 *
 * NOTE: D1 FTS5 does not support parenthesized OR groups combined with implicit AND
 * (e.g. "(a OR b) c" silently fails). We use OR-joined prefix terms instead.
 * Semantic matching (abbreviations, synonyms) is handled by vector search.
 */

export interface FTS5Result {
  skill_id: string;
  bm25_score: number;
  rank: number;
}

export interface FTS5Filters {
  category?: string;
  is_paid?: boolean;
}

/** Convert user query to FTS5 OR-joined prefix query.
 *  Anything but a Unicode letter, number or underscore separates terms, so
 *  "end-to-end" is three terms (not "endtoend") and non-ASCII words survive.
 *  Terms are lowercased (the tokenizer is case-insensitive) so a user's
 *  "NOT", "AND", "OR" or "NEAR" is never read as an FTS5 operator.
 *  Example: "ui ux" → "ui* OR ux*"
 *  Example: "Node.js end-to-end" → "node* OR js* OR end* OR to* OR end*"
 *  Returns "" when the query has no searchable term. */
export function toFts5Query(query: string): string {
  return query
    .replace(/[^\p{L}\p{N}_\s]/gu, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((term) => `${term}*`)
    .join(' OR ');
}

/**
 * Search skills using FTS5 full-text search with weighted BM25 ranking.
 * Supports optional category/is_paid pre-filters and prefix matching.
 *
 * @param db - D1 Database instance
 * @param query - Search query string
 * @param limit - Maximum number of results to return (default: 20)
 * @param filters - Optional category and is_paid filters pushed to SQL WHERE
 * @returns Array of FTS5 search results with BM25 scores
 */
export async function fts5Search(
  db: D1Database,
  query: string,
  limit = 20,
  filters?: FTS5Filters
): Promise<FTS5Result[]> {
  // OR-joined prefix query with FTS5 syntax stripped — vector search handles semantic expansion
  const matchQuery = toFts5Query(query);

  if (!matchQuery) {
    return [];
  }

  try {

    // Build dynamic SQL with optional pre-filters
    let sql = `
      SELECT s.id as skill_id, bm25(skills_fts, 10.0, 5.0, 1.0) as bm25_score
      FROM skills_fts
      JOIN skills s ON skills_fts.rowid = s.rowid
      WHERE skills_fts MATCH ?1
    `;
    const params: (string | number)[] = [matchQuery];
    let paramIdx = 2;

    if (filters?.category) {
      sql += ` AND s.category = ?${paramIdx}`;
      params.push(filters.category);
      paramIdx++;
    }

    if (filters?.is_paid !== undefined) {
      sql += ` AND s.is_paid = ?${paramIdx}`;
      params.push(filters.is_paid ? 1 : 0);
      paramIdx++;
    }

    sql += ` ORDER BY bm25(skills_fts, 10.0, 5.0, 1.0) LIMIT ?${paramIdx}`;
    params.push(limit);

    const stmt = db.prepare(sql);
    const results = await stmt
      .bind(...params)
      .all<{ skill_id: string; bm25_score: number }>();

    return (results.results || []).map((r, i) => ({
      skill_id: r.skill_id,
      bm25_score: r.bm25_score,
      rank: i + 1,
    }));
  } catch (error) {
    console.error('FTS5 search error:', error);
    return [];
  }
}
