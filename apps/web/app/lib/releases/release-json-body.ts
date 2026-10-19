/**
 * Capped JSON object bodies of the release write APIs (state, provisioning,
 * personal kits). A body must be `application/json`: a cross-origin page can
 * send that only after a CORS preflight, which these routes never grant.
 */
import { ReleaseHttpError, releaseError } from "./release-http";

/** Largest accepted request body; a reason is at most 512 UTF-8 bytes. */
export const MAX_STATE_BODY_BYTES = 4096;

export const invalidRequest = (message: string) => releaseError(400, "invalid_request", message);

async function readCappedText(request: Request, maxBytes: number): Promise<string> {
  const type = (request.headers.get("Content-Type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (type !== "application/json") throw releaseError(415, "unsupported_media_type", "body must be application/json");
  const tooLarge = () => releaseError(413, "request_too_large", `body exceeds ${maxBytes} bytes`);
  if (Number(request.headers.get("Content-Length") ?? "0") > maxBytes) throw tooLarge();
  if (request.body === null) throw invalidRequest("body is required");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (let next = await reader.read(); !next.done; next = await reader.read()) {
    total += next.value.length;
    if (total > maxBytes) {
      await reader.cancel().catch(() => undefined);
      throw tooLarge();
    }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, at);
    at += chunk.length;
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw invalidRequest("body must be UTF-8 JSON");
  }
}

/**
 * Reads a capped `application/json` body that must be a JSON object holding
 * only `fields` (an unknown field is 400). Values are not checked here.
 * `maxBytes` defaults to the state API cap; other write APIs pass their own.
 */
export async function readJsonObject(request: Request, fields: ReadonlySet<string>, maxBytes = MAX_STATE_BODY_BYTES): Promise<Record<string, unknown>> {
  let body: unknown;
  try {
    body = JSON.parse(await readCappedText(request, maxBytes));
  } catch (error) {
    if (error instanceof ReleaseHttpError) throw error;
    throw invalidRequest("body must be a JSON object");
  }
  if (typeof body !== "object" || body === null || Array.isArray(body)) throw invalidRequest("body must be a JSON object");
  const record = body as Record<string, unknown>;
  const unknown = Object.keys(record).filter((key) => !fields.has(key));
  if (unknown.length > 0) throw invalidRequest(`unknown field: ${unknown.join(", ")}`);
  return record;
}
