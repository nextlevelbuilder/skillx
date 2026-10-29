/** The admin review queue: quarantined releases with their latest review decision. */

/** Most queue entries one listing returns. */
export const MAX_QUEUE_ENTRIES = 200;

type QueueRow = {
  name: string;
  version: string;
  channel: string;
  release_digest: string | null;
  quarantined_at: number | null;
  decision: string | null;
  review_reason: string | null;
  reviewed_at: number | null;
};

/** Quarantined releases, oldest quarantine first, each with its latest review (if any). */
export async function listQuarantine(db: D1Database) {
  const { results } = await db
    .prepare(
      `SELECT p.name, r.version, r.channel, r.release_digest, r.quarantined_at,
              rv.decision, rv.reason AS review_reason, rv.created_at AS reviewed_at
         FROM package_releases r
         JOIN packages p ON p.id = r.package_id
         LEFT JOIN release_reviews rv ON rv.id = (
           SELECT id FROM release_reviews WHERE release_id = r.id ORDER BY created_at DESC, rowid DESC LIMIT 1)
        WHERE r.release_state = 'quarantined' AND p.deleted_at IS NULL
        ORDER BY r.quarantined_at, r.id LIMIT ?`,
    )
    .bind(MAX_QUEUE_ENTRIES)
    .all<QueueRow>();
  const iso = (ms: number | null) => (ms === null ? null : new Date(Number(ms)).toISOString());
  return results.map((row) => ({
    identity: row.name,
    version: row.version,
    channel: row.channel,
    releaseDigest: row.release_digest,
    quarantinedAt: iso(row.quarantined_at),
    lastReview: row.decision === null ? null : { decision: row.decision, reason: row.review_reason, reviewedAt: iso(row.reviewed_at) },
  }));
}
