import { LIMITS, buildTree, isNoisePath, isSkillTreeError } from '@skillx/skill-tree';
import type { EntryKind, TreeEntry } from '@skillx/skill-tree';
import type { VerifiedTree } from '../install/fetch-verify.js';
import { sha256Hex } from '../install/fetch-verify.js';
import { InstallError, usageError } from '../install/install-errors.js';
import { readFrontmatter } from './skill-frontmatter.js';

/**
 * Finds skills in a source and turns a chosen one into a checked tree.
 *
 * A source is a snapshot: a listing of entries (from git objects or an
 * `lstat` walk, links never followed) and a reader for regular files. A skill
 * is a directory holding a regular `SKILL.md`; when the search path itself is
 * one, it is the only skill. Otherwise every such directory up to
 * `MAX_DEPTH` below it counts, outside noise directories and `node_modules`,
 * and a skill's own subdirectories are its content, not more skills. Sizes
 * come before bytes: more than `MAX_SKILL_FILES` candidates refuse the search
 * path, and a `SKILL.md` over `MAX_SKILL_MD_SIZE` is skipped unread.
 *
 * `prepareSkill` builds the tree with the registry's `agentkit.skill-tree/v1`
 * rules: a symlink, junction, hardlink, submodule or other special entry,
 * an unsafe or colliding path, or a tree over the limits refuses the skill
 * (`incompatible`); nothing is followed or copied from outside it.
 */

export interface ListedEntry {
  /** POSIX path relative to the directory it was listed under. */
  path: string;
  kind: EntryKind;
  mode: string;
  size: number;
}

export interface SourceSnapshot {
  /** Display name, never carrying credentials. */
  label: string;
  /** Commit read, for a git source. */
  commit?: string;
  /** Regular `SKILL.md` files under `searchPath` that discovery may consider, relative to the source root. */
  skillFiles(searchPath: string): string[];
  /** Sizes of regular files, read without their content. */
  sizes(paths: readonly string[]): number[];
  /** True when `path` names a directory of the source. */
  hasDir(path: string): boolean;
  /** Every entry under directory `dir` ('' for the root), relative to it. */
  entriesUnder(dir: string): ListedEntry[];
  /** Bytes of regular files, by path relative to the source root. */
  read(paths: readonly string[]): Map<string, Uint8Array>;
  dispose(): void;
}

export interface FoundSkill {
  name: string;
  description: string;
  /** Directory relative to the source root ('' for the root). */
  dir: string;
}

export interface SkippedSkill {
  dir: string;
  reason: string;
}

export const MAX_DEPTH = 6;
/** Discovery refuses a search path holding more `SKILL.md` files than this, before reading any of them. */
export const MAX_SKILL_FILES = 1000;
/** A larger `SKILL.md` is skipped unread. */
export const MAX_SKILL_MD_SIZE = 1024 * 1024;
const READ_CHUNK = 64;
const SKIPPED_DIRS = new Set(['node_modules']);

/** True when discovery may look at this `SKILL.md` path (depth, noise and skipped directories). */
export function isDiscoverable(path: string, searchPath: string): boolean {
  const rel = searchPath === '' ? path : path.slice(searchPath.length + 1);
  const segments = rel.split('/');
  return segments.length - 1 <= MAX_DEPTH && !isNoisePath(rel) && !segments.slice(0, -1).some((s) => SKIPPED_DIRS.has(s));
}

const parentOf = (path: string) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '');
const join = (dir: string, name: string) => (dir === '' ? name : `${dir}/${name}`);

