/**
 * The protected payload access decision.
 *
 * This module is deliberately dependency-free and side-effect free so that
 * search, the detail API, SSR, the CLI, and MCP all reach the same answer for
 * the same inputs. One resolver, one vocabulary of denial reasons.
 */

export const PAYLOAD_DENIAL_REASONS = [
  /** The listing is paid or private-capable and the viewer holds no entitlement. */
  "entitlement_required",
  /** The listing is not in a state that may be served at all. */
  "listing_not_published",
  /** The listing was withdrawn. */
  "listing_yanked",
] as const;

export type PayloadDenialReasonValue = (typeof PAYLOAD_DENIAL_REASONS)[number];

export interface PayloadDenial {
  granted: false;
  reason: PayloadDenialReasonValue;
  message: string;
}

export interface PayloadGrant<T> {
  granted: true;
  payload: T;
}

export type PayloadAccess<T> = PayloadGrant<T> | PayloadDenial;

/** The only listing states that may serve payload to an authorized viewer. */
export const SERVABLE_LISTING_STATES = ["published", "listing"] as const;
export type ServableListingState = (typeof SERVABLE_LISTING_STATES)[number];

export interface ListingAccessInput {
  slug: string;
  /** True when the listing is paid or otherwise protected beyond public catalog. */
  isProtected: boolean;
  state?: ServableListingState | "yanked" | "draft" | "quarantined";
}

export interface ViewerAccessInput {
  userId?: string | null;
  /** True only when a valid entitlement for this listing was already resolved. */
  hasEntitlement?: boolean;
}

export function denial(reason: PayloadDenialReasonValue, message: string): PayloadDenial {
  return { granted: false, reason, message };
}

/**
 * Decides whether protected payload may be released.
 *
 * Public, unprotected listings are granted for everyone. Protected listings
 * require an entitlement, and no entitlement model grants one implicitly today
 * (commerce arrives in Phase 5), so protected payload is denied until an
 * entitlement exists.
 */
export function decidePayloadAccess<T>(
  listing: ListingAccessInput,
  viewer: ViewerAccessInput,
  loadPayload: () => T,
): PayloadAccess<T> {
  const state = listing.state ?? "listing";
  if (state === "yanked") {
    return denial("listing_yanked", `Listing '${listing.slug}' was withdrawn.`);
  }
  if (state !== "published" && state !== "listing") {
    return denial("listing_not_published", `Listing '${listing.slug}' is not published yet.`);
  }
  if (listing.isProtected && !viewer.hasEntitlement) {
    return denial(
      "entitlement_required",
      `Listing '${listing.slug}' requires an entitlement that this viewer does not hold.`,
    );
  }
  return { granted: true, payload: loadPayload() };
}
