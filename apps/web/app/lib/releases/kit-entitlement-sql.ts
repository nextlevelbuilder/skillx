/**
 * Paid AgentKit kit content as an entitlement: a private `@agentkit/*`
 * package whose `kit` (the kit of its newest kit release) is named by the
 * viewer's AgentKit link (`agentkit_links.kits`, the `agentkit_kits` claim of
 * the newest token SkillX's own grant received) is readable like a
 * whole-stream entitlement. No link, or a kit missing from the claim, grants
 * nothing, and neither does a link no refresh confirmed within the outage grace
 * (`OUTAGE_GRACE_MS`): stored kits are only as current as the last refresh, so
 * a link nothing re-validates (the AS down, the feature off) stops granting
 * instead of keeping a refunded kit. Reads `agentkit_links` by primary key and `packages` by
 * `idx_packages_kit`, so it adds no scan to any read path.
 */

import { OUTAGE_GRACE_MS } from "~/lib/agentkit/link-liveness";

/** A link confirmed by a refresh within the grace; `validated_at` is in ms. */
const FRESH_LINK = `l.validated_at >= CAST(strftime('%s', 'now') AS INTEGER) * 1000 - ${OUTAGE_GRACE_MS}`;

/** True when the viewer (`subject`, an SQL expression) owns the kit of package alias `pkg`. */
export const kitEntitled = (subject: string, pkg = "p") =>
  `(${pkg}.kit IS NOT NULL AND ${pkg}.name LIKE '@agentkit/%'
    AND EXISTS (SELECT 1 FROM agentkit_links l, json_each(l.kits) j WHERE l.user_id = ${subject} AND ${FRESH_LINK} AND j.value = ${pkg}.kit))`;

/** Ids of the packages of every kit the viewer owns, for a listing driven by the caller's ids. */
export const kitEntitledPackageIds = (subject: string) =>
  `SELECT kp.id FROM agentkit_links l, json_each(l.kits) j JOIN packages kp ON kp.kit = j.value
    WHERE l.user_id = ${subject} AND ${FRESH_LINK} AND kp.name LIKE '@agentkit/%'`;
