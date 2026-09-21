/**
 * Compatibility contract types and closed vocabularies.
 *
 * Every surface reads these; no surface may invent a status or a reason code.
 */

import type { VerificationEvidence } from "../verification-evidence";

export const COMPATIBILITY_STATUSES = ["declared", "verified", "unknown", "unsupported", "blocked"] as const;
export type CompatibilityStatus = (typeof COMPATIBILITY_STATUSES)[number];

export const COMPATIBILITY_REASON_CODES = [
  "COMPAT_DECLARATION_MISSING",
  "COMPAT_DECLARATION_UNSUPPORTED",
  "COMPAT_RANGE_UNPARSEABLE",
  "COMPAT_RANGE_MISMATCH",
  "COMPAT_CAPABILITY_MISSING",
  "COMPAT_EVIDENCE_PRESENT",
  "COMPAT_EVIDENCE_ABSENT",
  "COMPAT_EVIDENCE_DIGEST_MISMATCH",
] as const;
export type CompatibilityReasonCode = (typeof COMPATIBILITY_REASON_CODES)[number];

export interface CompatibilityReason {
  code: CompatibilityReasonCode;
  message: string;
  /** Extra context, e.g. the missing capability name. */
  detail?: string;
}

export interface CompatibilityRequirement {
  capability: string;
  optional?: boolean;
}

/** A publisher-authored declaration for one runtime. */
export interface RuntimeCompatibilityDeclaration {
  status: "declared" | "unsupported";
  /** Semver range the runtime version must satisfy. */
  versions?: string;
  scopes?: string[];
  /** Capability names, either bare strings or explicit requirement objects. */
  requires?: Array<string | CompatibilityRequirement>;
}

export type CompatibilityDeclarationMap = Record<string, RuntimeCompatibilityDeclaration>;

/** The resolved, machine-readable answer for one runtime target. */
export interface NormalizedCompatibility {
  runtime: string;
  status: CompatibilityStatus;
  versions: string | null;
  scopes: string[];
  requirements: CompatibilityRequirement[];
  evidence: VerificationEvidence | null;
  reasons: CompatibilityReason[];
}

export interface CompatibilityTarget {
  runtime: string;
  version?: string;
  capabilities?: string[];
}

export interface CompatibilityContext {
  declaration?: CompatibilityDeclarationMap;
  evidence?: VerificationEvidence[];
  /** When known, evidence must match this digest to count as verification. */
  releaseDigest?: string;
}
