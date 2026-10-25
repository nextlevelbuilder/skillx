/**
 * `skillx.library/v1`: the caller's private library, one page of the assets
 * the caller owns or is entitled to, skills and personal kits together.
 *
 * The server decides what a caller may see; this module only names the shapes
 * so the route, the CLI and the dashboard agree on them.
 */

export const LIBRARY_SCHEMA = "skillx.library/v1";

export const LIBRARY_KINDS = ["skill", "kit"] as const;
export type LibraryKind = (typeof LIBRARY_KINDS)[number];
export const isLibraryKind = (value: unknown): value is LibraryKind =>
  typeof value === "string" && (LIBRARY_KINDS as readonly string[]).includes(value);

/** How the caller reaches an item: owner of its publisher (or kit), or holder of an entitlement. */
export const LIBRARY_RELATIONS = ["owner", "entitled"] as const;
export type LibraryRelation = (typeof LIBRARY_RELATIONS)[number];

export const LIBRARY_DEFAULT_LIMIT = 50;
export const LIBRARY_MAX_LIMIT = 100;
export const LIBRARY_QUERY_MAX_LENGTH = 64;

/**
 * Machine-readable state of an item:
 * - skill: `published` (a readable release exists), `no_release` (none the
 *   caller may read: nothing published, yanked, or quarantined),
 *   `publisher_suspended`;
 * - kit: `active`, `no_active_revision`, `quarantined` (the effective revision
 *   is quarantined), `publisher_suspended`.
 * An item that is not `published` or `active` carries no `installRef`.
 */
export type LibrarySkillState = "published" | "no_release" | "publisher_suspended";
export type LibraryKitState = "active" | "no_active_revision" | "quarantined" | "publisher_suspended";

export interface LibrarySkillItem {
  kind: "skill";
  /** `@publisher/slug`. */
  identity: string;
  relation: LibraryRelation;
  visibility: string;
  /** The registry package kind (`skill`, `hook-pack`, `bundle`). */
  packageKind: string;
  state: LibrarySkillState;
  /** The newest published release the caller may read; null when there is none. */
  latest: { version: string; releaseDigest: string } | null;
  /** `@publisher/slug@version` for `skillx install`, or null. */
  installRef: string | null;
}

export interface LibraryKitItem {
  kind: "kit";
  /** `@publisher/name`. */
  identity: string;
  relation: LibraryRelation;
  visibility: string;
  state: LibraryKitState;
  /** The active revision; null until one is activated. */
  effectiveRevision: { id: string; number: number; digest: string } | null;
  /** The kit's compare-and-set counter (its ETag is `"g<generation>"`). */
  generation: number;
  latestRevisionNumber: number;
  /** `kit:@publisher/name#revisionId` for `skillx install`, or null. */
  installRef: string | null;
}

export type LibraryItem = LibrarySkillItem | LibraryKitItem;

/** Whether kits are served: `kit.api_disabled` while the deployment has personal kits off. */
export type LibraryKitsStatus = { status: "available" } | { status: "unavailable"; code: string };

export interface LibraryPage {
  schema: typeof LIBRARY_SCHEMA;
  items: LibraryItem[];
  /** Opaque; pass back as `cursor` for the next page. Null on the last page. */
  nextCursor: string | null;
  kits: LibraryKitsStatus;
}
