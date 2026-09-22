#!/usr/bin/env node

/**
 * Backfill canonical skill identity and slugs (issue #25).
 *
 * Two sources are supported:
 *
 *   node scripts/backfill-skill-identities.mjs --from-seed [--write]
 *       Collapse duplicate source identities in scripts/seed-data.json and rewrite every
 *       slug with the canonical rules. Deterministic and idempotent.
 *
 *   node scripts/backfill-skill-identities.mjs --from-d1 [--remote] [--sql <path>] [--apply]
 *       Remediate a real `skills` table: set source_repo/source_path, rewrite changed slugs
 *       and insert skill_aliases rows so every old slug keeps resolving. Writes a JSON backup
 *       of the affected rows before emitting or applying anything.
 *
 * Nothing is written unless `--write`, `--sql` or `--apply` is passed.
 */

import { readFile, writeFile, mkdir, unlink } from 'fs/promises';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import { canonicalizeSeedRecords } from './lib/seed-identity.mjs';
import { buildRemediation, normalizeD1Row, rankDuplicate } from './lib/identity-remediation.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SEED_FILE = join(__dirname, 'seed-data.json');
const WEB_DIR = join(__dirname, '..', 'apps', 'web');
const DB_NAME = 'skillx-db';

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const valueOf = (flag) => {
  const hit = args.find((a) => a.startsWith(`${flag}=`));
  return hit ? hit.split('=').slice(1).join('=') : null;
};

function stats(records) {
  const counts = new Map();
  for (const record of records) counts.set(record.slug, (counts.get(record.slug) ?? 0) + 1);
  return {
    total: records.length,
    duplicates: [...counts.values()].filter((n) => n > 1).length,
    illMd: records.filter((r) => /(^|-)ill-md($|-)/.test(r.slug) || r.slug.includes('ill-md')).length,
  };
}

function report(label, records) {
  const s = stats(records);
  console.log(`${label}: ${s.total} rows | duplicate slugs: ${s.duplicates} | slugs containing ill-md: ${s.illMd}`);
}

/** Read scripts/seed-data.json (array or `{ skills: [...] }` wrapper). */
async function readSeedRecords() {
  let raw;
  try {
    raw = JSON.parse(await readFile(SEED_FILE, 'utf-8'));
  } catch (error) {
    throw new Error(`cannot read ${SEED_FILE}: ${error.message}`);
  }
  return { raw, records: Array.isArray(raw) ? raw : raw.skills ?? [] };
}

/** Rewrite scripts/seed-data.json with canonical slugs. */
async function fromSeed() {
  const { raw, records } = await readSeedRecords();
  const isWrapped = !Array.isArray(raw);

  report('before', records);

  const { kept, dropped } = canonicalizeSeedRecords(records, { rank: rankDuplicate });
  const slugByRecord = new Map(kept.map((entry) => [entry.record, entry.slug]));

  // Duplicate source identities are collapsed to one row; their slugs become aliases in D1.
  const next = [];
  for (const record of records) {
    const slug = slugByRecord.get(record);
    if (slug === undefined) continue;
    next.push({ ...record, slug });
  }

  report('after ', next);
  console.log(`collapsed duplicate source rows: ${dropped.length}`);
  for (const entry of dropped.slice(0, 5)) {
    console.log(`  dropped slug ${entry.record.slug} (duplicate of ${entry.keptSlug})`);
  }

  if (!has('--write')) {
    console.log('\nDry run. Re-run with --write to update scripts/seed-data.json.');
    return;
  }

  const output = isWrapped ? { ...raw, skills: next } : next;
  await writeFile(SEED_FILE, `${JSON.stringify(output, null, 2)}\n`);
  console.log(`\nWrote ${next.length} rows to ${SEED_FILE}`);
}

/** Read rows from D1 through wrangler (local by default). */
function readD1Rows(remote) {
  const query =
    'SELECT id, slug, source_url, source_repo, source_path, name, author, length(content) AS content_len FROM skills;';
  const out = execFileSync(
    'npx',
    ['wrangler', 'd1', 'execute', DB_NAME, remote ? '--remote' : '--local', '--json', '--command', query],
    { cwd: WEB_DIR, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
  );

  let parsed;
  try {
    parsed = JSON.parse(out);
  } catch (error) {
    throw new Error(`wrangler returned unparseable JSON: ${error.message}`);
  }

  // wrangler turns SQL NULL into the string "null", which the remediation would read as a value.
  return (parsed[0]?.results ?? []).map(normalizeD1Row);
}

/** Remediate a real skills table. */
async function fromD1() {
  const remote = has('--remote');
  if (remote) {
    console.log('Reading remote D1 (requires an authenticated wrangler session).');
  }

  const rows = readD1Rows(remote);
  report('before', rows);

  const { statements, changed, aliases, shadowed } = buildRemediation(rows);

  const backupPath = resolve(
    valueOf('--backup') ?? join(process.cwd(), `.backfill-backup-${Date.now()}.json`),
  );
  await mkdir(dirname(backupPath), { recursive: true });
  await writeFile(backupPath, `${JSON.stringify({ rows, changed, aliases, shadowed }, null, 2)}\n`);
  console.log(`backup written: ${backupPath}`);

  console.log(`slug/identity updates: ${changed.length} | alias rows: ${aliases.length}`);

  // A slug a surviving row now owns resolves to that row, so its alias would never be reached.
  // Those old URLs change meaning, which is expected but must be visible to the operator.
  if (shadowed.sameRow.length || shadowed.otherRow.length) {
    console.log(
      `aliases skipped because a live slug owns them: ${shadowed.sameRow.length} on the same skill, ${shadowed.otherRow.length} on a different skill`,
    );
    for (const alias of shadowed.otherRow.slice(0, 20)) {
      console.log(`  ${alias.slug} -> ${alias.skillId}, but ${alias.ownerId} owns that slug now`);
    }
    if (shadowed.otherRow.length > 20) {
      console.log(`  ... and ${shadowed.otherRow.length - 20} more (listed in the backup JSON)`);
    }
  }

  const sqlPath = valueOf('--sql');
  if (sqlPath) {
    await writeFile(resolve(sqlPath), `${statements.join('\n')}\n`);
    console.log(`SQL written: ${resolve(sqlPath)}`);
  }

  if (has('--apply')) {
    if (remote) throw new Error('--apply only supports the local database; review and run --remote manually.');
    const tmp = join(WEB_DIR, '.backfill-tmp.sql');
    await writeFile(tmp, `${statements.join('\n')}\n`);
    try {
      execFileSync(
        'npx',
        ['wrangler', 'd1', 'execute', DB_NAME, '--local', '--file', tmp],
        { cwd: WEB_DIR, encoding: 'utf-8', stdio: 'inherit' },
      );
      console.log('Applied to local D1.');
    } finally {
      await unlink(tmp).catch(() => {});
    }
  }

  if (!sqlPath && !has('--apply')) {
    console.log('\nDry run. Pass --sql=<path> to emit SQL or --apply to run it on the local database.');
  }
}

async function main() {
  if (has('--from-seed')) return fromSeed();
  if (has('--from-d1')) return fromD1();

  console.error('Usage:');
  console.error('  node scripts/backfill-skill-identities.mjs --from-seed [--write]');
  console.error('  node scripts/backfill-skill-identities.mjs --from-d1 [--remote] [--sql=<path>] [--apply]');
  process.exit(1);
}

main().catch((error) => {
  console.error(`backfill failed: ${error.message}`);
  process.exit(1);
});
