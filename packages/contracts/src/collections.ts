/**
 * Collection, offer, and entitlement contracts (Phase 0: contract level only).
 *
 * A collection is a recipe, not a redistribution archive. A paid collection may
 * reference paid packages without granting access to their payloads; access is
 * always decided by an entitlement.
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { PACKAGE_NAME_PATTERN, SEMVER_PATTERN } from "./package-manifest";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

export const COLLECTION_VISIBILITIES = ["private", "unlisted", "public"] as const;
export type CollectionVisibility = (typeof COLLECTION_VISIBILITIES)[number];

export const OFFER_SALE_STATES = ["draft", "active", "paused", "archived"] as const;
export type OfferSaleState = (typeof OFFER_SALE_STATES)[number];

export const ENTITLEMENT_SOURCES = ["purchase", "grant", "import"] as const;
export type EntitlementSource = (typeof ENTITLEMENT_SOURCES)[number];

/** Non-secret collection configuration. Secrets and absolute paths must never be stored here. */
export type CollectionConfig = Record<string, string | number | boolean>;

export interface CollectionMember {
  packageName: string;
  version?: string;
  digest?: string;
  optional?: boolean;
}

export interface Collection {
  id: string;
  ownerId: string;
  slug: string;
  name: string;
  visibility: CollectionVisibility;
  latestRevisionNumber: number;
  createdAt: string;
  updatedAt: string;
}

/** An immutable snapshot of a collection, used for reproducible installs. */
export interface CollectionRevision {
  id: string;
  collectionId: string;
  revisionNumber: number;
  members: CollectionMember[];
  config: CollectionConfig;
  createdAt: string;
}

export interface ProductOffer {
  id: string;
  packageName: string;
  /** Price in whole credits. Price is never part of immutable package bytes. */
  creditPrice: number;
  licensePolicy: string;
  visibility: CollectionVisibility;
  purchaseLimit: number | null;
  saleState: OfferSaleState;
  createdAt: string;
  updatedAt: string;
}

export interface Entitlement {
  id: string;
  /** User or team that holds the entitlement. */
  subjectId: string;
  packageName: string;
  /** Absent when the entitlement covers the package's whole release stream. */
  releaseId?: string;
  source: EntitlementSource;
  /** Set when `source` is `purchase`. */
  orderId?: string;
  grantedAt: string;
  revokedAt?: string;
}

export function validateCollectionMember(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "collection member must be an object")]);
  }

  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(input.packageName) || !PACKAGE_NAME_PATTERN.test(input.packageName)) {
    issues.push(issue("packageName", "pattern", "must be '@publisher/slug'"));
  }
  if (input.version !== undefined && (!isNonEmptyString(input.version) || !SEMVER_PATTERN.test(input.version))) {
    issues.push(issue("version", "pattern", "must be a semantic version when present"));
  }
  if (input.digest !== undefined && !RELEASE_DIGEST_PATTERN.test(String(input.digest))) {
    issues.push(issue("digest", "pattern", "must match sha256:<64 lowercase hex> when present"));
  }
  if (input.optional !== undefined && typeof input.optional !== "boolean") {
    issues.push(issue("optional", "type", "optional must be a boolean when present"));
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

export function validateEntitlement(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "entitlement must be an object")]);
  }

  const issues: ValidationIssue[] = [];
  if (!isNonEmptyString(input.subjectId)) {
    issues.push(issue("subjectId", "required", "subjectId is required"));
  }
  if (!isNonEmptyString(input.packageName) || !PACKAGE_NAME_PATTERN.test(input.packageName)) {
    issues.push(issue("packageName", "pattern", "must be '@publisher/slug'"));
  }
  if (!(ENTITLEMENT_SOURCES as readonly unknown[]).includes(input.source)) {
    issues.push(issue("source", "unsupported_value", `must be one of: ${ENTITLEMENT_SOURCES.join(", ")}`));
  }
  if (input.source === "purchase" && !isNonEmptyString(input.orderId)) {
    issues.push(issue("orderId", "required", "orderId is required when source is 'purchase'"));
  }
  if (!isNonEmptyString(input.grantedAt)) {
    issues.push(issue("grantedAt", "required", "grantedAt is required"));
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** Entitlements decide access; install records never do. */
export function entitlementGrantsAccess(
  entitlement: Entitlement | null | undefined,
  target: { packageName: string; releaseId?: string },
): boolean {
  if (!entitlement) return false;
  if (entitlement.revokedAt) return false;
  if (entitlement.packageName !== target.packageName) return false;
  if (!entitlement.releaseId) return true;
  return entitlement.releaseId === target.releaseId;
}

/** Collection revisions are immutable by construction. */
export function isRevisionImmutable(revision: CollectionRevision): boolean {
  return revision.revisionNumber > 0 && isNonEmptyString(revision.id);
}
