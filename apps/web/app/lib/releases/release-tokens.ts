/**
 * Short-lived HMAC-SHA256 tokens of the release API: OIDC publish tokens and
 * signed artifact download URLs. One secret, `SKILLX_TOKEN_SECRET`, serves
 * both; every purpose derives its own key (`HMAC(secret, "skillx.token/" +
 * purpose)`), so a token minted for one purpose never verifies for another.
 *
 * Wire form: `base64url(JSON payload) "." base64url(mac)`. Every payload has
 * `exp` (Unix milliseconds); an expired token is invalid. Verification uses
 * `crypto.subtle.verify`, which compares in constant time.
 */

/** Secrets shorter than this are treated as unset, so a placeholder value never signs. */
export const MIN_TOKEN_SECRET_LENGTH = 32;

export type TokenPurpose = "oidc-publish" | "artifact-download";

const encoder = new TextEncoder();

function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64url(text: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  try {
    const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

/** The configured secret, or null when it is missing or too short. */
export function tokenSecret(env: { SKILLX_TOKEN_SECRET?: string }): string | null {
  const secret = env.SKILLX_TOKEN_SECRET ?? "";
  return secret.length >= MIN_TOKEN_SECRET_LENGTH ? secret : null;
}

async function purposeKey(secret: string, purpose: TokenPurpose): Promise<CryptoKey> {
  const root = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const derived = await crypto.subtle.sign("HMAC", root, encoder.encode(`skillx.token/${purpose}`));
  return crypto.subtle.importKey("raw", derived, { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function signToken(secret: string, purpose: TokenPurpose, payload: { exp: number } & Record<string, unknown>): Promise<string> {
  const body = base64url(encoder.encode(JSON.stringify(payload)));
  const mac = await crypto.subtle.sign("HMAC", await purposeKey(secret, purpose), encoder.encode(body));
  return `${body}.${base64url(new Uint8Array(mac))}`;
}

/** The payload of a valid, unexpired token of `purpose`, else null. */
export async function verifyToken(secret: string, purpose: TokenPurpose, token: string, now: Date): Promise<Record<string, unknown> | null> {
  if (token.length > 4096) return null;
  const [body, mac, extra] = token.split(".");
  if (body === undefined || mac === undefined || extra !== undefined) return null;
  const signature = fromBase64url(mac);
  const json = fromBase64url(body);
  if (signature === null || json === null) return null;
  const valid = await crypto.subtle.verify("HMAC", await purposeKey(secret, purpose), signature as Uint8Array<ArrayBuffer>, encoder.encode(body));
  if (!valid) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(json));
  } catch {
    return null;
  }
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  if (typeof record.exp !== "number" || record.exp <= now.getTime()) return null;
  return record;
}
