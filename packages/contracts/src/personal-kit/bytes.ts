/**
 * Byte helpers of the personal-kit engine: strict base64, SHA-256 through
 * WebCrypto (no Node.js import, so Workers and browsers share the code) and
 * strict UTF-8 text detection. A file is text only when it is NUL-free,
 * valid UTF-8; everything else is binary and can only be replaced.
 */

const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export function encodeBase64(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!;
    const b = bytes[i + 1];
    const c = bytes[i + 2];
    out += ALPHABET[a >> 2]! + ALPHABET[((a & 3) << 4) | ((b ?? 0) >> 4)]!;
    out += b === undefined ? "=" : ALPHABET[((b & 15) << 2) | ((c ?? 0) >> 6)]!;
    out += c === undefined ? "=" : ALPHABET[c & 63]!;
  }
  return out;
}

/**
 * Decodes padded standard base64. Returns null for any other form
 * (whitespace, URL alphabet, missing padding, non-zero unused bits), so one
 * byte sequence has exactly one accepted text.
 */
export function decodeBase64(text: string): Uint8Array | null {
  if (!BASE64.test(text)) return null;
  const pad = text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0;
  const out = new Uint8Array((text.length / 4) * 3 - pad);
  let at = 0;
  for (let i = 0; i < text.length; i += 4) {
    const n = [0, 1, 2, 3].map((k) => (text[i + k] === "=" ? 0 : ALPHABET.indexOf(text[i + k]!)));
    const v = (n[0]! << 18) | (n[1]! << 12) | (n[2]! << 6) | n[3]!;
    if (at < out.length) out[at++] = (v >> 16) & 255;
    if (at < out.length) out[at++] = (v >> 8) & 255;
    if (at < out.length) out[at++] = v & 255;
  }
  return encodeBase64(out) === text ? out : null;
}

const HEX = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, "0"));

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>));
  let out = "";
  for (const b of digest) out += HEX[b]!;
  return out;
}

export const utf8 = (text: string) => new TextEncoder().encode(text);

const strict = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/** The text of NUL-free valid UTF-8 bytes, else null (binary). A BOM is kept as content. */
export function textOf(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return strict.decode(bytes);
  } catch {
    return null;
  }
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
