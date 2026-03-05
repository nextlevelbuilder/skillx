#!/usr/bin/env node

/**
 * Discovers references/ and scripts/ from GitHub repos, fetches content,
 * and enriches seed-batches/*.json with references + scripts metadata.
 *
 * RESUMABLE: Tracks completed repos. Re-run to continue.
 *
 * Usage:
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-refs-scripts.mjs
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-refs-scripts.mjs --top-n=50
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-refs-scripts.mjs --file=10
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-refs-scripts.mjs --dry-run
 *   GITHUB_TOKEN=ghp_... node scripts/fetch-skill-refs-scripts.mjs --reset
 *
 * Options:
 *   --top-n=N        Process only top N skills by install_count (staged rollout)
 *   --file=N         Process only batch file N
 *   --range=A-B      Process batch files A through B
 *   --concurrency=N  Parallel content fetches (default: 5)
 *   --dry-run        Show what would be fetched without writing
 *   --reset          Clear progress and start fresh
 */

import { readFile, writeFile, readdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const BATCHES_DIR = join(__dirname, 'seed-batches');
const PROGRESS_FILE = join(__dirname, '.refs-scripts-progress.json');
const MAX_REF_CONTENT_SIZE = 15000; // ~150 lines max per reference

// Parse flags
const topNArg = process.argv.find(a => a.startsWith('--top-n='));
const fileArg = process.argv.find(a => a.startsWith('--file='));
const rangeArg = process.argv.find(a => a.startsWith('--range='));
const concurrencyArg = process.argv.find(a => a.startsWith('--concurrency='));
const TOP_N = topNArg ? parseInt(topNArg.split('=')[1], 10) : Infinity;
const CONCURRENCY = concurrencyArg ? parseInt(concurrencyArg.split('=')[1], 10) : 5;
const DRY_RUN = process.argv.includes('--dry-run');

if (!GITHUB_TOKEN) {
  console.error('Error: GITHUB_TOKEN environment variable required');
  process.exit(1);
}

const headers = { Authorization: `token ${GITHUB_TOKEN}` };

// --- Progress tracking ---

async function loadProgress() {
  try {
    return JSON.parse(await readFile(PROGRESS_FILE, 'utf-8'));
  } catch {
    return { completedRepos: [], stats: { repos: 0, refs: 0, scripts: 0, skipped: 0 } };
  }
}

async function saveProgress(progress) {
  await writeFile(PROGRESS_FILE, JSON.stringify(progress, null, 2) + '\n');
}

// --- GitHub URL parsing ---

function parseSourceUrl(url) {
  if (!url) return null;
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.*)/);
  if (!m) return null;
  return { owner: m[1], repo: m[2], branch: m[3], skillPath: m[4] };
}

// --- GitHub API ---

async function fetchWithRateLimit(url) {
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await fetch(url, { headers });
    if (res.status === 403) {
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
    return res.json();
  }
  return null;
}

async function fetchRepoTree(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${branch}?recursive=1`;
  const data = await fetchWithRateLimit(url);
  if (!data) return { tree: [], truncated: false };
  return { tree: data.tree || [], truncated: !!data.truncated };
}

async function fetchDirContents(owner, repo, branch, dirPath) {
  const url = `https://api.github.com/repos/${owner}/${repo}/contents/${encodeURIComponent(dirPath)}?ref=${branch}`;
  return await fetchWithRateLimit(url) || [];
}