export function discoverSkills(source: SourceSnapshot, searchPath: string): { skills: FoundSkill[]; skipped: SkippedSkill[] } {
  if (searchPath !== '' && !source.hasDir(searchPath)) {
    throw new InstallError('not_found', `${searchPath} is not a directory in ${source.label}`, { path: searchPath });
  }
  const files = source.skillFiles(searchPath);
  if (files.length > MAX_SKILL_FILES) {
    throw usageError(`more than ${MAX_SKILL_FILES} SKILL.md files under ${searchPath || 'the root'} of ${source.label}; point at a smaller directory`, { path: searchPath, count: files.length });
  }
  const root = join(searchPath, 'SKILL.md');
  const dirs = files.includes(root) ? [searchPath] : files.map(parentOf).sort();
  // A skill's subdirectories are its content: drop any skill nested inside another one.
  const outer = dirs.filter((d) => !dirs.some((o) => o !== d && (o === '' || d.startsWith(`${o}/`))));
  const sizes = source.sizes(outer.map((d) => join(d, 'SKILL.md')));
  const skills: FoundSkill[] = [];
  const skipped: SkippedSkill[] = [];
  const readable = outer.filter((dir, i) => {
    if (sizes[i]! <= MAX_SKILL_MD_SIZE) return true;
    skipped.push({ dir, reason: `SKILL.md is larger than ${MAX_SKILL_MD_SIZE} bytes` });
    return false;
  });
  // Read in chunks and keep only the front matter, so memory stays bounded by the chunk.
  for (let i = 0; i < readable.length; i += READ_CHUNK) {
    const chunk = readable.slice(i, i + READ_CHUNK);
    const bytes = source.read(chunk.map((d) => join(d, 'SKILL.md')));
    for (const dir of chunk) {
      const fm = readFrontmatter(bytes.get(join(dir, 'SKILL.md'))!);
      if (fm.ok) skills.push({ name: fm.name, description: fm.description, dir });
      else skipped.push({ dir, reason: fm.reason });
    }
  }
  skipped.sort((a, b) => (a.dir < b.dir ? -1 : a.dir > b.dir ? 1 : 0));
  return { skills, skipped };
}

const refused = (skill: FoundSkill, detail: string, extra: Record<string, unknown> = {}) =>
  new InstallError('incompatible', `cannot install ${skill.name} from ${skill.dir || 'the source root'}: ${detail}`, { skill: skill.name, dir: skill.dir, ...extra });

/** Checks the limits from the listing before any byte is read. */
function checkListedLimits(skill: FoundSkill, entries: readonly ListedEntry[]): void {
  if (entries.length > LIMITS.maxEntries) throw refused(skill, `more than ${LIMITS.maxEntries} entries`, { code: 'tree.limit_exceeded' });
  const files = entries.filter((e) => e.kind === 'regular');
  if (files.length > LIMITS.maxFiles) throw refused(skill, `more than ${LIMITS.maxFiles} files`, { code: 'tree.limit_exceeded' });
  const big = files.find((e) => e.size > LIMITS.maxFileSize);
  if (big) throw refused(skill, `${big.path} is larger than ${LIMITS.maxFileSize} bytes`, { code: 'tree.limit_exceeded', path: big.path });
  if (files.reduce((sum, e) => sum + e.size, 0) > LIMITS.maxTreeSize) throw refused(skill, `more than ${LIMITS.maxTreeSize} bytes`, { code: 'tree.limit_exceeded' });
}

/** The skill's files as a checked tree, ready for the installer. */
export function prepareSkill(source: SourceSnapshot, skill: FoundSkill): VerifiedTree {
  const listed = source.entriesUnder(skill.dir);
  checkListedLimits(skill, listed);
  const regular = listed.filter((e) => e.kind === 'regular' && !isNoisePath(e.path));
  const bytes = source.read(regular.map((e) => join(skill.dir, e.path)));
  const byPath = new Map(regular.map((e) => [e.path, bytes.get(join(skill.dir, e.path))!]));
  const entries: TreeEntry[] = listed.map((e) => {
    const data = byPath.get(e.path);
    return { path: e.path, kind: e.kind, mode: e.mode, size: data?.length ?? e.size, sha256: data ? sha256Hex(data) : '0'.repeat(64) };
  });
  try {
    const manifest = buildTree(entries);
    return {
      digest: manifest.digest,
      files: manifest.files.map((f) => ({ path: f.path, mode: f.mode as '100644' | '100755', sha256: f.sha256, size: f.size, bytes: byPath.get(f.path)! })),
    };
  } catch (error) {
    if (isSkillTreeError(error)) throw refused(skill, error.message, { code: error.code, path: error.path });
    throw error;
  }
}
