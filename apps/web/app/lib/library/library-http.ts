/**
 * `GET /api/v1/library?kind=skill|kit&q=&cursor=&limit=`: the caller's private
 * library (see `@skillx/contracts` `library`).
 *
 * Gate order is the release read API's: 404 while `SKILLX_RELEASES_API` is
 * off, then the credential (the web session, an unscoped account key, or a
 * scoped key holding `library:read`; any other key is `401 invalid_api_key`
 * and never falls back to the session), then `RELEASE_READ_LIMITER`, then
 * `401 auth.required` for anonymous. The caller always acts as the account
 * behind the credential: there is no way to name another account, and an
 * asset the caller may not read is absent from the page, never a 403, so the
 * listing is no existence oracle.
 *
 * Every answer varies on the credential and is `private, no-store`.
 */
import { LIBRARY_DEFAULT_LIMIT, LIBRARY_MAX_LIMIT, LIBRARY_QUERY_MAX_LENGTH, LIBRARY_SCHEMA, isLibraryKind } from "@skillx/contracts";
import type { LibraryKind, LibraryPage } from "@skillx/contracts";
import { KIT_API_DISABLED, personalKitsApiEnabled } from "~/lib/personal-kits/kit-http";
import { VARY_VIEWER, serveReleaseRead } from "~/lib/releases/release-read";
import type { ReadContext } from "~/lib/releases/release-read";
import { releaseError } from "~/lib/releases/release-http";
import { queryLibrary } from "./library-store";
import type { LibraryQuery } from "./library-store";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store", ...VARY_VIEWER };
/** Longest identity a cursor may carry (`@handle/name`, well under this). */
const CURSOR_NAME_MAX = 256;

const badRequest = (code: string, message: string) => releaseError(400, code, message);

export function encodeCursor(name: string, kind: LibraryKind): string {
  const bytes = new TextEncoder().encode(JSON.stringify([name, kind]));
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeCursor(raw: string): { name: string; kind: LibraryKind } {
  const invalid = () => badRequest("invalid_cursor", "cursor is not one returned by this API");
  if (!/^[A-Za-z0-9_-]{1,512}$/.test(raw)) throw invalid();
  try {
    const bytes = Uint8Array.from(atob(raw.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
    const parsed: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
    if (Array.isArray(parsed) && parsed.length === 2 && typeof parsed[0] === "string" && parsed[0].length > 0 && parsed[0].length <= CURSOR_NAME_MAX && isLibraryKind(parsed[1])) {
      return { name: parsed[0], kind: parsed[1] };
    }
  } catch {
    // fall through to the one refusal
  }
  throw invalid();
}

function parseLimit(raw: string | null): number {
  if (raw === null) return LIBRARY_DEFAULT_LIMIT;
  if (!/^\d{1,6}$/.test(raw) || Number(raw) < 1) throw badRequest("invalid_request", `limit must be an integer from 1 to ${LIBRARY_MAX_LIMIT}`);
  return Math.min(Number(raw), LIBRARY_MAX_LIMIT);
}

function parseQuery(url: URL, userId: string, includeKits: boolean): LibraryQuery {
  const kind = url.searchParams.get("kind");
  if (kind !== null && !isLibraryKind(kind)) throw badRequest("invalid_request", "kind must be skill or kit");
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  if (q.length > LIBRARY_QUERY_MAX_LENGTH) throw badRequest("invalid_request", `q must be at most ${LIBRARY_QUERY_MAX_LENGTH} characters`);
  const cursor = url.searchParams.get("cursor");
  return {
    userId,
    kind,
    q: q === "" ? null : q,
    after: cursor === null ? null : decodeCursor(cursor),
    limit: parseLimit(url.searchParams.get("limit")),
    includeKits,
  };
}

async function readLibrary(ctx: ReadContext, env: Env): Promise<Response> {
  if (ctx.userId === null) throw releaseError(401, "auth.required", "sign in, or send Authorization: Bearer <account API key>");
  const kitsOn = personalKitsApiEnabled(env as Env & { SKILLX_PERSONAL_KITS_API?: string });
  const query = parseQuery(new URL(ctx.request.url), ctx.userId, kitsOn);
  const { items, hasMore } = await queryLibrary(ctx.db, query);
  const last = items.at(-1);
  const page: LibraryPage = {
    schema: LIBRARY_SCHEMA,
    items,
    nextCursor: hasMore && last !== undefined ? encodeCursor(last.identity, last.kind) : null,
    // A disabled kit API is stated, not shown as an empty kit list.
    kits: kitsOn ? { status: "available" } : { status: "unavailable", code: KIT_API_DISABLED },
  };
  return Response.json(page, { headers: PRIVATE_NO_STORE });
}

export function serveLibrary(request: Request, env: Env): Promise<Response> {
  // The route has a loader only, so the framework answers every other method with 405.
  return serveReleaseRead(request, env, (ctx) => readLibrary(ctx, env));
}
