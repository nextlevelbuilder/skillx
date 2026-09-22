#!/usr/bin/env node

/**
 * Fetches skills from SkillsMP using multiple keyword queries to bypass the
 * 5,000-per-query cap. Deduplicates across queries, saves to seed-data.json.
 *
 * RESUMABLE: Saves progress after each query batch.
 *
 * Usage: SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-all.mjs
 *        SKILLSMP_API_KEY=sk_live_... node scripts/fetch-skillsmp-all.mjs --reset
 */

import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { canonicalizeSeedRecords } from './lib/seed-identity.mjs';
import { slugify } from '../packages/skill-identity/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const API_KEY = process.env.SKILLSMP_API_KEY;
const BASE_URL = 'https://skillsmp.com/api/v1/skills/search';
const PER_PAGE = 100;
const MAX_PAGES = 50;
const PROGRESS_FILE = join(__dirname, '.fetch-all-progress.json');
const SEED_FILE = join(__dirname, 'seed-data.json');

if (!API_KEY) {
  console.error('Error: SKILLSMP_API_KEY environment variable required');
  process.exit(1);
}

// Diverse queries to maximize unique skill coverage
const QUERIES = [
  '*',
  // Broad tech keywords
  'react', 'vue', 'angular', 'svelte', 'next', 'nuxt',
  'python', 'javascript', 'typescript', 'rust', 'go', 'java', 'swift', 'kotlin',
  'node', 'deno', 'bun', 'express', 'fastapi', 'django', 'flask', 'rails',
  'docker', 'kubernetes', 'terraform', 'aws', 'gcp', 'azure', 'cloudflare',
  'database', 'postgres', 'mysql', 'mongodb', 'redis', 'sqlite', 'supabase',
  'security', 'auth', 'oauth', 'jwt', 'encryption',
  'test', 'jest', 'vitest', 'playwright', 'cypress',
  'deploy', 'ci', 'github', 'gitlab',
  'api', 'graphql', 'grpc', 'rest', 'websocket',
  'css', 'tailwind', 'sass', 'styled',
  'ai', 'ml', 'llm', 'openai', 'anthropic', 'gemini', 'agent',
  'mobile', 'flutter', 'expo', 'android', 'ios',
  'devops', 'monitoring', 'logging', 'performance',
  'documentation', 'markdown', 'readme',
  'lint', 'format', 'prettier', 'eslint',
  'webpack', 'vite', 'esbuild', 'rollup',
  'server', 'client', 'frontend', 'backend', 'fullstack',
  'component', 'hook', 'state', 'context', 'redux', 'zustand',
  'form', 'validation', 'schema', 'zod',
  'image', 'video', 'audio', 'media', 'file', 'upload',
  'email', 'notification', 'chat', 'realtime',
  'payment', 'stripe', 'billing', 'subscription',
  'analytics', 'tracking', 'seo',
  'blog', 'cms', 'content', 'editor',
  'map', 'chart', 'table', 'dashboard',
  'animation', 'canvas', 'svg', 'three',
  'i18n', 'locale', 'translation',
  'cache', 'queue', 'worker', 'cron', 'scheduler',
  'scraper', 'crawler', 'parser', 'pdf',
  'cli', 'terminal', 'shell', 'script',
  'config', 'env', 'secret', 'vault',
  'error', 'debug', 'log', 'trace',
  'migration', 'seed', 'fixture', 'mock',
  'plugin', 'extension', 'middleware', 'interceptor',
  'proxy', 'gateway', 'load', 'balancer',
  'search', 'filter', 'sort', 'pagination',
  'user', 'profile', 'role', 'permission',
  'template', 'scaffold', 'boilerplate', 'starter',
  'design', 'ui', 'ux', 'accessibility',
  'git', 'commit', 'branch', 'merge', 'rebase',
  'build', 'compile', 'bundle', 'minify',
  'refactor', 'clean', 'optimize', 'improve',
  'plan', 'workflow', 'pipeline', 'orchestrat',
  'data', 'stream', 'transform', 'etl',
  'math', 'crypto', 'hash', 'encode',
  'network', 'http', 'fetch', 'request',
  'storage', 'bucket', 'blob', 'object',
];

