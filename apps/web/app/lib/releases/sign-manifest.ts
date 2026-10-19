/**
 * Registry countersigning of release manifests. A kit release is signed as
 * `skillx.release/v2` with its `provenance`; every other release stays
 * `skillx.release/v1`, so existing v1-only verifiers keep reading it. The Ed25519 key
 * is the Worker secret `SKILLX_REGISTRY_SIGNING_KEY` (base64 PKCS #8 DER) and
 * its published ID is `SKILLX_REGISTRY_SIGNING_KEY_ID`. The key is imported
 * non-extractable; no error, log line or response ever includes it.
 */
import {
  RELEASE_KEY_ID_PATTERN,
  RELEASE_SIGNATURE_ALGORITHM,
  SKILLX_RELEASE_SCHEMA_VERSION,
  SKILLX_RELEASE_SCHEMA_VERSION_V2,
  canonicalJsonBytes,
  signReleaseManifest,
} from "@skillx/contracts";
import type { ReleaseProvenance, SkillxReleaseManifest, UnsignedReleaseManifest, UnsignedReleaseManifestV1 } from "@skillx/contracts";
import { releaseError } from "./release-http";

export interface RegistrySigner {
  keyId: string;
  privateKey: CryptoKey;
}

export interface SigningEnv {
  SKILLX_REGISTRY_SIGNING_KEY?: string;
  SKILLX_REGISTRY_SIGNING_KEY_ID?: string;
}

function notConfigured() {
  // 503 without detail: the reason may hint at the secret's shape.
  return releaseError(503, "release.signing_unavailable", "release signing is not configured");
}

/** Imports the registry signing key from the Worker secrets. */
export async function loadRegistrySigner(env: SigningEnv): Promise<RegistrySigner> {
  const keyId = env.SKILLX_REGISTRY_SIGNING_KEY_ID?.trim() ?? "";
  const encoded = env.SKILLX_REGISTRY_SIGNING_KEY?.replace(/\s+/g, "") ?? "";
  if (!RELEASE_KEY_ID_PATTERN.test(keyId) || encoded === "") throw notConfigured();
  let der: Uint8Array<ArrayBuffer>;
  try {
    der = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
  } catch {
    throw notConfigured();
  }
  try {
    const privateKey = await crypto.subtle.importKey("pkcs8", der, { name: "Ed25519" }, false, ["sign"]);
    return { keyId, privateKey };
  } catch {
    throw notConfigured();
  } finally {
    der.fill(0);
  }
}

export type ManifestFields = Omit<UnsignedReleaseManifestV1, "schemaVersion" | "provenance" | "keyId" | "signatureAlgorithm" | "createdAt"> & {
  /** `kit` signs v2; `skillx` (or none) signs v1, whose provider is implicitly `skillx`. */
  provenance: ReleaseProvenance | null;
};

/** RFC 3339 UTC with whole seconds, as the manifest contract requires. */
export function releaseTimestamp(now: Date): string {
  return `${now.toISOString().slice(0, 19)}Z`;
}

/**
 * Builds, validates and signs the manifest. Returns the signed manifest and
 * the exact canonical bytes to store and serve.
 */
export async function signRelease(
  fields: ManifestFields,
  signer: RegistrySigner,
  now: Date,
): Promise<{ manifest: SkillxReleaseManifest; bytes: Uint8Array<ArrayBuffer> }> {
  const { provenance, ...members } = fields;
  const signing = { createdAt: releaseTimestamp(now), keyId: signer.keyId, signatureAlgorithm: RELEASE_SIGNATURE_ALGORITHM } as const;
  const unsigned: UnsignedReleaseManifest =
    provenance?.provider === "kit"
      ? { schemaVersion: SKILLX_RELEASE_SCHEMA_VERSION_V2, ...members, provenance, ...signing }
      : { schemaVersion: SKILLX_RELEASE_SCHEMA_VERSION, ...members, ...signing };
  const manifest = await signReleaseManifest(unsigned, signer.privateKey);
  return { manifest, bytes: canonicalJsonBytes(manifest) };
}
