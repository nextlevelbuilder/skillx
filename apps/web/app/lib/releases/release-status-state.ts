/**
 * The state a signed `skillx.release-status/v1` document reports for one
 * release. It mirrors what the read API enforces, so an offline consumer that
 * trusts only the signed status reaches the same decision:
 *
 * - the release is quarantined: `quarantined`, reason `quarantined`;
 * - another release of the same tree is quarantined: `quarantined`, reason
 *   `tree_quarantined`;
 * - the publisher is suspended or revoked (the read API answers 403):
 *   `quarantined`, reason `publisher_revoked`, because a release status has
 *   no publisher state;
 * - `yanked` (reason `yanked`) and `published` (no reason) as stored.
 *
 * The signed document is public, so it carries only one of these fixed
 * reason codes. The free-text reason of a state change stays in the
 * admin-only `release_state_audit`.
 */
import type { ReleaseRowAccess } from "./release-access";

export type StatusState = "published" | "yanked" | "quarantined";

export const STATUS_REASON_CODES = ["yanked", "quarantined", "tree_quarantined", "publisher_revoked"] as const;
export type StatusReasonCode = (typeof STATUS_REASON_CODES)[number];

export interface EffectiveStatus {
  state: StatusState;
  reason?: StatusReasonCode;
}

export function effectiveStatus(release: ReleaseRowAccess): EffectiveStatus {
  if (release.state === "quarantined") return { state: "quarantined", reason: "quarantined" };
  if (release.treeQuarantined) return { state: "quarantined", reason: "tree_quarantined" };
  if (release.publisherState !== "active") return { state: "quarantined", reason: "publisher_revoked" };
  if (release.state === "yanked") return { state: "yanked", reason: "yanked" };
  return { state: "published" };
}
