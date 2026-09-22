#!/usr/bin/env node

/**
 * Fetches skills from SkillsMP API and transforms them into SkillX seed format.
 * RESUMABLE: Saves progress after each page so interrupted runs can continue.
 *
 * Usage: SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-skills.mjs
 *        SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-skills.mjs --reset  (start fresh)
 *
 * The API caps results at 5000 per query (100 per page, 50 pages max).
 */

import { writeFile, readFile } from 'fs/promises';
import { canonicalizeSeedRecords } from './lib/seed-identity.mjs';
import { slugify } from '../packages/skill-identity/index.js';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_KEY = process.env.SKILLSMP_API_KEY;
const BASE_URL = 'https://skillsmp.com/api/v1/skills/search';
const PER_PAGE = 100;
const MAX_PAGES = 50;
const PROGRESS_FILE = join(__dirname, '.fetch-progress.json');
const SEED_FILE = join(__dirname, 'seed-data.json');

if (!API_KEY) {
  console.error('Error: SKILLSMP_API_KEY environment variable is required');
  process.exit(1);
}

// --- Progress tracking for resumability ---

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { lastPage: 0, fetchedSkills: [], seenIds: [] };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress) + '\n');
}

// --- Category inference ---

function inferCategory(name, description) {
  const text = `${name} ${description}`.toLowerCase();
  if (/test|spec|coverage|assertion|mock|jest|vitest|playwright/.test(text)) return 'testing';
  if (/plan|workflow|orchestrat|subagent|dispatch|execut.*plan/.test(text)) return 'planning';
  if (/market|seo|ads|email.*sequence|cro|conversion|landing|copy|brand|launch|pricing|referral/.test(text)) return 'marketing';
  if (/deploy|docker|ci\/cd|devops|kubernetes|cloudflare|aws|gcp/.test(text)) return 'devops';
  if (/database|sql|postgres|mongo|redis|migration|schema/.test(text)) return 'database';
  if (/security|auth|oauth|jwt|permission|encrypt/.test(text)) return 'security';
  if (/doc|readme|changelog|tutorial|guide/.test(text)) return 'documentation';
  return 'implementation';
}

// --- Data transformation helpers ---

function deriveInstallCommand(githubUrl, author, name) {
  if (!githubUrl) return `npx skills add ${author}/${name}`;
  const match = githubUrl.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (match) return `npx skills add ${match[1]}/${match[2]}/${name}`;
  return `npx skills add ${author}/${name}`;
}

function generateContent(name, description, author) {
  const title = name.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  return `# ${title}\n\n${description}\n\n## Author\n${author}`;
}

function normalizeRating(stars, maxStars) {
  if (stars <= 0) return 6.0;
  const ratio = Math.log(stars + 1) / Math.log(maxStars + 1);
  return Math.round((6.0 + ratio * 3.5) * 10) / 10;
}

function deriveRatingCount(stars) {
  return Math.max(10, Math.round((stars || 0) * 0.02));
}

// --- API fetching ---

