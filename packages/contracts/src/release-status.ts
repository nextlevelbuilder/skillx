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
 * Freshness: every status expires. `expiresAt` is after `issuedAt` and at
 * most `RELEASE_STATUS_MAX_LIFETIME_SECONDS` (7 days) later; the registry
 * re-signs the current status at least daily, so a consumer that fetches
 * normally always holds an unexpired one. A verifier rejects a status whose
 * `expiresAt` is before the caller's `now` (`status.expired`). A consumer may
 * keep using an expired status only for content it already installed, never
 * to authorize a new resolution or install.
 *
 * Each new status for a release carries a strictly higher `sequence`, tracked
 * per `manifestDigest`, so a consumer that keeps the last status it accepted
 * for that manifest can reject a replayed older one:
 *
 * - a lower `sequence` than the last accepted one is a rollback
 *   (`status.rollback`);
 * - the same `sequence` with different signed bytes is a conflict
 *   (`status.conflict`); an identical re-fetch is accepted;
 * - a higher `sequence` must have a later `issuedAt`
 *   (`status.issued_at_regression`) and a state reachable by
 *   `RELEASE_STATE_TRANSITIONS` (`status.invalid_transition`);
 * - a `state` outside `RELEASE_STATES` fails closed (`status.unknown_state`),
 *   even when correctly signed, so an older consumer never guesses.
 *
 * Validators and verifiers never throw on any document input; invalid caller
 * options (`manifest`, `now`, `previous`) throw `ReleaseManifestError`.
 */

import { canonicalJsonBytes } from "./canonical-json";
import { RELEASE_STATES, isReleaseState } from "./package-manifest";
import type { ReleaseState } from "./package-manifest";
import { releaseManifestDigest, validateReleaseManifest } from "./release-manifest";
import type { SkillxReleaseManifest } from "./release-manifest";
import {
  RELEASE_SIGNATURE_ALGORITHM,
  ReleaseManifestError,
  checkCanonicalValue,
  checkFields,
  checkSignatureMembers,
  isReleaseTimestamp,
  parseReceivedDocument,
  signPayload,
  timestampMs,
  verifyPayload,
} from "./release-signature";
import type { ReleasePublicKeys } from "./release-signature";
import { isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

export const SKILLX_RELEASE_STATUS_SCHEMA_VERSION = "skillx.release-status/v1";
/** Maximum `reason` length in UTF-8 bytes. */
export const RELEASE_STATUS_REASON_MAX_BYTES = 512;
/** Maximum `expiresAt - issuedAt`: 7 days. */
export const RELEASE_STATUS_MAX_LIFETIME_SECONDS = 7 * 24 * 60 * 60;

/** Status-specific failure codes, in addition to the signature codes. */
export const RELEASE_STATUS_CODES = {
  nonCanonical: "status.non_canonical",
  unknownState: "status.unknown_state",
  invalidLifetime: "status.invalid_lifetime",
  digestMismatch: "status.digest_mismatch",
  manifestMismatch: "status.manifest_mismatch",
  issuedBeforeRelease: "status.issued_before_release",
  expired: "status.expired",
  rollback: "status.rollback",
  conflict: "status.conflict",
  issuedAtRegression: "status.issued_at_regression",
  invalidTransition: "status.invalid_transition",
} as const;

/** States a release's first status (`sequence` 1) may have. */
export const RELEASE_INITIAL_STATES: readonly ReleaseState[] = ["draft", "published"];

/**
 * Allowed state changes between consecutive statuses of one release. Every
 * state may repeat (the daily re-sign); nothing returns to `draft`.
 */
export const RELEASE_STATE_TRANSITIONS: Readonly<Record<ReleaseState, readonly ReleaseState[]>> = {
  draft: ["draft", "published"],
  published: ["published", "yanked", "quarantined"],
  yanked: ["yanked", "published"],
  quarantined: ["quarantined", "yanked"],
};

export interface UnsignedReleaseStatus {
  schemaVersion: typeof SKILLX_RELEASE_STATUS_SCHEMA_VERSION;
  /** The `releaseDigest` of the `skillx.release/v1` manifest this status describes. */
  releaseDigest: string;
  /** `releaseManifestDigest` of that manifest: names exactly one release. */
  manifestDigest: string;
  state: ReleaseState;
  /** Optional human-readable explanation, e.g. why a release was yanked. Omit the member when there is none. */
  reason?: string;
  /** Not before the manifest's `createdAt`. */
  issuedAt: string;
  /** After `issuedAt`, at most `RELEASE_STATUS_MAX_LIFETIME_SECONDS` later. */
  expiresAt: string;
  /** Strictly increasing per `manifestDigest`, starting at 1. */
  sequence: number;
  keyId: string;
  signatureAlgorithm: typeof RELEASE_SIGNATURE_ALGORITHM;
}

export interface SkillxReleaseStatus extends UnsignedReleaseStatus {
  signature: string;
}

export interface ReleaseStatusVerifyOptions {
  /** The verified `skillx.release/v1` manifest the status must describe. */
  manifest: SkillxReleaseManifest;
  /** The consumer's current time, compared with `expiresAt`. */
  now: Date;
  /**
   * The status this consumer last accepted for the same manifest, if any. It
   * must be a status this function accepted before; an invalid one, or one
   * for another manifest, throws.
   */
  previous?: SkillxReleaseStatus | null;
}

const STATUS_FIELDS = [
  "schemaVersion",
  "releaseDigest",
  "manifestDigest",
  "state",
  "issuedAt",
  "expiresAt",
  "sequence",
  "keyId",
  "signatureAlgorithm",
] as const;
const OPTIONAL_STATUS_FIELDS = ["reason"] as const;
const TIMESTAMP_FORMAT = "must be an RFC 3339 UTC timestamp with whole seconds, e.g. 2026-10-13T04:30:00Z";
/** Controls, format characters (including every bidi control), line and paragraph separators, surrogates. */
const FORBIDDEN_REASON_CHARACTERS = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}\p{Cs}]/u;
/** Longest chain of distinct transitions; a larger sequence gap allows nothing more. */
const MAX_TRANSITION_STEPS = 4;

