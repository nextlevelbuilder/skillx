/**
 * Normalized compatibility contract and the single compatibility engine.
 *
 * Every surface that reasons about support (search filters, web badges, API
 * responses, CLI checks, MCP tools, installer gating) must call
 * `normalizeCompatibility`. No surface may re-derive support from a raw
 * declaration, and nothing may resolve upward without evidence.
 *
 * Degradation rules:
 *   - no declaration for the runtime        -> `unknown`
 *   - explicit `unsupported` declaration    -> `unsupported`
 *   - required capability missing           -> `blocked`
 *   - version outside the declared range    -> `blocked`
 *   - unparseable range                     -> `blocked` (cannot decide, so do not claim support)
 *   - declaration + matching evidence       -> `verified`
 *   - declaration without evidence          -> `declared`
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { satisfiesRange } from "./semver-range";
import type { VerificationEvidence } from "./verification-evidence";

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

export function normalizeRequirement(input: string | CompatibilityRequirement): CompatibilityRequirement {
  return typeof input === "string" ? { capability: input } : { ...input };
}

export function validateCompatibilityDeclaration(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("compatible", "type", "compatible must be an object keyed by runtime")]);
  }

  const issues: ValidationIssue[] = [];
  for (const [runtime, value] of Object.entries(input)) {
    const path = `compatible.${runtime}`;
    if (!isPlainObject(value)) {
      issues.push(issue(path, "type", "runtime declaration must be an object"));
      continue;
    }
    if (value.status !== "declared" && value.status !== "unsupported") {
      issues.push(issue(`${path}.status`, "unsupported_value", "status must be 'declared' or 'unsupported'"));
    }
    if (value.versions !== undefined && !isNonEmptyString(value.versions)) {
      issues.push(issue(`${path}.versions`, "type", "versions must be a non-empty string"));
    }
    if (value.scopes !== undefined && !Array.isArray(value.scopes)) {
      issues.push(issue(`${path}.scopes`, "type", "scopes must be an array"));
    }
    if (value.requires !== undefined) {
      if (!Array.isArray(value.requires)) {
        issues.push(issue(`${path}.requires`, "type", "requires must be an array"));
      } else {
        value.requires.forEach((entry, index) => {
          const entryPath = `${path}.requires[${index}]`;
          if (typeof entry === "string") {
            if (!isNonEmptyString(entry)) {
              issues.push(issue(entryPath, "required", "capability name must not be empty"));
            }
            return;
          }
          if (!isPlainObject(entry) || !isNonEmptyString(entry.capability)) {
            issues.push(issue(entryPath, "required", "requirement must be a string or { capability } object"));
          }
        });
      }
    }
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** True only for statuses that can be installed on the target without extra evidence. */
export function isInstallable(status: CompatibilityStatus): boolean {
  return status === "declared" || status === "verified";
}

function findEvidence(
  evidence: VerificationEvidence[] | undefined,
  runtime: string,
  releaseDigest: string | undefined,
): { matched: VerificationEvidence | null; digestMismatch: boolean } {
  const forRuntime = (evidence ?? []).filter((entry) => entry.harness === runtime);
  if (forRuntime.length === 0) return { matched: null, digestMismatch: false };
  if (!releaseDigest) return { matched: forRuntime[0] ?? null, digestMismatch: false };

  const exact = forRuntime.find((entry) => entry.releaseDigest === releaseDigest);
  if (exact) return { matched: exact, digestMismatch: false };
  return { matched: null, digestMismatch: true };
}

export function normalizeCompatibility(
  target: CompatibilityTarget,
  context: CompatibilityContext = {},
): NormalizedCompatibility {
  const declaration = context.declaration?.[target.runtime];
  const { matched, digestMismatch } = findEvidence(context.evidence, target.runtime, context.releaseDigest);

  const base: NormalizedCompatibility = {
    runtime: target.runtime,
    status: "unknown",
    versions: declaration?.versions ?? null,
    scopes: declaration?.scopes ? [...declaration.scopes] : [],
    requirements: (declaration?.requires ?? []).map(normalizeRequirement),
    evidence: matched,
    reasons: [],
  };

  if (!declaration) {
    base.reasons.push({
      code: "COMPAT_DECLARATION_MISSING",
      message: `No compatibility declaration for '${target.runtime}'.`,
    });
    return base;
  }

  if (declaration.status === "unsupported") {
    base.status = "unsupported";
    base.reasons.push({
      code: "COMPAT_DECLARATION_UNSUPPORTED",
      message: `'${target.runtime}' is explicitly unsupported.`,
    });
    return base;
  }

  if (target.version && declaration.versions) {
    const satisfied = satisfiesRange(target.version, declaration.versions);
    if (satisfied === null) {
      base.status = "blocked";
      base.reasons.push({
        code: "COMPAT_RANGE_UNPARSEABLE",
        message: `Cannot evaluate range '${declaration.versions}' for '${target.runtime}'.`,
        detail: declaration.versions,
      });
      return base;
    }
    if (!satisfied) {
      base.status = "blocked";
      base.reasons.push({
        code: "COMPAT_RANGE_MISMATCH",
        message: `Version ${target.version} does not satisfy '${declaration.versions}'.`,
        detail: declaration.versions,
      });
      return base;
    }
  }

  const available = new Set(target.capabilities ?? []);
  const missing = base.requirements.filter((entry) => !entry.optional && !available.has(entry.capability));
  if (target.capabilities && missing.length > 0) {
    base.status = "blocked";
    for (const entry of missing) {
      base.reasons.push({
        code: "COMPAT_CAPABILITY_MISSING",
        message: `Required capability '${entry.capability}' is not available.`,
        detail: entry.capability,
      });
    }
    return base;
  }

  if (matched) {
    base.status = "verified";
    base.reasons.push({
      code: "COMPAT_EVIDENCE_PRESENT",
      message: `Verified by '${matched.probeId}' against digest ${matched.releaseDigest}.`,
    });
    return base;
  }

  base.status = "declared";
  base.reasons.push({
    code: "COMPAT_EVIDENCE_ABSENT",
    message: "Publisher declared support; no verification evidence matched this release digest.",
  });
  if (digestMismatch) {
    base.reasons.push({
      code: "COMPAT_EVIDENCE_DIGEST_MISMATCH",
      message: "Evidence exists for this harness but not for this release digest.",
    });
  }
  return base;
}
