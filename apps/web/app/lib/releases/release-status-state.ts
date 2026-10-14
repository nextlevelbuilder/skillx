/**
 * The state a signed `skillx.release-status/v1` document reports for one
 * release. It mirrors what the read API enforces, so an offline consumer that
 * trusts only the signed status reaches the same decision:
 *
 * - the release, or any release of the same tree, is quarantined: `quarantined`;
 * - the publisher is suspended or revoked (the read API answers 403):
 *   `quarantined`, with a reason saying so, because a release status has no
 *   publisher state;
 * - `yanked` and `published` as stored.
 *
 * The reason is the one recorded with the applied transition in
 * `release_state_audit`, when it satisfies the status reason rules.
 */
import { RELEASE_SIGNATURE_ALGORITHM, SKILLX_RELEASE_STATUS_SCHEMA_VERSION, validateUnsignedReleaseStatus } from "@skillx/contracts";
import type { ReleaseRowAccess } from "./release-access";

export type StatusState = "published" | "yanked" | "quarantined";

export interface EffectiveStatus {
  state: StatusState;
  reason?: string;
}

export const TREE_QUARANTINED_REASON = "another release of this tree is quarantined";
export const PUBLISHER_REVOKED_REASON = "the publisher of this package is suspended or revoked";

/** A stored audit reason, kept only when it is a valid status reason (length, no control or bidi characters). */
function statusReason(reason: string | null): string | undefined {
  if (reason === null) return undefined;
  const zero = `sha256:${"0".repeat(64)}`;
  const probe = validateUnsignedReleaseStatus({
    schemaVersion: SKILLX_RELEASE_STATUS_SCHEMA_VERSION,
    releaseDigest: zero,
    manifestDigest: zero,
    state: "published",
    reason,
    issuedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2026-01-02T00:00:00Z",
    sequence: 1,
    keyId: "reason-probe",
    signatureAlgorithm: RELEASE_SIGNATURE_ALGORITHM,
  });
  // Every other member is valid, so any failure is the reason's.
  return probe.valid ? reason : undefined;
}

async function appliedReason(db: D1Database, releaseId: string, toState: StatusState): Promise<string | undefined> {
  const row = await db
    .prepare(
      `SELECT reason FROM release_state_audit
        WHERE subject_kind = 'release' AND subject_id = ? AND outcome = 'applied' AND to_state = ?
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    )
    .bind(releaseId, toState)
    .first<{ reason: string | null }>();
  return statusReason(row?.reason ?? null);
}

export async function effectiveStatus(db: D1Database, release: ReleaseRowAccess): Promise<EffectiveStatus> {
  if (release.state === "quarantined") return withReason("quarantined", await appliedReason(db, release.id, "quarantined"));
  if (release.treeQuarantined) return { state: "quarantined", reason: TREE_QUARANTINED_REASON };
  if (release.publisherState !== "active") return { state: "quarantined", reason: PUBLISHER_REVOKED_REASON };
  if (release.state === "yanked") return withReason("yanked", await appliedReason(db, release.id, "yanked"));
  return { state: "published" };
}

function withReason(state: StatusState, reason: string | undefined): EffectiveStatus {
  return reason === undefined ? { state } : { state, reason };
}
