/**
 * Test-only helpers for the signed cross-language release vectors. The keys
 * are derived from public seed texts, so they are reproducible and worthless
 * outside tests. Not exported from the package entry point.
 */

export const VECTOR_KEY_SEED_TEXT = "skillx.release/v1 test vector key; public, never trusted";
export const OTHER_VECTOR_KEY_SEED_TEXT = "skillx.release/v1 other test vector key; public, never trusted";

/** DER prefix of a PKCS #8 Ed25519 private key; the 32-byte seed follows. */
const PKCS8_ED25519_PREFIX = [0x30, 0x2e, 0x02, 0x01, 0x00, 0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70, 0x04, 0x22, 0x04, 0x20];

export interface VectorKey {
  privateKey: CryptoKey;
  seed: Uint8Array;
  publicKey: Uint8Array;
}

export interface VectorKeyDescription {
  keyId: string;
  seedText: string;
  seedHex: string;
  publicKeyHex: string;
  publicKeyBase64: string;
}

export const encoder = new TextEncoder();
export const decoder = new TextDecoder();
export const hex = (bytes: Uint8Array): string => Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
export const base64 = (bytes: Uint8Array): string => btoa(String.fromCharCode(...bytes));
export const fromBase64 = (text: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(text), (c) => c.charCodeAt(0));
const fromBase64Url = (text: string) => fromBase64(text.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(text.length / 4) * 4, "="));

export async function sha256(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", data));
}

/** Derives the Ed25519 key whose seed is the SHA-256 of `seedText`. */
export async function vectorKey(seedText: string): Promise<VectorKey> {
  const seed = await sha256(encoder.encode(seedText));
  const pkcs8 = new Uint8Array([...PKCS8_ED25519_PREFIX, ...seed]);
  const privateKey = await crypto.subtle.importKey("pkcs8", pkcs8, { name: "Ed25519" }, true, ["sign"]);
  const jwk = await crypto.subtle.exportKey("jwk", privateKey);
  return { privateKey, seed, publicKey: fromBase64Url(jwk.x ?? "") };
}

export function describeVectorKey(keyId: string, seedText: string, key: VectorKey): VectorKeyDescription {
  return { keyId, seedText, seedHex: hex(key.seed), publicKeyHex: hex(key.publicKey), publicKeyBase64: base64(key.publicKey) };
}

export function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The payload a Go implementation would get from encoding/json.Marshal-style HTML and line-separator escaping. */
export function goJsonStyle(payload: Uint8Array): Uint8Array<ArrayBuffer> {
  const text = decoder
    .decode(payload)
    .replace(/&/g, "\\u0026")
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(new RegExp(String.fromCodePoint(0x2028), "g"), "\\u2028");
  return encoder.encode(text);
}

/** Writes `data` as pretty JSON next to this package's fixtures (only when regenerating vectors). */
export async function writeVectorFile(fileName: string, data: unknown): Promise<void> {
  // A computed specifier keeps Node typings out of the Worker typecheck that also covers this file.
  const fsModule = "node:fs";
  const fs = (await import(/* @vite-ignore */ fsModule)) as { writeFileSync(path: URL, data: string): void };
  fs.writeFileSync(new URL(`../fixtures/${fileName}`, import.meta.url), `${JSON.stringify(data, null, 2)}\n`);
}

/** True when the vector files should be regenerated instead of compared. */
export const writeVectorsRequested =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env.SKILLX_WRITE_RELEASE_VECTORS === "1";
