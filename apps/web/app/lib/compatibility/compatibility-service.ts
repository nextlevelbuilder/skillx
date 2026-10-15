/**
 * Web-side adapter over the shared compatibility engine.
 *
 * This module does not decide compatibility; it only loads persisted inputs and
 * delegates to `@skillx/contracts`. Search, detail, SSR, and later CLI/MCP all
 * funnel through the same engine so no surface can invent its own answer.
 */

import {
  normalizeCompatibility,
  validateCompatibilityDeclaration,
  type CompatibilityDeclarationMap,
  type CompatibilityTarget,
  type NormalizedCompatibility,
  type VerificationEvidence,
} from "@skillx/contracts";

/** Persisted release-level compatibility inputs. */
export interface CompatibilitySource {
  /** `package_releases.compatibility_json`. */
  declarationJson: string | null;
  /** `package_releases.artifact_digest`. */
  releaseDigest?: string | null;
}

/** Persisted `release_verification_evidence` row. */
export interface EvidenceRecord {
  release_digest: string;
  harness: string;
  harness_version: string;
  os?: string | null;
  probe_id: string;
  verified_at: Date | number | string;
  verifier: string;
}

/**
 * Tolerant parse of the persisted declaration.
 *
 * Malformed or absent JSON, or a declaration that fails the shared contract
 * validator (for example `{"agentkit": true}`), resolves to `undefined`, which the
 * engine reports as `unknown` — never as support. It never throws.
 */
export function parseDeclaration(declarationJson: string | null | undefined): CompatibilityDeclarationMap | undefined {
  if (!declarationJson) return undefined;
  try {
    const parsed: unknown = JSON.parse(declarationJson);
    if (!validateCompatibilityDeclaration(parsed).valid) return undefined;
    return parsed as CompatibilityDeclarationMap;
  } catch {
    return undefined;
  }
}

function toIsoString(value: Date | number | string): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") return new Date(value).toISOString();
  return value;
}

export function toVerificationEvidence(records: EvidenceRecord[]): VerificationEvidence[] {
  return records.map((record) => ({
    releaseDigest: record.release_digest,
    harness: record.harness,
    harnessVersion: record.harness_version,
    ...(record.os ? { os: record.os } : {}),
    probeId: record.probe_id,
    verifiedAt: toIsoString(record.verified_at),
    verifier: record.verifier,
  }));
}

export function resolveCompatibility(
  target: CompatibilityTarget,
  source: CompatibilitySource,
  evidenceRecords: EvidenceRecord[] = [],
): NormalizedCompatibility {
  return normalizeCompatibility(target, {
    declaration: parseDeclaration(source.declarationJson),
    evidence: toVerificationEvidence(evidenceRecords),
    ...(source.releaseDigest ? { releaseDigest: source.releaseDigest } : {}),
  });
}

/** Resolves one target per declared runtime, for detail payloads and badges. */
export function resolveAllDeclaredRuntimes(
  source: CompatibilitySource,
  evidenceRecords: EvidenceRecord[] = [],
): NormalizedCompatibility[] {
  const declaration = parseDeclaration(source.declarationJson);
  if (!declaration) return [];
  return Object.keys(declaration).map((runtime) => resolveCompatibility({ runtime }, source, evidenceRecords));
}
