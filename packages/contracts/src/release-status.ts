/**
 * `skillx.release-status/v1` signed release status contract.
 *
 * The `skillx.release/v1` manifest is signed once and never changes. The
 * mutable lifecycle state of that release (published, yanked, quarantined,
 * ...) is a separate document, signed with the same canonical-bytes and
 * Ed25519 rules (`release-signature.ts`). A status names exactly one release
 * by `manifestDigest` (`releaseManifestDigest`), because the same tree
 * (`releaseDigest`) may be released under several identities or versions.
 *
 * Each new status for a release carries a strictly higher `sequence`, tracked
 * per `manifestDigest`, so a consumer that keeps the last status it accepted
 * for that manifest can reject a replayed older one:
 *
 * - a status whose `sequence` is lower than the last accepted one is a
 *   rollback (`status.rollback`);
 * - a status with the same `sequence` but different signed bytes is a
 *   conflict (`status.conflict`); an identical re-fetch is accepted;
 * - a `state` outside `RELEASE_STATES` fails closed (`status.unknown_state`),
 *   even when correctly signed, so an older consumer never guesses.
 *
 * Validators never throw on malformed input.
 */

import { canonicalJsonBytes } from "./canonical-json";
import { RELEASE_STATES, isReleaseState } from "./package-manifest";
import type { ReleaseState } from "./package-manifest";
import {
  RELEASE_SIGNATURE_ALGORITHM,
  ReleaseManifestError,
  checkFields,
  checkSignatureMembers,
  isReleaseTimestamp,
  signPayload,
  verifyPayload,
} from "./release-signature";
import type { ReleasePublicKeys } from "./release-signature";
import { isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

export const SKILLX_RELEASE_STATUS_SCHEMA_VERSION = "skillx.release-status/v1";
/** Maximum `reason` length in UTF-16 code units. */
export const RELEASE_STATUS_REASON_MAX_LENGTH = 512;

/** Status-specific failure codes, in addition to the signature codes. */
export const RELEASE_STATUS_CODES = {
  unknownState: "status.unknown_state",
  digestMismatch: "status.digest_mismatch",
  manifestMismatch: "status.manifest_mismatch",
  rollback: "status.rollback",
  conflict: "status.conflict",
} as const;

export interface UnsignedReleaseStatus {
  schemaVersion: typeof SKILLX_RELEASE_STATUS_SCHEMA_VERSION;
  /** The `releaseDigest` of the `skillx.release/v1` manifest this status describes. */
  releaseDigest: string;
  /** `releaseManifestDigest` of that manifest: names exactly one release. */
  manifestDigest: string;
  state: ReleaseState;
  /** Optional human-readable explanation, e.g. why a release was yanked. Omit the member when there is none. */
  reason?: string;
  issuedAt: string;
  /** Strictly increasing per `releaseDigest`, starting at 1. */
  sequence: number;
  keyId: string;
  signatureAlgorithm: typeof RELEASE_SIGNATURE_ALGORITHM;
}

export interface SkillxReleaseStatus extends UnsignedReleaseStatus {
  signature: string;
}

export interface ReleaseStatusVerifyOptions {
  /** The `releaseDigest` of the verified release manifest the status must describe. */
  releaseDigest: string;
  /** `releaseManifestDigest` of that verified manifest. */
  manifestDigest: string;
  /**
   * The status this consumer last accepted for the same `manifestDigest`, if
   * any. It must be a status this function accepted before; an invalid one,
   * or one for another manifest, throws.
   */
  previous?: SkillxReleaseStatus | null;
}

const STATUS_FIELDS = ["schemaVersion", "releaseDigest", "manifestDigest", "state", "issuedAt", "sequence", "keyId", "signatureAlgorithm"] as const;
const OPTIONAL_STATUS_FIELDS = ["reason"] as const;

function validateReason(reason: unknown, issues: ValidationIssue[]): void {
  if (typeof reason !== "string") {
    issues.push(issue("reason", "type", "must be a string when present"));
  } else if (reason.length === 0 || reason.length > RELEASE_STATUS_REASON_MAX_LENGTH) {
    issues.push(issue("reason", "length", `must be 1 to ${RELEASE_STATUS_REASON_MAX_LENGTH} characters`));
  } else if (/\p{Cc}|\p{Cs}/u.test(reason)) {
    issues.push(issue("reason", "format", "must not contain control characters or lone surrogates"));
  }
}

function collectIssues(input: unknown, requireSignature: boolean): ValidationIssue[] {
  if (!isPlainObject(input)) return [issue("", "type", "release status must be an object")];
  const issues: ValidationIssue[] = [];
  const required = requireSignature ? [...STATUS_FIELDS, "signature"] : STATUS_FIELDS;
  checkFields(input, required, "", SKILLX_RELEASE_STATUS_SCHEMA_VERSION, issues, OPTIONAL_STATUS_FIELDS);

  if (input.schemaVersion !== SKILLX_RELEASE_STATUS_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "unsupported_value", `must equal '${SKILLX_RELEASE_STATUS_SCHEMA_VERSION}'`));
  }
  for (const field of ["releaseDigest", "manifestDigest"] as const) {
    const value = input[field];
    if (field in input && (typeof value !== "string" || !RELEASE_DIGEST_PATTERN.test(value))) {
      issues.push(issue(field, "pattern", "must match sha256:<64 lowercase hex>"));
    }
  }
  if ("state" in input && !isReleaseState(input.state)) {
    issues.push(issue("state", RELEASE_STATUS_CODES.unknownState, `must be one of: ${RELEASE_STATES.join(", ")}`));
  }
  if ("reason" in input) validateReason(input.reason, issues);
  if (!isReleaseTimestamp(input.issuedAt)) {
    issues.push(issue("issuedAt", "format", "must be an RFC 3339 UTC timestamp with whole seconds, e.g. 2026-10-13T04:30:00Z"));
  }
  if (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 1) {
    issues.push(issue("sequence", "type", "must be a positive safe integer"));
  }
  checkSignatureMembers(input, requireSignature, issues);
  return issues;
}

