/**
 * Catalog-level compatibility resolution.
 *
 * Phase 0 stores compatibility declarations on an immutable release
 * (`package_releases.compatibility_json`). Every catalog row that exists today is
 * a legacy *listing*: it has no release, no artifact, and no digest, so a surface
 * built only on release declarations would answer `unknown` for the entire
 * catalog and every filter would be inert.
 *
 * This module owns the ONE precedence rule that bridges the two storage tiers, so
 * web, CLI, and MCP cannot each invent their own:
 *
 *   1. an immutable release declaration wins, and only it can reach `verified`;
 *   2. otherwise the listing declaration is used, which can reach at most
 *      `declared` because a listing has no digest to bind evidence to;
 *   3. neither present -> `unknown`.
 *
 * The engine still decides; this module only chooses the inputs. Phase 2 deletes
 * step 2 when the immutable registry lands, and that removal is local to here.
 */

import { normalizeCompatibility } from "./normalize";
import type {
  CompatibilityDeclarationMap,
  CompatibilityReasonCode,
  CompatibilityStatus,
  CompatibilityTarget,
  NormalizedCompatibility,
} from "./types";
import type { VerificationEvidence } from "../verification-evidence";

/** Which storage tier the declaration was read from. `null` means neither had one. */
export type DeclarationTier = "release" | "listing";

export interface CatalogCompatibilityInputs {
  /** Declaration on an immutable release, when the row has one. */
  releaseDeclaration?: CompatibilityDeclarationMap | null;
  /** Declaration on the mutable listing. */
  listingDeclaration?: CompatibilityDeclarationMap | null;
  /** True only when the row is backed by an immutable release. */
  hasRelease?: boolean;
  /** The release artifact digest. Required before any `verified` answer. */
  releaseDigest?: string | null;
  /** Persisted `release_verification_evidence` rows. */
  evidence?: VerificationEvidence[];
}

/**
 * Picks the declaration the engine should consume.
 *
 * A release declaration is only reachable when the row actually has a release;
 * passing one without `hasRelease` would let a surface claim release-grade
 * provenance it cannot prove.
 */
export function selectDeclaration(inputs: CatalogCompatibilityInputs): {
  declaration: CompatibilityDeclarationMap | undefined;
  tier: DeclarationTier | null;
} {
  if (inputs.hasRelease && inputs.releaseDeclaration) {
    return { declaration: inputs.releaseDeclaration, tier: "release" };
  }
  if (inputs.listingDeclaration) {
    return { declaration: inputs.listingDeclaration, tier: "listing" };
  }
  return { declaration: undefined, tier: null };
}

/**
 * Resolves one target against the catalog inputs.
 *
 * A listing-tier answer is deliberately given no release digest, so the engine
 * reports any evidence as `unbound` and the status cannot exceed `declared`.
 */
export function resolveCatalogCompatibility(
  target: CompatibilityTarget,
  inputs: CatalogCompatibilityInputs,
): NormalizedCompatibility {
  const { declaration, tier } = selectDeclaration(inputs);
  const digest = tier === "release" ? inputs.releaseDigest ?? undefined : undefined;

  return normalizeCompatibility(target, {
    ...(declaration ? { declaration } : {}),
    ...(inputs.evidence ? { evidence: inputs.evidence } : {}),
    ...(digest ? { releaseDigest: digest } : {}),
  });
}

/** Resolves every runtime named by the selected declaration. */
export function resolveDeclaredRuntimes(
  inputs: CatalogCompatibilityInputs,
): NormalizedCompatibility[] {
  const { declaration } = selectDeclaration(inputs);
  if (!declaration) return [];
  return Object.keys(declaration).map((runtime) => resolveCatalogCompatibility({ runtime }, inputs));
}

/** Compact per-runtime result carried on search rows and listing payloads. */
export interface CompatibilitySummary {
  runtime: string;
  status: CompatibilityStatus;
  versions: string | null;
  reasonCodes: CompatibilityReasonCode[];
  /** Present only for a digest-bound `verified` answer. */
  verifiedAt: string | null;
  probeId: string | null;
}

export function toCompatibilitySummary(result: NormalizedCompatibility): CompatibilitySummary {
  return {
    runtime: result.runtime,
    status: result.status,
    versions: result.versions,
    reasonCodes: result.reasons.map((reason) => reason.code),
    verifiedAt: result.status === "verified" ? result.evidence?.verifiedAt ?? null : null,
    probeId: result.status === "verified" ? result.evidence?.probeId ?? null : null,
  };
}

/**
 * True when an agent may act on this answer without further evidence.
 *
 * `unknown` is never actionable: absence of a declaration is not a claim of
 * support, and treating it as one is how an agent installs something that cannot
 * run.
 */
export function isCompatibilityActionable(status: CompatibilityStatus): boolean {
  return status === "declared" || status === "verified";
}
