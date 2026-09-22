#!/usr/bin/env node

/**
 * Assert that scripts/seed-data.json satisfies the canonical identity rules (issue #25).
 *
 *   node scripts/assert-seed-identity.mjs
 *
 * Checks:
 *   1. no duplicate slugs
 *   2. no slug derived from a `SKILL.md` filename (the old `-ill-md` corruption)
 *   3. no duplicate source identity (one identity = one skill)
 *   4. every stored slug is exactly what the canonical rules produce, so a hand edit or a
 *      stale generator run cannot slip through
 *   5. slug assignment is independent of input order
 *
 * Exits non-zero with a readable report when any check fails.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canonicalizeSeedRecords } from './lib/seed-identity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(__dirname, 'seed-data.json');

/** Domain rule for "this slug is a SKILL.md artefact". */
const ILL_MD = /ill-md/;

function rankDuplicate(record) {
  return -(record.content?.length ?? 0) * 1e6 - String(record.slug).length;
}

async function main() {
  let raw;
  try {
    raw = JSON.parse(await readFile(SEED_FILE, 'utf-8'));
  } catch (error) {
    console.error(`FAIL: cannot read ${SEED_FILE}: ${error.message}`);
    process.exit(1);
  }

  const records = Array.isArray(raw) ? raw : raw.skills ?? [];
  const failures = [];

  const slugCounts = new Map();
  for (const record of records) {
    slugCounts.set(record.slug, (slugCounts.get(record.slug) ?? 0) + 1);
  }
  const duplicates = [...slugCounts.entries()].filter(([, count]) => count > 1);
  if (duplicates.length > 0) {
    failures.push(
      `duplicate slugs: ${duplicates.length} (e.g. ${duplicates
        .slice(0, 3)
        .map(([slug, count]) => `${slug} x${count}`)
        .join(', ')})`,
    );
  }

  const illMd = records.filter((record) => ILL_MD.test(record.slug));
  if (illMd.length > 0) {
    failures.push(`slugs derived from SKILL.md: ${illMd.length} (e.g. ${illMd[0].slug})`);
  }

  const { kept, dropped } = canonicalizeSeedRecords(records, { rank: rankDuplicate });
  if (dropped.length > 0) {
    failures.push(`duplicate source identities: ${dropped.length} (e.g. ${dropped[0].record.slug})`);
  }

  const expected = new Map(kept.map((entry) => [entry.record, entry.slug]));
  const mismatched = [];
  for (const record of records) {
    const want = expected.get(record);
    if (want && want !== record.slug) mismatched.push(`${record.slug} -> ${want}`);
  }
  if (mismatched.length > 0) {
    failures.push(
      `slugs not matching canonical rules: ${mismatched.length} (e.g. ${mismatched.slice(0, 3).join(', ')})`,
    );
  }

  const forward = canonicalizeSeedRecords(records, { rank: rankDuplicate });
  const reversed = canonicalizeSeedRecords(records.toReversed(), { rank: rankDuplicate });
  const reversedBySlug = new Map(reversed.kept.map((entry) => [entry.record.slug, entry.slug]));
  for (const entry of forward.kept) {
    const other = reversedBySlug.get(entry.record.slug);
    if (other !== undefined && other !== entry.slug) {
      failures.push(`order-dependent slug: ${entry.record.slug} -> ${entry.slug} / ${other}`);
      break;
    }
  }

  console.log(`records: ${records.length} | distinct slugs: ${slugCounts.size}`);
  console.log(`duplicate slugs: ${duplicates.length} | SKILL.md-derived slugs: ${illMd.length} | collapsed identities: ${dropped.length}`);

  if (failures.length > 0) {
    console.error('\nFAIL');
    for (const failure of failures) console.error(`  - ${failure}`);
    process.exit(1);
  }

  console.log('\nPASS: canonical identity rules hold.');
}

main().catch((error) => {
  console.error(`FAIL: ${error.message}`);
  process.exit(1);
});