/** Validates a signed `skillx.release-status/v1` document (structure only, not the signature). */
export function validateReleaseStatus(input: unknown): ValidationResult {
  const issues = collectIssues(input, true);
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** Validates a status before it is signed: every field except `signature`, which must be absent. */
export function validateUnsignedReleaseStatus(input: unknown): ValidationResult {
  const issues = collectIssues(input, false);
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** The exact bytes a status signature covers: the canonical JSON of the status without `signature`. */
export function releaseStatusSigningPayload(status: UnsignedReleaseStatus | SkillxReleaseStatus): Uint8Array<ArrayBuffer> {
  const { signature: _signature, ...payload } = status as Partial<SkillxReleaseStatus>;
  return canonicalJsonBytes(payload);
}

/** Signs a valid unsigned status. Throws `ReleaseManifestError` when the status or key is invalid. */
export async function signReleaseStatus(status: UnsignedReleaseStatus, privateKey: CryptoKey): Promise<SkillxReleaseStatus> {
  const result = validateUnsignedReleaseStatus(status);
  if (!result.valid) throw new ReleaseManifestError("invalid release status", result.issues);
  return { ...status, signature: await signPayload(releaseStatusSigningPayload(status), privateKey) };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

/**
 * Validates a signed status, binds it to `options.releaseDigest` and
 * `options.manifestDigest`, verifies its
 * signature against `publicKeys` and, when `options.previous` is given,
 * enforces the monotonic sequence. Fails closed on every malformed input, an
 * unknown state, an unknown or malformed key, a bad signature, a rollback or
 * a conflict; it never throws for `input`.
 */
export async function verifyReleaseStatus(
  input: unknown,
  publicKeys: ReleasePublicKeys,
  options: ReleaseStatusVerifyOptions,
): Promise<ValidationResult> {
  const structure = validateReleaseStatus(input);
  if (!structure.valid) return structure;
  const status = input as SkillxReleaseStatus;
  if (status.releaseDigest !== options.releaseDigest) {
    return validationFail([issue("releaseDigest", RELEASE_STATUS_CODES.digestMismatch, "does not describe the expected release tree")]);
  }
  if (status.manifestDigest !== options.manifestDigest) {
    return validationFail([
      issue("manifestDigest", RELEASE_STATUS_CODES.manifestMismatch, "describes another release manifest of the same tree"),
    ]);
  }
  const payload = releaseStatusSigningPayload(status);
  const failure = await verifyPayload(payload, status.signature, status.keyId, publicKeys);
  if (failure !== null) return validationFail([failure]);

  const previous = options.previous;
  if (previous === undefined || previous === null) return validationOk();
  const previousResult = validateReleaseStatus(previous);
  if (!previousResult.valid || previous.releaseDigest !== options.releaseDigest || previous.manifestDigest !== options.manifestDigest) {
    throw new ReleaseManifestError("previous status is not an accepted status of this release manifest", previousResult.issues);
  }
  if (status.sequence < previous.sequence) {
    return validationFail([
      issue("sequence", RELEASE_STATUS_CODES.rollback, `is lower than the last accepted sequence ${previous.sequence}`),
    ]);
  }
  if (status.sequence === previous.sequence && !sameBytes(payload, releaseStatusSigningPayload(previous))) {
    return validationFail([
      issue("sequence", RELEASE_STATUS_CODES.conflict, `differs from the accepted status with the same sequence ${previous.sequence}`),
    ]);
  }
  return validationOk();
}
