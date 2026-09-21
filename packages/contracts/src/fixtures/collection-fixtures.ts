/**
 * Collection, entitlement, and ingestion fixtures.
 */

import { FIXTURE_DIGEST } from "./types";
import type { FixtureCase } from "./types";

export const COLLECTION_MEMBER_FIXTURES: FixtureCase[] = [
  {
    name: "valid member with digest",
    group: "collection-member",
    value: { packageName: "@zuey/work", version: "1.2.3", digest: FIXTURE_DIGEST },
    expectedValid: true,
  },
  {
    name: "valid optional member",
    group: "collection-member",
    value: { packageName: "@zuey/work", optional: true },
    expectedValid: true,
  },
  {
    name: "rejects bare slug",
    group: "collection-member",
    value: { packageName: "work" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "rejects bad digest",
    group: "collection-member",
    value: { packageName: "@zuey/work", digest: "deadbeef" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
];

export const ENTITLEMENT_FIXTURES: FixtureCase[] = [
  {
    name: "valid purchase entitlement",
    group: "entitlement",
    value: {
      id: "ent_1",
      subjectId: "user_1",
      packageName: "@zuey/work",
      source: "purchase",
      orderId: "order_1",
      grantedAt: "2026-09-15T10:00:00.000Z",
    },
    expectedValid: true,
  },
  {
    name: "valid grant entitlement",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "grant", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: true,
  },
  {
    name: "rejects purchase without orderId",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "purchase", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "required",
  },
  {
    name: "rejects unknown source",
    group: "entitlement",
    value: { subjectId: "user_1", packageName: "@zuey/work", source: "bribe", grantedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "unsupported_value",
  },
];

export const INGESTION_FIXTURES: FixtureCase[] = [
  {
    name: "valid import",
    group: "listing-import",
    value: { mode: "import", sourceUrl: "https://github.com/o/r/tree/main/skills/x", fetchedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: true,
  },
  {
    name: "rejects relative import source",
    group: "listing-import",
    value: { mode: "import", sourceUrl: "/skills/x", fetchedAt: "2026-09-15T10:00:00.000Z" },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
  {
    name: "valid publish",
    group: "release-publish",
    value: {
      mode: "publish",
      packageName: "@agentkit/engineer",
      version: "1.2.3",
      kind: "skill",
      channel: "beta",
      releaseState: "quarantined",
      releaseDigest: FIXTURE_DIGEST,
      artifactSize: 2048,
    },
    expectedValid: true,
  },
  {
    name: "rejects publish without digest",
    group: "release-publish",
    value: { mode: "publish", version: "1.2.3", kind: "skill", releaseState: "draft", artifactSize: 2048 },
    expectedValid: false,
    expectedIssueCode: "pattern",
  },
];
