/**
 * Kit releases: `@agentkit/*` content published with metadata
 * `provenance: {provider: "kit", origin}` and signed as `skillx.release/v2`.
 * The name rules, the metadata member and the replay check live here; the
 * scoped key and active `agentkit` publisher are checked by release-auth.
 */
import { KIT_ORIGINS, PACKAGE_NAME_PATTERN, RELEASE_PROVIDERS, releaseProvenanceOf } from "@skillx/contracts";
import type { KitOrigin, ReleaseProvenance } from "@skillx/contracts";
import { ERROR_CODES, SkillTreeError, checkDirectoryAlias, checkPublisher } from "@skillx/skill-tree";
import { releaseError } from "./release-http";
import { readManifest, storageError } from "./release-read";

/** Maps a shared tree rule failure to its HTTP status: reserved names are 403, the rest 400. */
export function treeErrorToHttp(error: SkillTreeError) {
  const reserved = error.code === ERROR_CODES.identityReservedPublisher || error.code === ERROR_CODES.identityReservedAlias;
  return releaseError(reserved ? 403 : 400, error.code, error.message);
}

const KIT_DIR_PREFIX = "ak-";
const invalidMetadata = (message: string) => releaseError(400, "release.invalid_metadata", message);

/**
 * A kit release name: `@agentkit/*` only (else 400 `identity.invalid`). The
 * slug must not start with `ak-`: AgentKit maps a kit skill directory
 * `ak-<name>` to `@agentkit/<name>` (`kitIdentity`), so `@agentkit/ak-<name>`
 * would be a second identity for no directory the kit composes.
 */
export function parseKitReleaseName(scope: string, slug: string): { identity: string; handle: string; slug: string } {
  const identity = `${scope}/${slug}`;
  if (!PACKAGE_NAME_PATTERN.test(identity)) {
    throw releaseError(400, ERROR_CODES.identityInvalid, "package name must be @publisher/slug in lowercase");
  }
  if (slug.startsWith(KIT_DIR_PREFIX)) {
    throw releaseError(400, ERROR_CODES.identityInvalid, `kit release slugs omit the "${KIT_DIR_PREFIX}" directory prefix: use @agentkit/${slug.slice(KIT_DIR_PREFIX.length)}`);
  }
  try {
    checkPublisher(identity, "kit");
    checkDirectoryAlias(identity, slug);
  } catch (error) {
    if (error instanceof SkillTreeError) throw treeErrorToHttp(error);
    throw error;
  }
  return { identity, handle: scope.slice(1), slug };
}

/** The `provenance` metadata member; null (absent or provider `skillx`) means a v1 release. */
export function parseProvenance(value: unknown): ReleaseProvenance | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw invalidMetadata("provenance must be an object or null");
  const raw = value as Record<string, unknown>;
  const allowed = raw.provider === "kit" ? ["provider", "origin"] : ["provider"];
  const unknown = Object.keys(raw).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw invalidMetadata(`unknown provenance field: ${unknown.join(", ")}`);
  if (raw.provider === "skillx") return null;
  if (raw.provider !== "kit") throw invalidMetadata(`provenance.provider must be one of: ${RELEASE_PROVIDERS.join(", ")}`);
  if (typeof raw.origin !== "string" || !(KIT_ORIGINS as readonly string[]).includes(raw.origin)) {
    throw invalidMetadata(`provenance.origin must be one of: ${KIT_ORIGINS.join(", ")}`);
  }
  return { provider: "kit", origin: raw.origin as KitOrigin };
}

/**
 * Refuses a kit replay whose provenance differs from the stored signed
 * manifest, so a republish never silently reports success for an origin the
 * registry did not sign. The stored manifest is read with the bounded,
 * validating reader of the read API: a missing, oversized or corrupt one is
 * 500 `release.storage_inconsistent`, not an origin conflict.
 */
export async function assertSameKitProvenance(
  bucket: R2Bucket,
  existing: { manifestKey: string | null; releaseDigest: string },
  provenance: ReleaseProvenance,
  label: string,
): Promise<void> {
  if (existing.manifestKey === null) throw storageError(`${label} has no signed manifest`);
  const stored = releaseProvenanceOf(await readManifest(bucket, { manifestKey: existing.manifestKey, releaseDigest: existing.releaseDigest }));
  if (stored.provider === "kit" && provenance.provider === "kit" && stored.origin === provenance.origin) return;
  const origin = stored.provider === "kit" ? `kit origin ${stored.origin}` : "provider skillx";
  throw releaseError(409, "release.version_exists", `${label} already exists with ${origin}`);
}
