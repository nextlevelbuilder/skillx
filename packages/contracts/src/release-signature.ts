/**
 * Signature, key and timestamp rules shared by the signed SkillX release
 * documents (`skillx.release/v1` and `skillx.release-status/v1`).
 *
 * A document is signed with Ed25519 over the UTF-8 canonical JSON (see
 * `canonical-json.ts`) of every member except `signature`, so `keyId` and
 * `signatureAlgorithm` are signed too. The signature is the standard (padded)
 * base64 of the 64-byte Ed25519 signature, as in AgentKit's remote registry
 * manifests. WebCrypto `Ed25519` works in Workers, browsers and Node.js.
 *
 * Domain separation: there is no prefix before the payload. Every signed
 * payload holds its own `schemaVersion`, every verifier requires its one
 * schema version and rejects unknown members, and registry release keys sign
 * nothing but these two schemas, so a signature over one document type never
 * verifies as the other.
 *
 * Served documents are exactly `canonicalJson(document)`, signature included;
 * verifiers parse with `parseCanonicalJson`, which rejects any other bytes.
 */

import { CanonicalJsonError, canonicalJson, parseCanonicalJson } from "./canonical-json";
import { issue, validationFail } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";

export const RELEASE_SIGNATURE_ALGORITHM = "ed25519";
/** Same key ID rule as AgentKit remote registry manifests. */
export const RELEASE_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
/** RFC 3339 UTC timestamp with whole seconds, e.g. `2026-10-13T04:30:00Z`. */
export const RELEASE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/**
 * Padded standard base64 of a 64-byte Ed25519 signature. The last data
 * character carries 4 unused bits that must be zero, so each signature has
 * exactly one accepted text.
 */
export const RELEASE_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{85}[AQgw]==$/;

/**
 * Checks that `input` lies in the canonical JSON value space (plain objects,
 * dense arrays, non-negative safe integers, well-formed strings). Validators
 * call this first so that no later step can throw on programmatic input.
 */
export function checkCanonicalValue(input: unknown, issues: ValidationIssue[]): boolean {
  try {
    canonicalJson(input);
    return true;
  } catch (error) {
    if (!(error instanceof CanonicalJsonError)) throw error;
    issues.push(issue("", "type", `is outside the canonical JSON value space: ${error.message}`));
    return false;
  }
}

/**
 * Parses received document bytes for a verifier. Returns the value, or the
 * failed result with `code` (e.g. `release.non_canonical`) when the bytes are
 * not exactly the canonical JSON of their value.
 */
export function parseReceivedDocument(input: string | Uint8Array, code: string): { value: unknown } | ValidationResult {
  const parsed = parseCanonicalJson(input);
  return parsed.ok ? { value: parsed.value } : validationFail([issue("", code, `document ${parsed.reason}`)]);
}

/** Signature verification failure codes. */
export const RELEASE_SIGNATURE_CODES = {
  unknownKey: "signature.unknown_key",
  invalidKey: "signature.invalid_key",
  mismatch: "signature.mismatch",
} as const;

/** A key set: key ID to raw 32-byte Ed25519 public key. */
export type ReleasePublicKeys = ReadonlyMap<string, Uint8Array>;

const ED25519 = { name: "Ed25519" } as const;
const ED25519_PUBLIC_KEY_BYTES = 32;

/** Reports unknown and missing members of one object level of a `schema` document. */
export function checkFields(
  value: Record<string, unknown>,
  required: readonly string[],
  path: string,
  schema: string,
  issues: ValidationIssue[],
  optional: readonly string[] = [],
): void {
  const prefix = path === "" ? "" : `${path}.`;
  for (const key of Object.keys(value)) {
    if (!required.includes(key) && !optional.includes(key)) {
      issues.push(issue(`${prefix}${key}`, "unknown_field", `is not a ${schema} field`));
    }
  }
  for (const key of required) {
    if (!(key in value)) issues.push(issue(`${prefix}${key}`, "required", "is required"));
  }
}

