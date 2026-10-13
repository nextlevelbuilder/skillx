/**
 * The single shared validator fixture set for `skillx.package/v1` and siblings.
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
import { RELEASE_MANIFEST_FIXTURES } from "./release-fixtures";
import { RELEASE_STATUS_FIXTURES } from "./release-status-fixtures";
import type { FixtureCase } from "./types";

export * from "./types";
export * from "./manifest-fixtures";
export * from "./collection-fixtures";
export * from "./release-fixtures";
export * from "./release-status-fixtures";

export const ALL_FIXTURES: FixtureCase[] = [
  ...PACKAGE_MANIFEST_FIXTURES,
  ...VERIFICATION_EVIDENCE_FIXTURES,
  ...COLLECTION_MEMBER_FIXTURES,
  ...ENTITLEMENT_FIXTURES,
  ...INGESTION_FIXTURES,
  ...RELEASE_MANIFEST_FIXTURES,
  ...RELEASE_STATUS_FIXTURES,
];
