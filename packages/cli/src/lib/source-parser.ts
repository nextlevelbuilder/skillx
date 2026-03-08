import { isAbsolute, resolve, normalize, sep } from 'path';
import type { ParsedSource } from './add-types.js';

/**
 * Extract owner/repo from a parsed source for tracking.
 * Returns null for local paths or unparseable sources.
 */
export function getOwnerRepo(parsed: ParsedSource): string | null {
  if (parsed.type === 'local') return null;

  // SSH URLs: git@github.com:owner/repo.git
  const sshMatch = parsed.url.match(/^git@[^:]+:(.+)$/);
  if (sshMatch) {
    const path = sshMatch[1]!.replace(/\.git$/, '');
    return path.includes('/') ? path : null;
  }

  if (!parsed.url.startsWith('http://') && !parsed.url.startsWith('https://')) {
    return null;
  }

  try {
    const url = new URL(parsed.url);
    const path = url.pathname.slice(1).replace(/\.git$/, '');
    return path.includes('/') ? path : null;
  } catch {
    return null;
  }
}

/** Extract owner and repo from "owner/repo" string */
export function parseOwnerRepo(ownerRepo: string): { owner: string; repo: string } | null {
  const match = ownerRepo.match(/^([^/]+)\/([^/]+)$/);
  return match ? { owner: match[1]!, repo: match[2]! } : null;
}

/** Sanitize subpath to prevent path traversal */
function sanitizeSubpath(subpath: string): string {
  const normalized = subpath.replace(/\\/g, '/');
  for (const segment of normalized.split('/')) {
    if (segment === '..') {
      throw new Error(
        `Unsafe subpath: "${subpath}" contains path traversal segments.`
      );
    }
  }
  return subpath;
}

/** Validate subpath stays within base directory */
export function isSubpathSafe(basePath: string, subpath: string): boolean {
  const normalizedBase = normalize(resolve(basePath));
  const normalizedTarget = normalize(resolve(basePath, subpath));
  return normalizedTarget.startsWith(normalizedBase + sep) || normalizedTarget === normalizedBase;
}

function isLocalPath(input: string): boolean {
  return (
    isAbsolute(input) ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    input === '.' ||
    input === '..' ||
    /^[a-zA-Z]:[/\\]/.test(input) // Windows absolute paths
  );
}

/**
 * Parse a source string into a structured format.
 * Supports: local paths, GitHub URLs, GitLab URLs, GitHub shorthand, git URLs.
 */
export function parseSource(input: string): ParsedSource {
  // github: prefix shorthand
  const githubPrefix = input.match(/^github:(.+)$/);
  if (githubPrefix) return parseSource(githubPrefix[1]!);

  // gitlab: prefix shorthand
  const gitlabPrefix = input.match(/^gitlab:(.+)$/);
  if (gitlabPrefix) return parseSource(`https://gitlab.com/${gitlabPrefix[1]!}`);

  // Local path
  if (isLocalPath(input)) {
    const resolvedPath = resolve(input);
    return { type: 'local', url: resolvedPath, localPath: resolvedPath };
  }

  // GitHub URL with path: .../tree/branch/path
  const ghTreePath = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)\/(.+)/);
  if (ghTreePath) {
    const [, owner, repo, ref, subpath] = ghTreePath;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      ref,
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
    };
  }

  // GitHub URL with branch only: .../tree/branch
  const ghTree = input.match(/github\.com\/([^/]+)\/([^/]+)\/tree\/([^/]+)$/);
  if (ghTree) {
    const [, owner, repo, ref] = ghTree;
    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, ref };
  }

  // GitHub URL: https://github.com/owner/repo
  const ghRepo = input.match(/github\.com\/([^/]+)\/([^/]+)/);
  if (ghRepo) {
    const [, owner, repo] = ghRepo;
    const cleanRepo = repo!.replace(/\.git$/, '');
    return { type: 'github', url: `https://github.com/${owner}/${cleanRepo}.git` };
  }

  // GitLab URL with path
  const glTreePath = input.match(/^(https?):\/\/([^/]+)\/(.+?)\/-\/tree\/([^/]+)\/(.+)/);
  if (glTreePath && glTreePath[2] !== 'github.com') {
    const [, protocol, hostname, repoPath, ref, subpath] = glTreePath;
    return {
      type: 'gitlab',
      url: `${protocol}://${hostname}/${repoPath!.replace(/\.git$/, '')}.git`,
      ref,
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
    };
  }

  // GitLab URL
  const glRepo = input.match(/gitlab\.com\/(.+?)(?:\.git)?\/?$/);
  if (glRepo && glRepo[1]!.includes('/')) {
    return { type: 'gitlab', url: `https://gitlab.com/${glRepo[1]!}.git` };
  }

  // GitHub shorthand with @skill filter: owner/repo@skill-name
  const atSkill = input.match(/^([^/]+)\/([^/@]+)@(.+)$/);
  if (atSkill && !input.includes(':') && !input.startsWith('.')) {
    const [, owner, repo, skillFilter] = atSkill;
    return { type: 'github', url: `https://github.com/${owner}/${repo}.git`, skillFilter };
  }

  // GitHub shorthand: owner/repo or owner/repo/subpath
  const shorthand = input.match(/^([^/]+)\/([^/]+)(?:\/(.+))?$/);
  if (shorthand && !input.includes(':') && !input.startsWith('.')) {
    const [, owner, repo, subpath] = shorthand;
    return {
      type: 'github',
      url: `https://github.com/${owner}/${repo}.git`,
      subpath: subpath ? sanitizeSubpath(subpath) : subpath,
    };
  }

  // Fallback: direct git URL
  return { type: 'git', url: input };
}