/** `sha256:<64 lowercase hex>` of `bytes`, computed with WebCrypto. */
export async function sha256Digest(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return `sha256:${Array.from(digest, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

/** Milliseconds since the epoch of a valid release timestamp. */
export function timestampMs(value: string): number {
  return Date.parse(value);
}

export function isReleaseTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || !RELEASE_TIMESTAMP_PATTERN.test(value)) return false;
  const ms = Date.parse(value);
  // Round-tripping rejects calendar overflow such as 2026-02-30.
  return Number.isFinite(ms) && new Date(ms).toISOString() === `${value.slice(0, -1)}.000Z`;
}

/** Pushes the issues of the signed `keyId`, `signatureAlgorithm` and (when required) `signature` members. */
export function checkSignatureMembers(input: Record<string, unknown>, requireSignature: boolean, issues: ValidationIssue[]): void {
  if (typeof input.keyId !== "string" || !RELEASE_KEY_ID_PATTERN.test(input.keyId)) {
    issues.push(issue("keyId", "pattern", `must match ${RELEASE_KEY_ID_PATTERN.source}`));
  }
  if (input.signatureAlgorithm !== RELEASE_SIGNATURE_ALGORITHM) {
    issues.push(issue("signatureAlgorithm", "unsupported_value", `must equal '${RELEASE_SIGNATURE_ALGORITHM}'`));
  }
  if (requireSignature && "signature" in input) {
    if (typeof input.signature !== "string" || !RELEASE_SIGNATURE_PATTERN.test(input.signature)) {
      issues.push(issue("signature", "pattern", "must be padded base64 of a 64-byte Ed25519 signature"));
    }
  }
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** Thrown by `signReleaseManifest` and `signReleaseStatus` for an invalid document or key. */
export class ReleaseManifestError extends Error {
  readonly issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(issues.length === 0 ? message : `${message}: ${issues.map((i) => `${i.path} ${i.code}`).join(", ")}`);
    this.name = "ReleaseManifestError";
    this.issues = issues;
  }
}

/**
 * Signs `payload` and returns the padded base64 signature. Throws
 * `ReleaseManifestError` when the key cannot sign with Ed25519.
 */
export async function signPayload(payload: Uint8Array<ArrayBuffer>, privateKey: CryptoKey): Promise<string> {
  try {
    return toBase64(new Uint8Array(await crypto.subtle.sign(ED25519, privateKey, payload)));
  } catch (cause) {
    throw new ReleaseManifestError(`cannot sign with the given key: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
}

/**
 * Verifies a structurally valid signature over `payload`. Returns `null` on
 * success, otherwise the single failure issue. Never throws.
 */
export async function verifyPayload(
  payload: Uint8Array<ArrayBuffer>,
  signature: string,
  keyId: string,
  publicKeys: ReleasePublicKeys,
): Promise<ValidationIssue | null> {
  const raw = publicKeys.get(keyId);
  if (raw === undefined) return issue("keyId", RELEASE_SIGNATURE_CODES.unknownKey, `no trusted key ${JSON.stringify(keyId)}`);
  if (raw.length !== ED25519_PUBLIC_KEY_BYTES) {
    return issue("keyId", RELEASE_SIGNATURE_CODES.invalidKey, `key ${JSON.stringify(keyId)} is not 32 bytes`);
  }
  let verified = false;
  try {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(raw), ED25519, false, ["verify"]);
    verified = await crypto.subtle.verify(ED25519, key, fromBase64(signature), payload);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return issue("keyId", RELEASE_SIGNATURE_CODES.invalidKey, `key ${JSON.stringify(keyId)} is unusable: ${detail}`);
  }
  return verified ? null : issue("signature", RELEASE_SIGNATURE_CODES.mismatch, "signature does not verify for the canonical payload");
}
