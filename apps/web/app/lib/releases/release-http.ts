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

export function errorResponse(error: ReleaseHttpError): Response {
  return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
}

/** The flag-off answer: indistinguishable from an unknown route. */
export function notFoundResponse(): Response {
  return Response.json({ error: { code: "not_found", message: "Not found" } }, { status: 404 });
}
