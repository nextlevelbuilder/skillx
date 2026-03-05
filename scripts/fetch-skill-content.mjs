#!/usr/bin/env node

/**
 * Fetches SKILL.md content from GitHub for each skill in seed-batches/.
 * Enriches batch files in-place with real content instead of stub descriptions.
 *
 * RESUMABLE: Tracks progress per batch file. Re-run to continue.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs --file=10
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs --range=1-50
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs --reset
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs --concurrency=20
 *
 * Options:
 *   --reset          Clear progress and start fresh
 *   --file=N         Process only batch file N
 *   --range=A-B      Process batch files A through B
 *   --concurrency=N  Parallel fetches per batch (default: 10)
 *   --dry-run        Show what would be fetched without writing
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BATCHES_DIR = join(__dirname, 'seed-batches');
const PROGRESS_FILE = join(__dirname, '.content-fetch-progress.json');

// Parse flags
const fileArg = process.argv.find(a => a.startsWith('--file='));
const rangeArg = process.argv.find(a => a.startsWith('--range='));
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency='));
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 10;
const DRY_RUN = process.argv.includes('--dry-run');

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable required');
  console.error('Usage: GITHUB_TOKEN=ghp_... node scripts/fetch-skill-content.mjs');
  process.exit(1);
}

// --- Progress tracking ---

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { completedFiles: [], stats: { fetched: 0, failed: 0, skipped: 0 } };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n');
}

// --- GitHub raw URL derivation ---

function toRawSkillMdUrl(sourceUrl) {
  // Pattern: https://github.com/{owner}/{repo}/tree/{branch}/{path}
  const m = sourceUrl.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/);
  if (!m) return null;
  return `https://raw.githubusercontent.com/${m[1]}/${m[2]}/${m[3]}/${m[4]}/SKILL.md`;
}

// --- Fetch with retry ---

async function fetchSkillMd(url) {
  const headers = { 'Authorization': `token ${GITHUB_TOKEN}` };

  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers });

      if (res.status === 404) return null; // No SKILL.md
      if (res.status === 403) {
        // Rate limited — check reset time
        const reset = res.headers.get('x-ratelimit-reset');
        const remaining = res.headers.get('x-ratelimit-remaining');
        if (remaining === '0' && reset) {
          const waitMs = (parseInt(reset, 10) * 1000) - Date.now() + 1000;
          if (waitMs > 0 && waitMs < 120000) {
            console.warn(`  Rate limited, waiting ${Math.ceil(waitMs / 1000)}s...`);
            await new Promise(r => setTimeout(r, waitMs));
            continue;
          }
        }
        return null;
      }
      if (!res.ok) return null;

      const text = await res.text();
      // Skip empty or very short content
      if (text.trim().length < 20) return null;
      return text;
    } catch {
      if (attempt === 2) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// --- Process batch with concurrency ---

async function processBatch(batchFile, batchSkills) {
  let fetched = 0, failed = 0, skipped = 0;

  // Process in chunks of CONCURRENCY
  for (let i = 0; i < batchSkills.length; i += CONCURRENCY) {
    const chunk = batchSkills.slice(i, i + CONCURRENCY);

    const results = await Promise.all(chunk.map(async (skill) => {
      // Skip if content already looks real (not a stub)
      if (skill.content && skill.content.length > 300 && !skill.content.endsWith(`## Author\n${skill.author}`)) {
        return { skill, content: null, status: 'skipped' };
      }

      const rawUrl = toRawSkillMdUrl(skill.source_url);
      if (!rawUrl) return { skill, content: null, status: 'no-url' };

      const content = await fetchSkillMd(rawUrl);
      return { skill, content, status: content ? 'fetched' : 'failed' };
    }));

    for (const { skill, content, status } of results) {
      if (status === 'fetched') {
        skill.content = content;
        fetched++;
      } else if (status === 'failed' || status === 'no-url') {
        failed++;
      } else {
        skipped++;
      }
    }
  }

  return { fetched, failed, skipped };
}

// --- Main ---

async function main() {
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Progress reset.\n');
  }

  // Determine which batch files to process
  const allFiles = (await readdir(BATCHES_DIR)).filter(f => f.endsWith('.json')).sort();
  let selected;

  if (fileArg) {
    const num = String(parseInt(fileArg.split('=')[1], 10)).padStart(3, '0');
    selected = allFiles.filter(f => f === `batch-${num}.json`);
    if (selected.length === 0) throw new Error(`Batch file batch-${num}.json not found`);
  } else if (rangeArg) {
    const [a, b] = rangeArg.split('=')[1].split('-').map(Number);
    selected = allFiles.filter(f => {
      const n = parseInt(f.match(/batch-(\d+)/)[1], 10);
      return n >= a && n <= b;
    });
  } else {
    selected = allFiles;
  }

  const progress = await loadProgress();
  const completedSet = new Set(progress.completedFiles);
  const remaining = selected.filter(f => !completedSet.has(f));

  console.log(`Batch files: ${selected.length} selected, ${completedSet.size} done, ${remaining.length} remaining`);
  console.log(`Concurrency: ${CONCURRENCY} | Dry run: ${DRY_RUN}\n`);

  if (remaining.length === 0) {
    console.log('All selected files already processed. Use --reset to redo.');
    return;
  }

  let totalFetched = progress.stats.fetched;
  let totalFailed = progress.stats.failed;
  let totalSkipped = progress.stats.skipped;

  for (const file of remaining) {
    const filePath = join(BATCHES_DIR, file);
    const skills = JSON.parse(await readFile(filePath, 'utf-8'));

    const { fetched, failed, skipped } = await processBatch(file, skills);
    totalFetched += fetched;
    totalFailed += failed;
    totalSkipped += skipped;

    if (!DRY_RUN && fetched > 0) {
      await writeFile(filePath, JSON.stringify(skills, null, 2) + '\n');
    }

    progress.completedFiles.push(file);
    progress.stats = { fetched: totalFetched, failed: totalFailed, skipped: totalSkipped };
    await saveProgress(progress);

    console.log(`${file} — ${fetched} fetched, ${failed} failed, ${skipped} skipped | Total: ${totalFetched}/${totalFetched + totalFailed + totalSkipped}`);
  }

  console.log(`\nDone! Fetched: ${totalFetched} | Failed: ${totalFailed} | Skipped: ${totalSkipped}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error('Re-run to resume.');
  process.exit(1);
});
