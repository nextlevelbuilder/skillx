/**
 * Fetch skill data from a public GitHub repository.
 * Supports root-level skills (whole repo) and subfolder skills (skill_path).
 * Tries SKILL.md -> CLAUDE.md -> README.md for content.
 * Uses GitHub REST API (unauthenticated — rate-limited to 60 req/hr/IP).
 */

import { baseSlug } from "@skillx/skill-identity";

export interface GitHubSkillData {
  name: string;
  /** Readable slug. The canonical slug is decided at registration against existing rows. */
  slug: string;
  description: string;
  content: string;
  author: string;
  source_url: string;
  /** Canonical identity: `owner/repo`. */
  source_repo: string;
  /** Full path of the skill inside the repo; "" for a repo-root skill. */
  source_path: string;
  category: string;
  install_command: string;
  github_stars: number;
}

interface GitHubRepoResponse {
  name: string;
  full_name: string;
  description: string | null;
  owner: { login: string };
  stargazers_count: number;
  topics: string[];
  html_url: string;
  default_branch: string;
}

/** Map GitHub topics to SkillX categories */
const TOPIC_CATEGORY_MAP: Record<string, string> = {
  "ai-agent": "agent",
  "ai-agents": "agent",
  "agent-skills": "agent",
  "claude": "agent",
  "llm": "agent",
  devops: "devops",
  deployment: "devops",
  "ci-cd": "devops",
  testing: "testing",
  security: "security",
  database: "database",
  frontend: "frontend",
  backend: "backend",
  api: "backend",
  documentation: "documentation",
  design: "design",
};

function inferCategory(topics: string[]): string {
  for (const topic of topics) {
    const category = TOPIC_CATEGORY_MAP[topic.toLowerCase()];
    if (category) return category;
  }
  return "general";
}

/** Content files to try at root level, in priority order */
const ROOT_CONTENT_FILES = ["SKILL.md", "CLAUDE.md", "README.md"];

/**
 * Fetch raw file content from GitHub repo's default branch.
 * Returns null if file doesn't exist (404).
 */
async function fetchRepoFile(
  owner: string,
  repo: string,
  branch: string,
  path: string,
): Promise<string | null> {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return res.text();
}

/** Extract first paragraph from markdown as description */
function extractDescription(content: string): string {
  const lines = content.split("\n");
  const paragraphs: string[] = [];
  let current = "";

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) continue; // skip headings
    if (trimmed === "") {
      if (current) {
        paragraphs.push(current.trim());
        current = "";
      }
      continue;
    }
    current += (current ? " " : "") + trimmed;
  }
  if (current) paragraphs.push(current.trim());

  return paragraphs[0] || "";
}

/**
 * Fetch skill data from a public GitHub repo.
 * @param owner - GitHub org/user
 * @param repo - Repository name
 * @param skillPath - Optional subfolder path (e.g. ".claude/skills/ui-ux-pro-max")
 * @throws Error if repo not found or not accessible.
 */
export async function fetchGitHubSkill(
  owner: string,
  repo: string,
  skillPath?: string,
): Promise<GitHubSkillData> {
  // Fetch repo metadata
  const repoRes = await fetch(
    `https://api.github.com/repos/${owner}/${repo}`,
    { headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "SkillX/1.0" } },
  );

  if (repoRes.status === 404) {
    throw new Error(`GitHub repository ${owner}/${repo} not found`);
  }
  if (repoRes.status === 403) {
    throw new Error("GitHub API rate limit exceeded. Try again later.");
  }
  if (!repoRes.ok) {
    throw new Error(`GitHub API error: ${repoRes.status}`);
  }

  const repoData = (await repoRes.json()) as GitHubRepoResponse;
  const branch = repoData.default_branch;

  // Determine skill name and content based on whether skillPath is provided
  if (skillPath) {
    return fetchSubfolderSkill(owner, repo, repoData, branch, skillPath);
  }

  return fetchRootSkill(owner, repo, repoData, branch);
}

/** Fetch a skill from a subfolder within the repo */
async function fetchSubfolderSkill(
  owner: string,
  repo: string,
  repoData: GitHubRepoResponse,
  branch: string,
  skillPath: string,
): Promise<GitHubSkillData> {
  const skillName = skillPath.includes("/")
    ? skillPath.substring(skillPath.lastIndexOf("/") + 1)
    : skillPath;

  // Try SKILL.md in the subfolder
  const content = await fetchRepoFile(owner, repo, branch, `${skillPath}/SKILL.md`);

  if (!content) {
    throw new Error(`No SKILL.md found at ${owner}/${repo}/${skillPath}`);
  }

  // The readable slug. Identity is `(source_repo, source_path)`, so two folders with the same
  // name in one repository stay two different skills instead of collapsing into one.
  const slug = baseSlug(owner, skillPath, repo);
  const sourceRepo = `${owner}/${repo}`.toLowerCase();
  const description = extractDescription(content) || `${skillName} skill from ${owner}/${repo}`;
  const sourceUrl = `${repoData.html_url}/tree/${branch}/${skillPath}`;

  return {
    name: skillName,
    slug,
    description,
    content,
    author: repoData.owner.login,
    source_url: sourceUrl,
    source_repo: sourceRepo,
    source_path: skillPath,
    category: inferCategory(repoData.topics || []),
    install_command: `npx skillx-sh use ${owner}/${repo}/${skillPath}`,
    github_stars: repoData.stargazers_count,
  };
}

/** Fetch a skill from the repo root (whole repo = one skill) */
async function fetchRootSkill(
  owner: string,
  repo: string,
  repoData: GitHubRepoResponse,
  branch: string,
): Promise<GitHubSkillData> {
  let content: string | null = null;
  for (const file of ROOT_CONTENT_FILES) {
    content = await fetchRepoFile(owner, repo, branch, file);
    if (content) break;
  }

  if (!content) {
    content = repoData.description || `# ${repoData.name}\n\nNo skill documentation found.`;
  }

  const slug = baseSlug(owner, "", repo);

  return {
    name: repoData.name,
    slug,
    description: repoData.description || `${owner}/${repo} skill`,
    content,
    author: repoData.owner.login,
    source_url: repoData.html_url,
    source_repo: `${owner}/${repo}`.toLowerCase(),
    source_path: "",
    category: inferCategory(repoData.topics || []),
    install_command: `npx skillx-sh use ${owner}/${repo}`,
    github_stars: repoData.stargazers_count,
  };
}