async function fetchRawContent(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(url, { headers });
      if (res.status === 403) {
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
      if (text.length > MAX_REF_CONTENT_SIZE) {
        return text.slice(0, MAX_REF_CONTENT_SIZE);
      }
      return text;
    } catch {
      if (attempt === 2) return null;
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  return null;
}

// --- Skill resource discovery ---

function findSkillResources(tree, skillPath) {
  const refsPrefix = `${skillPath}/references/`;
  const scriptsPrefix = `${skillPath}/scripts/`;
  const refs = tree.filter(f =>
    f.type === 'blob' &&
    f.path.startsWith(refsPrefix) &&
    f.path.endsWith('.md')
  );
  const scripts = tree.filter(f =>
    f.type === 'blob' &&
    f.path.startsWith(scriptsPrefix) &&
    !f.path.endsWith('.md')
  );
  return { refs, scripts };
}

function extractScriptMeta(treePath, owner, repo, branch) {
  const filename = treePath.split('/').pop();
  const name = filename.replace(/\.(py|js|sh|ts|mjs|cjs)$/, '');
  const ext = filename.split('.').pop();
  const runners = { py: 'python', js: 'node', ts: 'npx tsx', sh: 'bash', mjs: 'node', cjs: 'node' };
  const runner = runners[ext] || '';
  return {
    name,
    command: runner ? `${runner} scripts/${filename}` : `scripts/${filename}`,
    url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${treePath}`,
  };
}

function refTitleFromFilename(filename) {
  return filename
    .replace(/\.md$/, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

// --- Main pipeline ---

async function main() {
  if (process.argv.includes('--reset')) {
    try { await writeFile(PROGRESS_FILE, ''); } catch {}
    console.log('Progress reset.\n');
  }

  // Load all batch files
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

  // Load all skills across selected batches
  const batchData = new Map(); // filename -> skills array
  let allSkills = [];
  for (const file of selected) {
    const skills = JSON.parse(await readFile(join(BATCHES_DIR, file), 'utf-8'));
    batchData.set(file, skills);
    allSkills.push(...skills.map(s => ({ ...s, _batchFile: file })));
  }

  // Apply --top-n filter (by install_count descending)
  if (TOP_N < allSkills.length) {
    allSkills.sort((a, b) => (b.install_count || 0) - (a.install_count || 0));
    allSkills = allSkills.slice(0, TOP_N);
  }

  // Group skills by repo (deduplicate tree fetches)
  const repoMap = new Map(); // "owner/repo" -> { branch, skills: [{slug, skillPath, _batchFile}] }
  for (const skill of allSkills) {
    const parsed = parseSourceUrl(skill.source_url);
    if (!parsed) continue;
    const key = `${parsed.owner}/${parsed.repo}`;
    if (!repoMap.has(key)) {
      repoMap.set(key, { owner: parsed.owner, repo: parsed.repo, branch: parsed.branch, skills: [] });
    }
    repoMap.get(key).skills.push({
      slug: skill.slug,
      skillPath: parsed.skillPath,
      _batchFile: skill._batchFile,
    });
  }

  const progress = await loadProgress();
  const completedSet = new Set(progress.completedRepos);
  const repos = [...repoMap.entries()].filter(([key]) => !completedSet.has(key));

  console.log(`Skills: ${allSkills.length} | Unique repos: ${repoMap.size} | Remaining: ${repos.length}`);
  console.log(`Top-N: ${TOP_N === Infinity ? 'all' : TOP_N} | Concurrency: ${CONCURRENCY} | Dry run: ${DRY_RUN}\n`);

  if (repos.length === 0) {
    console.log('All repos already processed. Use --reset to redo.');
    return;
  }

  let totalRefs = progress.stats.refs;
  let totalScripts = progress.stats.scripts;
  let totalSkipped = progress.stats.skipped;
  let repoCount = progress.stats.repos;

  // Track enrichments per batch file
  const batchEnrichments = new Map(); // slug -> { references, scripts }

  for (const [repoKey, repoData] of repos) {
    const { owner, repo, branch, skills: repoSkills } = repoData;

    // 1. Fetch repo tree
    const { tree, truncated } = await fetchRepoTree(owner, repo, branch);
    if (truncated) {
      console.warn(`  Warning: ${repoKey} tree truncated — some refs may be missed`);
    }

    if (tree.length === 0) {
      totalSkipped += repoSkills.length;
      progress.completedRepos.push(repoKey);
      repoCount++;
      continue;
    }

    // 2. For each skill in this repo, find resources
    for (const skillInfo of repoSkills) {
      const { refs, scripts } = findSkillResources(tree, skillInfo.skillPath);

      // 3. Fetch reference content (with concurrency limit)
      const references = [];
      for (let i = 0; i < refs.length; i += CONCURRENCY) {
        const chunk = refs.slice(i, i + CONCURRENCY);
        const fetched = await Promise.all(chunk.map(async (ref) => {
          const filename = ref.path.split('/').pop();
          if (DRY_RUN) {
            console.log(`  [dry-run] Would fetch: ${ref.path}`);
            return null;
          }
          const content = await fetchRawContent(owner, repo, branch, ref.path);
          if (!content) return null;
          return {
            title: refTitleFromFilename(filename),
            filename,
            url: `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${ref.path}`,
            type: 'docs',
            content,
          };
        }));
        references.push(...fetched.filter(Boolean));
      }

      // 4. Extract script metadata (no content fetch needed)
      const scriptsMeta = scripts.map(s => extractScriptMeta(s.path, owner, repo, branch));

      totalRefs += references.length;
      totalScripts += scriptsMeta.length;

      if (references.length > 0 || scriptsMeta.length > 0) {
        batchEnrichments.set(skillInfo.slug, { references, scripts: scriptsMeta });
      }
    }

    progress.completedRepos.push(repoKey);
    repoCount++;
    progress.stats = { repos: repoCount, refs: totalRefs, scripts: totalScripts, skipped: totalSkipped };
    await saveProgress(progress);

    const skillSlugs = repoSkills.map(s => s.slug).join(', ');
    console.log(`${repoKey} — ${repoSkills.length} skills (${skillSlugs.slice(0, 60)}${skillSlugs.length > 60 ? '...' : ''})`);
  }

  // 5. Write enrichments back to batch files
  if (!DRY_RUN && batchEnrichments.size > 0) {
    for (const [file, skills] of batchData.entries()) {
      let modified = false;
      for (const skill of skills) {
        const enrichment = batchEnrichments.get(skill.slug);
        if (enrichment) {
          skill.references = enrichment.references;
          skill.scripts = enrichment.scripts;
          modified = true;
        }
      }
      if (modified) {
        await writeFile(join(BATCHES_DIR, file), JSON.stringify(skills, null, 2) + '\n');
      }
    }
  }

  console.log(`\nDone! Repos: ${repoCount} | Refs: ${totalRefs} | Scripts: ${totalScripts} | Skipped: ${totalSkipped}`);
  console.log(`Enriched skills: ${batchEnrichments.size}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  console.error('Re-run to resume.');
  process.exit(1);
});
