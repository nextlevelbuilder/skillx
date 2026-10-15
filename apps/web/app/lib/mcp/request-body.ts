/**
 * Bounded request body reader for the MCP endpoint.
 *
 * One JSON-RPC message for a read-only tool call is a few hundred bytes, so the
 * cap is generous for real clients and small enough that an anonymous caller
 * cannot make the worker buffer an arbitrarily large body. The declared
 * `Content-Length` is checked first, then the cap is enforced on the bytes
 * actually read, because the header can be absent or wrong.
 */

/** Largest accepted MCP request body, in bytes. */
export const MAX_MCP_BODY_BYTES = 64 * 1024;

export type BodyReadOutcome = { ok: true; text: string } | { ok: false; reason: "too_large" | "unreadable" };

export async function readBoundedBody(request: Request, maxBytes = MAX_MCP_BODY_BYTES): Promise<BodyReadOutcome> {
  const declared = request.headers.get("Content-Length");
  if (declared !== null) {
    const length = Number(declared);
    if (Number.isFinite(length) && length > maxBytes) return { ok: false, reason: "too_large" };
  }
  if (request.body === null) return { ok: true, text: "" };

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        void reader.cancel().catch(() => undefined);
        return { ok: false, reason: "too_large" };
      }
      chunks.push(value);
    }
  } catch {
    return { ok: false, reason: "unreadable" };
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { ok: true, text: new TextDecoder().decode(bytes) };
}
