/**
 * The single shared validator fixture set for `skillx.package/v1` and siblings.
 *
 * The signed-release fixtures (`release-fixtures.ts`,
 * `release-status-fixtures.ts`) are deliberately not re-exported here: this
 * module is part of the package root that Worker code bundles, and those
 * fixtures exist only for tests, which import them directly.
 */

import {
  PACKAGE_MANIFEST_FIXTURES,
  VERIFICATION_EVIDENCE_FIXTURES,
} from "./manifest-fixtures";
import {
  COLLECTION_MEMBER_FIXTURES,
  ENTITLEMENT_FIXTURES,
  INGESTION_FIXTURES,
} from "./collection-fixtures";
import type { FixtureCase } from "./types";

export * from "./types";
export * from "./manifest-fixtures";
export * from "./collection-fixtures";

export const ALL_FIXTURES: FixtureCase[] = [
  ...PACKAGE_MANIFEST_FIXTURES,
  ...VERIFICATION_EVIDENCE_FIXTURES,
  ...COLLECTION_MEMBER_FIXTURES,
  ...ENTITLEMENT_FIXTURES,
  ...INGESTION_FIXTURES,
];
