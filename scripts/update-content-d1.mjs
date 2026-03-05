#!/usr/bin/env node

/**
 * Updates skill content directly in D1 via wrangler CLI with parallel execution.
 * Bypasses the Worker API to avoid payload/timeout limits.
 *
 * RESUMABLE: Tracks progress by slug.
 *
 * Usage: node scripts/update-content-d1.mjs
 *        node scripts/update-content-d1.mjs --range=1-50
 *        node scripts/update-content-d1.mjs --reset
 *        node scripts/update-content-d1.mjs --batch=50 --concurrency=3
 */

import { readFile, writeFile, readdir, unlink } from 'fs/promises';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const BATCHES_DIR = join(__dirname, 'seed-batches');
const PROGRESS_FILE = join(__dirname, '.content-update-progress.json');
const CWD = join(__dirname, '..', 'apps', 'web');
const DB_NAME = 'skillx-db';

// Parse flags
const rangeArg = process.argv.find(a => a.startsWith('--range='));
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 50;
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 3;

function escapeSQL(str) {
  if (!str) return "''";
  return "'" + str.replace(/'/g, "''") + "'";
}

async function loadProgress() {
  try {
    const data = JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
    return { updatedSlugs: new Set(data.updatedSlugs || []), count: data.count || 0 };
  } catch {
    return { updatedSlugs: new Set(), count: 0 };
  }
}

async function saveProgress(slugs, count) {
  await writeFile(PROGRESS_FILE, JSON.stringify({ updatedSlugs: [...slugs], count }) + '\n');
}

// Run wrangler d1 execute with a SQL file, returns promise
function runWrangler(sqlFile) {
  return new Promise((resolve, reject) => {
    exec(
      `npx wrangler d1 execute ${DB_NAME} --remote --file=${sqlFile}`,
      { cwd: CWD, timeout: 60000 },
      (err) => err ? reject(err) : resolve()
    );
  });
}

async function main() {
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Progress reset.\n');
  }

  const { updatedSlugs, count: startCount } = await loadProgress();
  let count = startCount;

  // Load batch files
  const allFiles = (await readdir(BATCHES_DIR)).filter(f => f.endsWith('.json')).sort();
  let selected = allFiles;
  if (rangeArg) {
    const [a, b] = rangeArg.split('=')[1].split('-').map(Number);
    selected = allFiles.filter(f => {
      const n = parseInt(f.match(/batch-(\d+)/)[1], 10);
      return n >= a && n <= b;
    });
  }

  // Collect skills needing update
  const toUpdate = [];
  for (const file of selected) {
    const skills = JSON.parse(await readFile(join(BATCHES_DIR, file), 'utf-8'));
    for (const s of skills) {
      if (updatedSlugs.has(s.slug)) continue;
      if (!s.content || s.content.length < 300) continue;
      // Truncate very large content to avoid D1 SQL size limits
      const content = s.content.length > 15000 ? s.content.slice(0, 15000) + '\n\n<!-- truncated -->' : s.content;
      toUpdate.push({ slug: s.slug, content });
    }
  }

  console.log(`Skills to update: ${toUpdate.length} | Already done: ${updatedSlugs.size} | Batch: ${BATCH_SIZE} | Concurrency: ${CONCURRENCY}\n`);

  // Split into batches
  const batches = [];
  for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
    batches.push(toUpdate.slice(i, i + BATCH_SIZE));
  }

  // Process batches with concurrency pool
  let batchIdx = 0;
  const totalBatches = batches.length;

  async function processBatch(idx) {
    const batch = batches[idx];
    const tmpFile = join(__dirname, `.tmp-update-${Date.now()}-${idx}-${Math.random().toString(36).slice(2,6)}.sql`);
    const sql = batch.map(s =>
      `UPDATE skills SET content = ${escapeSQL(s.content)} WHERE slug = ${escapeSQL(s.slug)};`
    ).join('\n');

    await writeFile(tmpFile, sql);

    try {
      await runWrangler(tmpFile);
      for (const s of batch) updatedSlugs.add(s.slug);
      count += batch.length;
    } finally {
      try { await unlink(tmpFile); } catch {}
    }
  }

  const startTime = Date.now();

  for (let i = 0; i < totalBatches; i += CONCURRENCY) {
    const chunk = [];
    for (let j = i; j < Math.min(i + CONCURRENCY, totalBatches); j++) {
      chunk.push(processBatch(j));
    }

    const results = await Promise.allSettled(chunk);
    for (const r of results) {
      if (r.status === 'rejected') {
        console.error(`\n⚠ Batch skipped: ${r.reason?.message?.slice(0, 120)}`);
      }
    }

    // Save progress every CONCURRENCY batches
    await saveProgress(updatedSlugs, count);

    const elapsed = (Date.now() - startTime) / 1000;
    const rate = count / elapsed;
    const remaining = ((toUpdate.length - count) / rate / 60).toFixed(1);
    const pct = ((count / toUpdate.length) * 100).toFixed(1);
    process.stdout.write(`\r${count}/${toUpdate.length} (${pct}%) | ${rate.toFixed(0)}/s | ETA: ${remaining}min`);
  }

  console.log(`\n\nDone! Updated ${count} skills with real content.`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
