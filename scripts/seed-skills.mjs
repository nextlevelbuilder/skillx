#!/usr/bin/env node

/**
 * Seeds skills to the SkillX API in batches.
 * RESUMABLE: Tracks seeded skill slugs so interrupted runs continue where they left off.
 *
 * Usage: ADMIN_SECRET=xxx node scripts/seed-skills.mjs
 *        ADMIN_SECRET=xxx API_URL=https://skillx.sh node scripts/seed-skills.mjs
 *        ADMIN_SECRET=xxx node scripts/seed-skills.mjs --reset  (start fresh)
 *
 * Options:
 *   --reset         Clear progress and start from scratch
 *   --batch=N       Skills per batch (default: 50)
 *   --skip-vectors  Skip Vectorize embedding (faster, backfill later)
 *   --from-batches  Read from seed-batches/*.json instead of seed-data.json
 *   --file=N        Seed only batch file N (e.g. --file=5 seeds batch-005.json)
 *   --range=A-B     Seed batch files A through B (e.g. --range=6-134)
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_URL = process.env.API_URL || 'http://localhost:5173';
const ADMIN_SECRET = process.env.ADMIN_SECRET;
const SEED_FILE = join(__dirname, 'seed-data.json');
const BATCHES_DIR = join(__dirname, 'seed-batches');
const PROGRESS_FILE = join(__dirname, '.seed-progress.json');

// Parse flags
const batchArg = process.argv.find(a => a.startsWith('--batch='));
const BATCH_SIZE = batchArg ? parseInt(batchArg.split('=')[1], 10) : 50;
const fromBatches = process.argv.includes('--from-batches');
const fileArg = process.argv.find(a => a.startsWith('--file='));
const rangeArg = process.argv.find(a => a.startsWith('--range='));

if (!ADMIN_SECRET) {
  console.error('Error: ADMIN_SECRET environment variable is required');
  console.error('Usage: ADMIN_SECRET=your-secret-key node scripts/seed-skills.mjs');
  process.exit(1);
}

// --- Progress tracking ---

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { seededSlugs: [] };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress) + '\n');
}

// --- Batch seeding ---

// Parse --skip-vectors flag
const skipVectors = process.argv.includes('--skip-vectors');

async function seedBatch(batch) {
  const url = skipVectors ? `${API_URL}/api/admin/seed?skip_vectors=true` : `${API_URL}/api/admin/seed`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Secret': ADMIN_SECRET,
    },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }

  return res.json();
}

async function loadFromBatches() {
  const files = (await readdir(BATCHES_DIR)).filter(f => f.endsWith('.json')).sort();

  let selected;
  if (fileArg) {
    const num = String(parseInt(fileArg.split('=')[1], 10)).padStart(3, '0');
    selected = files.filter(f => f === `batch-${num}.json`);
    if (selected.length === 0) throw new Error(`Batch file batch-${num}.json not found`);
  } else if (rangeArg) {
    const [a, b] = rangeArg.split('=')[1].split('-').map(Number);
    selected = files.filter(f => {
      const n = parseInt(f.match(/batch-(\d+)/)[1], 10);
      return n >= a && n <= b;
    });
    if (selected.length === 0) throw new Error(`No batch files in range ${a}-${b}`);
  } else {
    selected = files;
  }

  console.log(`Loading ${selected.length} batch file(s) from ${BATCHES_DIR}`);
  const allSkills = [];
  for (const file of selected) {
    const batch = JSON.parse(await readFile(join(BATCHES_DIR, file), 'utf-8'));
    allSkills.push(...batch);
  }
  console.log(`Loaded ${allSkills.length} skills from batch files\n`);
  return allSkills;
}

async function main() {
  // Handle --reset flag
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Seed progress reset.\n');
  }

  // Load seed data from batches or single file
  let allSkills;
  if (fromBatches || fileArg || rangeArg) {
    allSkills = await loadFromBatches();
  } else {
    allSkills = JSON.parse(await readFile(SEED_FILE, 'utf-8'));
  }

  const progress = await loadProgress();
  const seededSlugs = new Set(progress.seededSlugs);

  // Filter out already-seeded skills
  const remaining = allSkills.filter(s => !seededSlugs.has(s.slug));

  if (remaining.length === 0) {
    console.log(`All ${allSkills.length} skills already seeded. Use --reset to re-seed.`);
    return;
  }

  console.log(`Seeding to ${API_URL}/api/admin/seed`);
  console.log(`Total: ${allSkills.length} | Already seeded: ${seededSlugs.size} | Remaining: ${remaining.length} | Batch size: ${BATCH_SIZE}\n`);

  let totalSeeded = 0;
  let totalVectors = 0;

  // Process in batches
  for (let i = 0; i < remaining.length; i += BATCH_SIZE) {
    const batch = remaining.slice(i, i + BATCH_SIZE);
    const batchNum = Math.floor(i / BATCH_SIZE) + 1;
    const totalBatches = Math.ceil(remaining.length / BATCH_SIZE);

    // Prepare batch: stringify scripts JSON, keep references as array
    const prepared = batch.map(skill => ({
      ...skill,
      scripts: skill.scripts ? (typeof skill.scripts === 'string' ? skill.scripts : JSON.stringify(skill.scripts)) : undefined,
    }));

    try {
      const result = await seedBatch(prepared);
      totalSeeded += result.skills;
      totalVectors += result.vectors;

      // Mark batch slugs as seeded
      for (const skill of batch) {
        seededSlugs.add(skill.slug);
      }
      await saveProgress({ seededSlugs: [...seededSlugs] });

      console.log(`Batch ${batchNum}/${totalBatches} — ${result.skills} skills, ${result.vectors} vectors | Total: ${seededSlugs.size}/${allSkills.length}`);
    } catch (err) {
      console.error(`\nBatch ${batchNum} failed: ${err.message}`);
      console.error(`Progress saved (${seededSlugs.size} seeded). Re-run to resume.`);
      process.exit(1);
    }
  }

  console.log(`\nSeeding complete! Skills: ${totalSeeded} | Vectors: ${totalVectors}`);

  // Clean up progress on success
  try { await writeFile(PROGRESS_FILE, ''); } catch {}
  console.log('Progress file cleaned up. Done!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error('Re-run to resume from last saved progress.');
  process.exit(1);
});
