/**
 * HTTP failure shape of the release API. Every rejection is
 * `{ error: { code, message } }` with a stable `code`; callers branch on the
 * code, never on the message. Messages never carry key material.
 */

export class ReleaseHttpError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "ReleaseHttpError";
    this.status = status;
    this.code = code;
  }
}

export function releaseError(status: number, code: string, message: string): ReleaseHttpError {
  return new ReleaseHttpError(status, code, message);
}

/** Errors depend on the viewer and on mutable state, so no cache may keep them. */
const ERROR_HEADERS = { "Cache-Control": "no-store" };

export function errorResponse(error: ReleaseHttpError, headers: Record<string, string> = {}): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status, headers: { ...headers, ...ERROR_HEADERS } });
}

/**
 * The flag-off answer: the same JSON body as an unknown or unentitled
 * release, so no package or release state leaks. It is not the HTML 404 of
 * an unknown route, and other methods still get the framework's 405, so the
 * existence of the routes themselves is not hidden.
 */
export function notFoundResponse(): Response {
  return errorResponse(new ReleaseHttpError(404, "not_found", "Not found"));
}
