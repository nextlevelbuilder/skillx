/**
 * Ingestion contracts: `import` and `publish` are different operations.
 *
 * `import` harvests content that already exists elsewhere (a GitHub SKILL.md)
 * into the catalog as a listing. `publish` creates an immutable release with a
 * digest. A listing never acquires a digest or version immutability, and a
 * release never acquires its bytes from a live remote at request time.
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { isPackageKind, RELEASE_STATES, SEMVER_PATTERN } from "./package-manifest";
import type { PackageKind, ReleaseChannel, ReleaseState } from "./package-manifest";
import { isReleaseDigest } from "./verification-evidence";

export const INGESTION_MODES = ["import", "publish"] as const;
export type IngestionMode = (typeof INGESTION_MODES)[number];

/**
 * A catalog listing: mutable, versioned only by convention, and backed by a live
 * remote source. Legacy `skills` rows are listings.
 */
export interface ListingImport {
  mode: "import";
  /** Where the content was harvested from, e.g. a github.com tree URL. */
  sourceUrl: string;
  /** Content fetched remotely; not tied to any digest. */
  fetchedAt: string;
}

/** An immutable release produced by the packer. */
export interface ReleasePublish {
  mode: "publish";
  packageName: string;
  version: string;
  kind: PackageKind;
  channel: ReleaseChannel;
  releaseState: ReleaseState;
  releaseDigest: string;
  artifactSize: number;
}

export type IngestionRecord = ListingImport | ReleasePublish;

export function isIngestionMode(value: unknown): value is IngestionMode {
  return typeof value === "string" && (INGESTION_MODES as readonly string[]).includes(value);
}

export function validateListingImport(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "listing import must be an object")]);
  }

  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(input.sourceUrl)) {
    issues.push(issue("sourceUrl", "required", "sourceUrl is required for an import"));
  } else if (!/^https?:\/\//.test(input.sourceUrl)) {
    issues.push(issue("sourceUrl", "pattern", "sourceUrl must be an absolute http(s) URL"));
  }
  if (!isNonEmptyString(input.fetchedAt)) {
    issues.push(issue("fetchedAt", "required", "fetchedAt is required for an import"));
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

export function validateReleasePublish(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "release publish must be an object")]);
  }

  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(input.version) || !SEMVER_PATTERN.test(input.version)) {
    issues.push(issue("version", "pattern", "version must be a semantic version"));
  }
  if (!isPackageKind(input.kind)) {
    issues.push(issue("kind", "unsupported_value", "kind is not a known package kind"));
  }
  if (!isReleaseStateValue(input.releaseState)) {
    issues.push(issue("releaseState", "unsupported_value", `must be one of: ${RELEASE_STATES.join(", ")}`));
  }
  if (!isReleaseDigest(input.releaseDigest)) {
    issues.push(issue("releaseDigest", "pattern", "must match sha256:<64 lowercase hex>"));
  }
  if (typeof input.artifactSize !== "number" || input.artifactSize < 0) {
    issues.push(issue("artifactSize", "type", "artifactSize must be a non-negative number"));
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

function isReleaseStateValue(value: unknown): value is ReleaseState {
  return typeof value === "string" && (RELEASE_STATES as readonly string[]).includes(value);
}

/** Only a published release may be produced by the packer/publish path. */
export function isPublishableState(state: ReleaseState): boolean {
  return state === "draft" || state === "quarantined";
}