async function fetchPage(query, page) {
  const url = `${BASE_URL}?q=${encodeURIComponent(query)}&page=${page}&limit=${PER_PAGE}&sortBy=stars`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllSkills() {
  const progress = await loadProgress();
  const seenIds = new Set(progress.seenIds);
  const allSkills = [...progress.fetchedSkills];
  const startPage = progress.lastPage + 1;

  if (startPage > 1) {
    console.log(`Resuming from page ${startPage} (${allSkills.length} skills already fetched)`);
  } else {
    console.log('Starting fresh fetch from SkillsMP API...');
  }

  // Get total pages from first request if starting fresh
  let totalPages = MAX_PAGES;
  if (startPage === 1) {
    const first = await fetchPage('*', 1);
    totalPages = Math.min(first.data.pagination.totalPages, MAX_PAGES);
    console.log(`Total available: ${first.data.pagination.totalAll} | Fetchable: ${Math.min(first.data.pagination.total, PER_PAGE * MAX_PAGES)} | Pages: ${totalPages}`);

    for (const skill of first.data.skills) {
      if (!seenIds.has(skill.id)) {
        seenIds.add(skill.id);
        allSkills.push(skill);
      }
    }
    // Save progress after page 1
    await saveProgress({ lastPage: 1, fetchedSkills: allSkills, seenIds: [...seenIds] });
    console.log(`Page 1/${totalPages} — ${allSkills.length} skills (saved)`);
  }

  // Fetch remaining pages
  for (let page = Math.max(startPage, 2); page <= totalPages; page++) {
    try {
      const result = await fetchPage('*', page);
      totalPages = Math.min(result.data.pagination.totalPages, MAX_PAGES);

      for (const skill of result.data.skills) {
        if (!seenIds.has(skill.id)) {
          seenIds.add(skill.id);
          allSkills.push(skill);
        }
      }

      // Save progress after every page
      await saveProgress({ lastPage: page, fetchedSkills: allSkills, seenIds: [...seenIds] });
      console.log(`Page ${page}/${totalPages} — ${allSkills.length} skills (saved)`);

      // Rate limit
      await new Promise(r => setTimeout(r, 200));
    } catch (err) {
      console.warn(`Page ${page} failed: ${err.message}. Progress saved — re-run to resume.`);
      break;
    }
  }

  return allSkills;
}

// --- Transform and merge ---

function transformSkills(rawSkills) {
  const maxStars = Math.max(...rawSkills.map(s => s.stars || 0));

  // Slugs are derived from source identity (repo + full path). The old suffix came from
  // `skill.id.slice(-6)`, which turned shared `.../SKILL.md` ids into the `-ill-md` slugs.
  const candidates = rawSkills.map((skill, index) => ({
    index,
    skill,
    source_url: skill.githubUrl || null,
    author: skill.author,
    name: skill.name,
    slug: slugify(`${skill.author}-${skill.name}`),
  }));

  const { kept, dropped } = canonicalizeSeedRecords(candidates);
  if (dropped.length > 0) {
    console.log(`Skipped ${dropped.length} duplicate source identity row(s)`);
  }

  return [...kept]
    .sort((a, b) => a.record.index - b.record.index)
    .map(({ record, slug }) => {
      const skill = record.skill;

      return {
        name: skill.name,
        slug,
        description: skill.description || `${skill.name} skill by ${skill.author}`,
        author: skill.author,
        source_url: skill.githubUrl || null,
        category: inferCategory(skill.name, skill.description || ''),
        content: generateContent(skill.name, skill.description || '', skill.author),
        install_command: deriveInstallCommand(skill.githubUrl, skill.author, skill.name),
        version: '1.0.0',
        is_paid: false,
        price_cents: 0,
        github_stars: skill.stars || 0,
        install_count: 0,
        avg_rating: normalizeRating(skill.stars || 0, maxStars),
        rating_count: deriveRatingCount(skill.stars || 0),
      };
    });
}

async function main() {
  // Handle --reset flag
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Progress reset. Starting fresh.\n');
  }

  const rawSkills = await fetchAllSkills();
  console.log(`\nFetched ${rawSkills.length} unique skills from SkillsMP.`);

  const transformed = transformSkills(rawSkills);

  // Merge with existing seed data (existing slugs take priority)
  let existing = [];
  try {
    existing = JSON.parse(await readFile(SEED_FILE, 'utf-8'));
  } catch { /* no existing file */ }

  const existingSlugs = new Set(existing.map(s => s.slug));
  const newSkills = transformed.filter(s => !existingSlugs.has(s.slug));
  const merged = [...existing, ...newSkills];

  await writeFile(SEED_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Existing: ${existing.length} | New from SkillsMP: ${newSkills.length} | Total: ${merged.length}`);
  console.log(`Saved to ${SEED_FILE}`);

  // Clean up progress file on successful completion
  try { await writeFile(PROGRESS_FILE, ''); } catch {}
  console.log('Progress file cleaned up. Done!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error('Re-run the script to resume from last saved progress.');
  process.exit(1);
});
