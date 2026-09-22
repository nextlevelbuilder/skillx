/**
 * Verification evidence contract.
 *
 * Evidence is what separates a publisher's `declared` claim from a SkillX
 * `verified` status. Evidence always binds to an exact release digest plus the
 * harness identity, so a publisher cannot self-assign verification.
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";

export const RELEASE_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;

export interface VerificationEvidence {
  /** Digest of the exact released artifact, e.g. `sha256:<64 lowercase hex>`. */
  releaseDigest: string;
  /** Harness or runtime name, e.g. `claude-code`. */
  harness: string;
  /** Harness version that was probed, e.g. `2.1.0`. */
  harnessVersion: string;
  /** Operating system the probe ran on, when it matters. */
  os?: string;
  /** Identifier of the test suite or probe that produced the evidence. */
  probeId: string;
  /** ISO-8601 timestamp of when the probe ran. */
  verifiedAt: string;
  /** Identity of the verifier (SkillX CI job or reviewer). */
  verifier: string;
}

export function isReleaseDigest(value: unknown): value is string {
  return typeof value === "string" && RELEASE_DIGEST_PATTERN.test(value);
}

function isIsoTimestamp(value: unknown): value is string {
  if (!isNonEmptyString(value)) return false;
  return /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
}

export function validateVerificationEvidence(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "verification evidence must be an object")]);
  }

  const issues: ValidationIssue[] = [];
  if (!isReleaseDigest(input.releaseDigest)) {
    issues.push(issue("releaseDigest", "pattern", "must match sha256:<64 lowercase hex>"));
  }
  if (!isNonEmptyString(input.harness)) {
    issues.push(issue("harness", "required", "harness (runtime name) is required"));
  }
  if (!isNonEmptyString(input.harnessVersion)) {
    issues.push(issue("harnessVersion", "required", "harnessVersion is required"));
  }
  if (!isNonEmptyString(input.probeId)) {
    issues.push(issue("probeId", "required", "probeId is required"));
  }
  if (!isIsoTimestamp(input.verifiedAt)) {
    issues.push(issue("verifiedAt", "format", "must be an ISO-8601 timestamp"));
  }
  if (!isNonEmptyString(input.verifier)) {
    issues.push(issue("verifier", "required", "verifier identity is required"));
  }
  if (input.os !== undefined && !isNonEmptyString(input.os)) {
    issues.push(issue("os", "type", "os must be a non-empty string when present"));
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** Evidence counts only for the exact release digest and harness it was produced against. */
export function evidenceMatchesRelease(
  evidence: VerificationEvidence,
  target: { releaseDigest: string; harness: string },
): boolean {
  return evidence.releaseDigest === target.releaseDigest && evidence.harness === target.harness;
}