function validateReason(reason: unknown, issues: ValidationIssue[]): void {
  if (typeof reason !== "string") {
    issues.push(issue("reason", "type", "must be a string when present"));
    return;
  }
  const bytes = new TextEncoder().encode(reason).length;
  if (bytes === 0 || bytes > RELEASE_STATUS_REASON_MAX_BYTES) {
    issues.push(issue("reason", "length", `must be 1 to ${RELEASE_STATUS_REASON_MAX_BYTES} UTF-8 bytes`));
  } else if (FORBIDDEN_REASON_CHARACTERS.test(reason)) {
    issues.push(issue("reason", "format", "must not contain control, format, bidi or line separator characters"));
  }
}

function validateLifetime(input: Record<string, unknown>, issues: ValidationIssue[]): void {
  const issuedOk = isReleaseTimestamp(input.issuedAt);
  const expiresOk = isReleaseTimestamp(input.expiresAt);
  // A missing member is already reported as `required`.
  if (!issuedOk && "issuedAt" in input) issues.push(issue("issuedAt", "format", TIMESTAMP_FORMAT));
  if (!expiresOk && "expiresAt" in input) issues.push(issue("expiresAt", "format", TIMESTAMP_FORMAT));
  if (!issuedOk || !expiresOk) return;
  const lifetime = (timestampMs(input.expiresAt as string) - timestampMs(input.issuedAt as string)) / 1000;
  if (lifetime <= 0 || lifetime > RELEASE_STATUS_MAX_LIFETIME_SECONDS) {
    issues.push(
      issue(
        "expiresAt",
        RELEASE_STATUS_CODES.invalidLifetime,
        `must be after issuedAt and at most ${RELEASE_STATUS_MAX_LIFETIME_SECONDS} seconds later`,
      ),
    );
  }
}

function collectIssues(input: unknown, requireSignature: boolean): ValidationIssue[] {
  if (!isPlainObject(input)) return [issue("", "type", "release status must be an object")];
  const issues: ValidationIssue[] = [];
  if (!checkCanonicalValue(input, issues)) return issues;
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
  const stateOk = isReleaseState(input.state);
  if ("state" in input && !stateOk) {
    issues.push(issue("state", RELEASE_STATUS_CODES.unknownState, `must be one of: ${RELEASE_STATES.join(", ")}`));
  }
  if ("reason" in input) validateReason(input.reason, issues);
  validateLifetime(input, issues);
  const sequencePresent = "sequence" in input;
  if (sequencePresent && (!Number.isSafeInteger(input.sequence) || (input.sequence as number) < 1)) {
    issues.push(issue("sequence", "type", "must be a positive safe integer"));
  } else if (input.sequence === 1 && stateOk && !RELEASE_INITIAL_STATES.includes(input.state as ReleaseState)) {
    issues.push(
      issue("state", RELEASE_STATUS_CODES.invalidTransition, `the first status must be one of: ${RELEASE_INITIAL_STATES.join(", ")}`),
    );
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

/** Whether `to` is reachable from `from` in at most `steps` transitions. */
export function isReachableState(from: ReleaseState, to: ReleaseState, steps: number): boolean {
  let frontier = new Set<ReleaseState>([from]);
  for (let i = 0; i < Math.min(steps, MAX_TRANSITION_STEPS); i++) {
    const next = new Set<ReleaseState>();
    for (const state of frontier) for (const target of RELEASE_STATE_TRANSITIONS[state]) next.add(target);
    if (next.has(to)) return true;
    frontier = next;
  }
  return false;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, i) => byte === b[i]);
}

