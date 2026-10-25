import { LIBRARY_MAX_LIMIT, LIBRARY_QUERY_MAX_LENGTH, isLibraryKind, type LibraryItem, type LibraryKind, type LibraryKitsStatus, type LibraryPage } from '@skillx/contracts';
import { apiRequest } from './api-client.js';
import { withCliErrors } from './api-errors.js';
import { CliError } from './output.js';

export interface LibraryQuery {
  kind?: string;
  query?: string;
  limit?: string;
  cursor?: string;
}

export interface LibraryResult {
  items: LibraryItem[];
  /** Null once every page was read; with `--cursor` the cursor of the page after this one. */
  nextCursor: string | null;
  kits: LibraryKitsStatus;
}

const usage = (message: string) => new CliError('usage_error', message);

/** Validates the flags before any request; returns the query string parameters. */
export function libraryParams(options: LibraryQuery): { kind?: LibraryKind; q?: string; limit?: number; cursor?: string } {
  const params: { kind?: LibraryKind; q?: string; limit?: number; cursor?: string } = {};
  if (options.kind !== undefined) {
    if (!isLibraryKind(options.kind)) throw usage('--kind must be skill or kit');
    params.kind = options.kind;
  }
  if (options.query !== undefined) {
    if (options.query.length > LIBRARY_QUERY_MAX_LENGTH) throw usage(`--query is at most ${LIBRARY_QUERY_MAX_LENGTH} characters`);
    params.q = options.query;
  }
  if (options.limit !== undefined) {
    const limit = Number(options.limit);
    if (!/^\d+$/.test(options.limit) || limit < 1 || limit > LIBRARY_MAX_LIMIT) throw usage(`--limit must be an integer from 1 to ${LIBRARY_MAX_LIMIT}`);
    params.limit = limit;
  }
  if (options.cursor !== undefined) {
    if (options.cursor === '') throw usage('--cursor must not be empty');
    params.cursor = options.cursor;
  }
  return params;
}

const MAX_PAGES = 1000;

async function fetchPage(params: ReturnType<typeof libraryParams>): Promise<LibraryPage> {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) if (value !== undefined) search.set(key, String(value));
  const qs = search.toString();
  return withCliErrors(() => apiRequest<LibraryPage>(`/api/v1/library${qs ? `?${qs}` : ''}`));
}

/**
 * `GET /api/v1/library`. Without `--cursor` every page is read and merged;
 * with it exactly that page is returned together with its `nextCursor`.
 */
export async function listLibrary(options: LibraryQuery): Promise<LibraryResult> {
  const params = libraryParams(options);
  if (params.cursor !== undefined) {
    const page = await fetchPage(params);
    return { items: page.items, nextCursor: page.nextCursor, kits: page.kits };
  }
  const items: LibraryItem[] = [];
  const seen = new Set<string>();
  let kits: LibraryKitsStatus = { status: 'available' };
  for (let pages = 0; pages < MAX_PAGES; pages++) {
    const page = await fetchPage(params);
    items.push(...page.items);
    kits = page.kits;
    if (page.nextCursor === null) return { items, nextCursor: null, kits };
    if (seen.has(page.nextCursor)) throw new CliError('api_error', 'the library returned a repeating cursor');
    seen.add(page.nextCursor);
    params.cursor = page.nextCursor;
  }
  throw new CliError('api_error', `the library has more than ${MAX_PAGES} pages; narrow it with --kind or --query`);
}
