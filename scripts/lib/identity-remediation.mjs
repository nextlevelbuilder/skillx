/**
 * Remediation statements that move a live `skills` table onto canonical identity (issue #25).
 *
 * Kept in its own module so the statement order can be tested against a real database: slugs are
 * unique, and a rename can need a slug another row still holds. A single-order update therefore
 * fails with a UNIQUE violation, which is why renames run in two passes.
 */

import { canonicalizeSeedRecords } from './seed-identity.mjs';

/** SQL literal for a value; `null`/`undefined` become NULL. */
export function sqlString(value) {
  return value === null || value === undefined ? 'NULL' : `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Normalize one row read from `wrangler d1 execute --json`.
 *
 * wrangler renders SQL NULL as the string "null" in that JSON output, so the identity columns arrive
 * as text and every `=== null` check silently fails — a parked row then looks un-parked and gets
 * rewritten on every run. An empty `source_path` is a real value (repo root) and is kept as is.
 */
export function normalizeD1Row(row) {
  const cleaned = { ...row };
  for (const key of ['source_repo', 'source_path', 'source_url']) {
    if (cleaned[key] === 'null' || cleaned[key] === 'NULL') cleaned[key] = null;
  }
  return cleaned;
}

/**
 * Slug a row had before remediation: drops the tombstone suffix a previous run added for THIS row.
 * Matching on the row's own id keeps a second run a no-op whatever the id looks like.
 */
function untombstonedSlug(row) {
  const suffix = `-dup-${String(row.id).slice(0, 8)}`;
  const slug = String(row.slug);
  return slug.endsWith(suffix) ? slug.slice(0, -suffix.length) : slug;
}

/**
 * Duplicate rows of one identity: the richest row wins, then the longest slug, then lexical.
 * Tombstone suffixes are ignored so a re-run picks the same survivor as the first run.
 */
export function rankDuplicate(record) {
  const contentLength = record.content?.length ?? record.content_len ?? 0;
  return -contentLength * 1e6 - untombstonedSlug(record).length;
}

/** Tombstone slug for a duplicate row: keeps its data, gives up the public slug. */
function tombstoneSlug(row) {
  return `${untombstonedSlug(row)}-dup-${String(row.id).slice(0, 8)}`;
}

/** True when a duplicate row already sits on the tombstone it would be given again. */
function isParked(row) {
  return (
    row.slug === tombstoneSlug(row) &&
    (row.source_repo ?? null) === null &&
    (row.source_path ?? null) === null
  );
}

/** Temporary slug used while a renamed row is parked between passes. */
function parkedSlug(row) {
  return `${row.slug}-tmp-${String(row.id).slice(0, 8)}`;
}

/**
 * Build UPDATE + alias INSERT statements for a `skills` table dump.
 *
 * Pass 1: duplicate rows of one identity step aside onto a tombstone slug.
 * Pass 2: every renamed survivor is parked on a temporary slug and gets its identity columns.
 * Pass 3: parked rows are given their final canonical slug, now that the old ones are free.
 *
 * A genuine conflict (two rows that would end up with the same slug) throws before anything is
 * emitted. Transient conflicts — where the current holder is itself being renamed — do not.
 *
 * Aliases are only written when they are still reachable. A slug that a surviving row now owns
 * resolves to that row, because `skills.slug` beats `skill_aliases`; such an alias is reported in
 * `shadowed` instead, so the operator knows exactly which old URLs changed meaning.
 */
export function buildRemediation(rows) {
  const { kept, dropped } = canonicalizeSeedRecords(rows, { rank: rankDuplicate });

  const statements = [];
  const aliases = [];
  const changed = [];
  const survivorOf = new Map();

  for (const entry of dropped) {
    const survivor = kept.find((k) => k.identity.identity === entry.identity.identity);
    if (survivor) survivorOf.set(entry.record.id, survivor.record.id);
  }

  const finalSlugById = new Map();
  for (const entry of kept) finalSlugById.set(entry.record.id, entry.slug);
  for (const entry of dropped) {
    if (survivorOf.has(entry.record.id)) {
      finalSlugById.set(entry.record.id, tombstoneSlug(entry.record));
    }
  }

  // Only a colliding FINAL slug is a real conflict; a transient one is resolved by the passes.
  const ownerOfSlug = new Map();
  for (const [id, slug] of finalSlugById) {
    const other = ownerOfSlug.get(slug);
    if (other && other !== id) {
      throw new Error(`slug conflict: rows ${other} and ${id} would both end up as ${slug}`);
    }
    ownerOfSlug.set(slug, id);
  }

  // Pass 1 — duplicates release the slugs the survivors may need. A row already parked by an
  // earlier run is left alone, which is what makes a re-run a no-op.
  for (const entry of dropped) {
    const finalSlug = finalSlugById.get(entry.record.id);
    const survivor = survivorOf.get(entry.record.id);
    if (!finalSlug || !survivor || isParked(entry.record)) continue;

    statements.push(
      `UPDATE skills SET slug = ${sqlString(finalSlug)}, source_repo = NULL, source_path = NULL WHERE id = ${sqlString(entry.record.id)};`,
    );
    aliases.push({ slug: entry.record.slug, skillId: survivor, reason: 'duplicate-source' });
  }

  // Pass 2 — park renamed survivors and write their identity.
  const parked = [];
  for (const entry of kept) {
    const row = entry.record;
    const identity = entry.identity;
    const identityRepo = identity.sourced ? identity.repoLabel : null;
    const identityPath = identity.sourced ? identity.path : null;
    const slugChanged = entry.slug !== row.slug;
    const identityChanged =
      (row.source_repo ?? null) !== identityRepo || (row.source_path ?? null) !== identityPath;

    if (!slugChanged && !identityChanged) continue;

    changed.push({ id: row.id, from: row.slug, to: entry.slug });

    if (slugChanged) {
      statements.push(
        `UPDATE skills SET slug = ${sqlString(parkedSlug(row))}, source_repo = ${sqlString(
          identityRepo,
        )}, source_path = ${sqlString(identityPath)} WHERE id = ${sqlString(row.id)};`,
      );
      parked.push({ id: row.id, slug: entry.slug });
      aliases.push({ slug: row.slug, skillId: row.id, reason: 'legacy' });
    } else {
      statements.push(
        `UPDATE skills SET source_repo = ${sqlString(identityRepo)}, source_path = ${sqlString(
          identityPath,
        )} WHERE id = ${sqlString(row.id)};`,
      );
    }
  }

  // Pass 3 — final slugs, with the old ones now free.
  for (const item of parked) {
    statements.push(
      `UPDATE skills SET slug = ${sqlString(item.slug)} WHERE id = ${sqlString(item.id)};`,
    );
  }

  const liveSlugs = new Set(finalSlugById.values());
  const shadowed = { sameRow: [], otherRow: [] };
  const emitted = [];

  for (const alias of aliases) {
    if (!alias.skillId) continue;

    if (liveSlugs.has(alias.slug)) {
      const ownerId = ownerOfSlug.get(alias.slug) ?? null;
      const bucket = ownerId === alias.skillId ? shadowed.sameRow : shadowed.otherRow;
      bucket.push({ ...alias, ownerId });
      continue;
    }

    emitted.push(alias);
    statements.push(
      `INSERT INTO skill_aliases (slug, skill_id, reason, created_at) VALUES (${sqlString(
        alias.slug,
      )}, ${sqlString(alias.skillId)}, ${sqlString(alias.reason)}, ${Date.now()}) ON CONFLICT(slug) DO NOTHING;`,
    );
  }

  return { statements, changed, aliases: emitted, shadowed, dropped };
}
