/**
 * The single compatibility engine.
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

import { satisfiesRange } from "../semver-range";
import type { VerificationEvidence } from "../verification-evidence";
import type {
  CompatibilityContext,
  CompatibilityStatus,
  CompatibilityTarget,
  NormalizedCompatibility,
} from "./types";
import { normalizeRequirement } from "./validate";

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

  const result: NormalizedCompatibility = {
    runtime: target.runtime,
    status: "unknown",
    versions: declaration?.versions ?? null,
    scopes: declaration?.scopes ? [...declaration.scopes] : [],
    requirements: (declaration?.requires ?? []).map(normalizeRequirement),
    evidence: matched,
    reasons: [],
  };

  if (!declaration) {
    result.reasons.push({
      code: "COMPAT_DECLARATION_MISSING",
      message: `No compatibility declaration for '${target.runtime}'.`,
    });
    return result;
  }

  if (declaration.status === "unsupported") {
    result.status = "unsupported";
    result.reasons.push({
      code: "COMPAT_DECLARATION_UNSUPPORTED",
      message: `'${target.runtime}' is explicitly unsupported.`,
    });
    return result;
  }

  if (target.version && declaration.versions) {
    const satisfied = satisfiesRange(target.version, declaration.versions);
    if (satisfied === null) {
      result.status = "blocked";
      result.reasons.push({
        code: "COMPAT_RANGE_UNPARSEABLE",
        message: `Cannot evaluate range '${declaration.versions}' for '${target.runtime}'.`,
        detail: declaration.versions,
      });
      return result;
    }
    if (!satisfied) {
      result.status = "blocked";
      result.reasons.push({
        code: "COMPAT_RANGE_MISMATCH",
        message: `Version ${target.version} does not satisfy '${declaration.versions}'.`,
        detail: declaration.versions,
      });
      return result;
    }
  }

  const available = new Set(target.capabilities ?? []);
  const missing = result.requirements.filter((entry) => !entry.optional && !available.has(entry.capability));
  if (target.capabilities && missing.length > 0) {
    result.status = "blocked";
    for (const entry of missing) {
      result.reasons.push({
        code: "COMPAT_CAPABILITY_MISSING",
        message: `Required capability '${entry.capability}' is not available.`,
        detail: entry.capability,
      });
    }
    return result;
  }

  if (matched) {
    result.status = "verified";
    result.reasons.push({
      code: "COMPAT_EVIDENCE_PRESENT",
      message: `Verified by '${matched.probeId}' against digest ${matched.releaseDigest}.`,
    });
    return result;
  }

  result.status = "declared";
  result.reasons.push({
    code: "COMPAT_EVIDENCE_ABSENT",
    message: "Publisher declared support; no verification evidence matched this release digest.",
  });
  if (digestMismatch) {
    result.reasons.push({
      code: "COMPAT_EVIDENCE_DIGEST_MISMATCH",
      message: "Evidence exists for this harness but not for this release digest.",
    });
  }
  return result;
}
