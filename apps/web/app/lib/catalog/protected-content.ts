/**
 * Protected content resolver boundary.
 *
 * Phase 0 rule: the boundary denies, it does not strip. Every listing in the
 * catalog today is free and public, and the skill page plus `skillx use` depend
 * on `content`. So public/free listings keep returning payload on every surface;
 * only paid or private-capable listings are denied until an entitlement exists.
 *
 * No route may read `skills.content` and serve it directly.
 */

import { decidePayloadAccess, type PayloadAccess } from "@skillx/contracts";
import type { PublicCatalogListingDto, PublicSkillDetailDto } from "@skillx/contracts";

export interface ContentSource {
  slug: string;
  is_paid: boolean | null;
  content: string;
}

export interface PayloadViewer {
  userId?: string | null;
  /** True only when a valid entitlement for this listing was already resolved. */
  hasEntitlement?: boolean;
}

/** A listing is protected when it is priced or otherwise gated. */
export function isProtectedListing(source: Pick<ContentSource, "is_paid">): boolean {
  return Boolean(source.is_paid);
}

/**
 * Resolves whether the SKILL.md payload may be released for this listing and viewer.
 * The loader is only invoked when access is granted.
 */
export function resolveSkillPayloadAccess(source: ContentSource, viewer: PayloadViewer = {}): PayloadAccess<string> {
  return decidePayloadAccess(
    { slug: source.slug, isProtected: isProtectedListing(source), state: "listing" },
    viewer,
    () => source.content,
  );
}

/** Detail payload = public metadata, plus `content` only when access is granted. */
export type SkillDetailResponse = PublicSkillDetailDto & { content?: string };

export function buildSkillDetailResponse(
  detail: PublicSkillDetailDto,
  source: ContentSource,
  viewer: PayloadViewer = {},
): SkillDetailResponse {
  const access = resolveSkillPayloadAccess(source, viewer);
  return access.granted ? { ...detail, content: access.payload } : { ...detail };
}

/** Search/listing payload = public metadata, plus `content` only when granted. */
export type CatalogListingResponse = PublicCatalogListingDto & { content?: string };

/**
 * Strips the payload from a raw catalog row without leaking it into a response.
 * `void content` keeps the destructured binding intentional rather than unused.
 */
export function omitPayload<T extends { content: string }>(row: T): Omit<T, "content"> {
  const { content, ...metadata } = row;
  void content;
  return metadata;
}

/**
 * Applies the resolver to a raw catalog row and returns a view that is safe to
 * hand to a loader, a response body, or SSR serialization: the payload is
 * present only when access was granted. Every surface must use this instead of
 * forwarding a `skills` row directly, because loader data is serialized into
 * the server-rendered HTML.
 */
export function gateSkillRow<T extends { slug: string; is_paid: boolean | null; content: string }>(
  row: T,
  userId: string | null = null,
): Omit<T, "content"> & { content?: string } {
  const access = resolveSkillPayloadAccess(
    { slug: row.slug, is_paid: row.is_paid, content: row.content },
    { userId },
  );
  const metadata = omitPayload(row);
  return access.granted ? { ...metadata, content: access.payload } : metadata;
}

export function buildCatalogListingResponse(
  listing: PublicCatalogListingDto,
  source: ContentSource,
  viewer: PayloadViewer = {},
): CatalogListingResponse {
  const access = resolveSkillPayloadAccess(source, viewer);
  return access.granted ? { ...listing, content: access.payload } : { ...listing };
}