function fail(path: string, code: string, message: string): ValidationResult {
  return validationFail([issue(path, code, message)]);
}

function checkPrevious(
  status: SkillxReleaseStatus,
  payload: Uint8Array,
  previous: SkillxReleaseStatus,
  manifestDigest: string,
): ValidationResult {
  const previousResult = validateReleaseStatus(previous);
  if (!previousResult.valid || previous.manifestDigest !== manifestDigest) {
    throw new ReleaseManifestError("previous status is not an accepted status of this release manifest", previousResult.issues);
  }
  if (status.sequence < previous.sequence) {
    return fail("sequence", RELEASE_STATUS_CODES.rollback, `is lower than the last accepted sequence ${previous.sequence}`);
  }
  if (status.sequence === previous.sequence) {
    return sameBytes(payload, releaseStatusSigningPayload(previous))
      ? validationOk()
      : fail("sequence", RELEASE_STATUS_CODES.conflict, `differs from the accepted status with the same sequence ${previous.sequence}`);
  }
  if (timestampMs(status.issuedAt) <= timestampMs(previous.issuedAt)) {
    return fail("issuedAt", RELEASE_STATUS_CODES.issuedAtRegression, `must be after the last accepted issuedAt ${previous.issuedAt}`);
  }
  if (!isReachableState(previous.state, status.state, status.sequence - previous.sequence)) {
    return fail(
      "state",
      RELEASE_STATUS_CODES.invalidTransition,
      `cannot follow ${previous.state} (sequence ${previous.sequence}) at sequence ${status.sequence}`,
    );
  }
  return validationOk();
}

/**
 * Verifies a received status document for `options.manifest`, in this order:
 * canonical bytes (`status.non_canonical`), structure (including
 * `status.unknown_state`, `status.invalid_lifetime` and the first-status
 * rule), `status.digest_mismatch`, `status.manifest_mismatch`,
 * `status.issued_before_release`, the signature, `status.expired` against
 * `options.now`, then, with `options.previous`, `status.rollback`,
 * `status.conflict`, `status.issued_at_regression` and
 * `status.invalid_transition`. Never throws for `document`; invalid options
 * throw `ReleaseManifestError`.
 */
export async function verifyReleaseStatus(
  document: string | Uint8Array,
  publicKeys: ReleasePublicKeys,
  options: ReleaseStatusVerifyOptions,
): Promise<ValidationResult> {
  const manifestResult = validateReleaseManifest(options.manifest);
  if (!manifestResult.valid) throw new ReleaseManifestError("manifest option is not a valid release manifest", manifestResult.issues);
  const now = options.now instanceof Date ? options.now.getTime() : Number.NaN;
  if (!Number.isFinite(now)) throw new ReleaseManifestError("now option must be a valid Date");
  const manifestDigest = await releaseManifestDigest(options.manifest);

  const parsed = parseReceivedDocument(document, RELEASE_STATUS_CODES.nonCanonical);
  if (!("value" in parsed)) return parsed;
  const structure = validateReleaseStatus(parsed.value);
  if (!structure.valid) return structure;
  const status = parsed.value as SkillxReleaseStatus;
  if (status.releaseDigest !== options.manifest.releaseDigest) {
    return fail("releaseDigest", RELEASE_STATUS_CODES.digestMismatch, "does not describe the expected release tree");
  }
  if (status.manifestDigest !== manifestDigest) {
    return fail("manifestDigest", RELEASE_STATUS_CODES.manifestMismatch, "describes another release manifest");
  }
  if (timestampMs(status.issuedAt) < timestampMs(options.manifest.createdAt)) {
    return fail("issuedAt", RELEASE_STATUS_CODES.issuedBeforeRelease, `is before the manifest createdAt ${options.manifest.createdAt}`);
  }
  const payload = releaseStatusSigningPayload(status);
  const failure = await verifyPayload(payload, status.signature, status.keyId, publicKeys);
  if (failure !== null) return validationFail([failure]);
  if (now > timestampMs(status.expiresAt)) {
    return fail("expiresAt", RELEASE_STATUS_CODES.expired, `expired at ${status.expiresAt}`);
  }

  const previous = options.previous;
  if (previous === undefined || previous === null) return validationOk();
  return checkPrevious(status, payload, previous, manifestDigest);
}
