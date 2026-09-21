/**
 * Shared fixture case shape.
 *
 * A fixture carries its own expected verdict so a schema change forces one
 * update here instead of a silent behaviour change in five surfaces.
 */

export interface FixtureCase<T = unknown> {
  name: string;
  group: FixtureGroup;
  value: T;
  expectedValid: boolean;
  /** Issue code expected to appear when `expectedValid` is false. */
  expectedIssueCode?: string;
}

export type FixtureGroup =
  | "package-manifest"
  | "verification-evidence"
  | "collection-member"
  | "entitlement"
  | "listing-import"
  | "release-publish";

/** A syntactically valid digest used by fixtures. */
export const FIXTURE_DIGEST = `sha256:${"a".repeat(64)}`;
export const FIXTURE_OTHER_DIGEST = `sha256:${"b".repeat(64)}`;

/** A shallow-cloned plain-data fixture that a case may mutate before validation. */
export type MutableFixture = Record<string, unknown>;
