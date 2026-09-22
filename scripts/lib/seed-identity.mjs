/**
 * Seed-pipeline adapter for the shared canonical identity rules.
 *
 * Seed records are the objects inside `scripts/seed-data.json`: they carry `source_url`,
 * `author`, `name` and a (possibly mangled) `slug`. This module maps such a record onto its
 * source identity and assigns collision-free slugs, with the exact same rules the runtime
 * uses — see `packages/skill-identity`.
 */

import {
  assignCanonicalSlugs,
  compareCodepoints,
  slugify,
  sourceIdentity,
} from "../../packages/skill-identity/index.js";

/**
 * Source identity of a seed record.
 *
 * Thin adapter over the shared rules: records whose `source_url` is missing or is not a GitHub
 * tree URL get a `nosrc:` identity and keep their current slug as the base slug.
 */
export function seedIdentity(record) {
  return sourceIdentity({
    sourceUrl: record.source_url,
    author: record.author,
    name: record.name,
    slug: record.slug,
  });
}

/**
 * Collapse records that share a source identity and assign one canonical slug per identity.
 *
 * @param {Array<object>} records
 * @param {{ rank?: (record: object, identity: object) => number }} [options]
 *   `rank` breaks ties inside a duplicate group; the lowest rank wins.
 * @returns {{ kept: Array<{ record: object, identity: object, slug: string }>,
 *             dropped: Array<{ record: object, identity: object, keptSlug: string }> }}
 */
export function canonicalizeSeedRecords(records, options = {}) {
  const rank = options.rank ?? (() => 0);
  const groups = new Map();

  for (const record of records) {
    const identity = seedIdentity(record);
    const group = groups.get(identity.identity) ?? [];
    group.push({ record, identity });
    groups.set(identity.identity, group);
  }

  const survivors = [];
  const dropped = [];

  for (const group of groups.values()) {
    const ordered = [...group].sort((a, b) => {
      const byRank = rank(a.record, a.identity) - rank(b.record, b.identity);
      if (byRank !== 0) return byRank;
      return compareCodepoints(a.record.slug, b.record.slug);
    });

    survivors.push(ordered[0]);
    for (const loser of ordered.slice(1)) {
      dropped.push({ record: loser.record, identity: loser.identity });
    }
  }

  const slugs = assignCanonicalSlugs(survivors.map((entry) => entry.identity));

  const kept = survivors.map((entry) => ({
    record: entry.record,
    identity: entry.identity,
    slug: slugs.get(entry.identity.identity) ?? slugify(entry.record.slug),
  }));

  const keptSlugByIdentity = new Map(kept.map((entry) => [entry.identity.identity, entry.slug]));

  return {
    kept,
    dropped: dropped.map((entry) => ({
      ...entry,
      keptSlug: keptSlugByIdentity.get(entry.identity.identity) ?? null,
    })),
  };
}