// --- Progress tracking ---

async function loadProgress() {
  try {
    const data = JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
    return {
      completedQueries: data.completedQueries || [],
      seenIds: new Set(data.seenIds || []),
      fetchedSkills: data.fetchedSkills || [],
    };
  } catch {
    return { completedQueries: [], seenIds: new Set(), fetchedSkills: [] };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify({
    completedQueries: progress.completedQueries,
    seenIds: [...progress.seenIds],
    fetchedSkills: progress.fetchedSkills,
  }) + '\n');
}

// --- API fetching ---

async function fetchPage(query, page) {
  const url = `${BASE_URL}?q=${encodeURIComponent(query)}&page=${page}&limit=${PER_PAGE}&sortBy=stars`;
  const res = await fetch(url, {
    headers: { 'Authorization': `Bearer ${API_KEY}` },
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

async function fetchAllForQuery(query, seenIds) {
  const newSkills = [];
  let totalPages = MAX_PAGES;

  for (let page = 1; page <= totalPages; page++) {
    try {
      const result = await fetchPage(query, page);
      totalPages = Math.min(result.data.pagination.totalPages, MAX_PAGES);

      let newOnPage = 0;
      for (const skill of result.data.skills) {
        if (!seenIds.has(skill.id)) {
          seenIds.add(skill.id);
          newSkills.push(skill);
          newOnPage++;
        }
      }

      // If no new skills on this page, remaining pages are likely duplicates
      if (newOnPage === 0 && page > 3) break;

      await new Promise(r => setTimeout(r, 150));
    } catch (err) {
      console.warn(`  Page ${page} failed: ${err.message}`);
      break;
    }
  }

  return newSkills;
}

// --- Transform ---

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

function transformSkills(rawSkills) {
  const maxStars = Math.max(...rawSkills.map(s => s.stars || 0), 1);

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

// --- Main ---

async function main() {
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Progress reset.\n');
  }

  const progress = await loadProgress();

  if (progress.completedQueries.length > 0) {
    console.log(`Resuming: ${progress.completedQueries.length} queries done, ${progress.seenIds.size} unique skills\n`);
  }

  const remainingQueries = QUERIES.filter(q => !progress.completedQueries.includes(q));
  console.log(`Queries: ${remainingQueries.length} remaining / ${QUERIES.length} total\n`);

  for (const query of remainingQueries) {
    const before = progress.seenIds.size;
    const newSkills = await fetchAllForQuery(query, progress.seenIds);
    progress.fetchedSkills.push(...newSkills);
    progress.completedQueries.push(query);

    const newCount = progress.seenIds.size - before;
    console.log(`"${query}" → +${newCount} new | Total: ${progress.seenIds.size} unique`);

    await saveProgress(progress);
  }

  console.log(`\nFetch complete: ${progress.fetchedSkills.length} new skills from queries`);

  // Transform and merge with existing seed data
  const transformed = transformSkills(progress.fetchedSkills);

  let existing = [];
  try { existing = JSON.parse(await readFile(SEED_FILE, 'utf-8')); } catch {}

  const existingSlugs = new Set(existing.map(s => s.slug));
  const newSkills = transformed.filter(s => !existingSlugs.has(s.slug));
  const merged = [...existing, ...newSkills];

  await writeFile(SEED_FILE, JSON.stringify(merged, null, 2) + '\n');
  console.log(`Existing: ${existing.length} | New: ${newSkills.length} | Total: ${merged.length}`);
  console.log(`Saved to ${SEED_FILE}`);

  // Clean up progress
  try { await writeFile(PROGRESS_FILE, ''); } catch {}
  console.log('Done!');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error('Re-run to resume from last query.');
  process.exit(1);
});
