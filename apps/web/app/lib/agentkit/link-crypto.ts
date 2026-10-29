/**
 * AES-GCM sealing of the stored AgentKit refresh token. The key is derived
 * from `BETTER_AUTH_SECRET` with HKDF under its own label, so no new secret
 * is needed. Rotating that secret makes stored tokens unreadable, which reads
 * as a revoked link: the user links again.
 */
import { base64UrlDecode, base64UrlEncode } from "./access-token";

const INFO = new TextEncoder().encode("skillx agentkit-link refresh-token v1");

async function linkKey(secret: string): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "HKDF", hash: "SHA-256", salt: new Uint8Array(32), info: INFO },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** `v1.<iv>.<ciphertext>`, base64url; the user id is bound as associated data. */
export async function sealRefreshToken(secret: string, userId: string, token: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new TextEncoder().encode(token);
  const sealed = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: new TextEncoder().encode(userId) }, await linkKey(secret), data);
  return `v1.${base64UrlEncode(iv)}.${base64UrlEncode(new Uint8Array(sealed))}`;
}

/** The token, or null when it cannot be opened (other secret, other user, tampered). */
export async function openRefreshToken(secret: string, userId: string, sealed: string): Promise<string | null> {
  const [version, iv, body] = sealed.split(".");
  if (version !== "v1" || !iv || !body) return null;
  try {
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: base64UrlDecode(iv), additionalData: new TextEncoder().encode(userId) },
      await linkKey(secret),
      base64UrlDecode(body),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}
