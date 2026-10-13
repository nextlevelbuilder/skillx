/**
 * Reads a package's files from git at an exact commit: paths and modes from
 * the commit's tree, bytes from the object store (`git cat-file`, no
 * checkout filters). The working tree, umask, mtimes and line-ending settings
 * never reach the release, so a local and a CI pack of one commit agree.
 */
import { spawnSync } from 'node:child_process';
import { statSync } from 'node:fs';
import { isNoisePath } from '@skillx/skill-tree';
import type { TarFile } from './deterministic-tar.js';

export interface GitPackSource {
  repoRoot: string;
  commit: string;
  /** Package root inside the repository; '' for the repository root. */
  path: string;
  files: TarFile[];
  excludedNoise: string[];
  /** Paths under the package root with uncommitted changes (not packed). */
  uncommitted: string[];
}

const MAX_GIT_OUTPUT = 1024 * 1024 * 1024;
const utf8 = new TextDecoder('utf-8', { fatal: true });

function git(cwd: string, args: string[], input?: string): Buffer {
  const result = spawnSync('git', args, { cwd, input, maxBuffer: MAX_GIT_OUTPUT });
  if (result.error) throw new Error(`cannot run git: ${result.error.message}`);
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr.toString('utf8').trim() || `exit ${result.status}`}`);
  }
  return result.stdout;
}

const gitText = (cwd: string, args: string[]) => git(cwd, args).toString('utf8').trim();

function isDirectory(value: string): boolean {
  try {
    return statSync(value).isDirectory();
  } catch {
    return false;
  }
}

function normalizePackagePath(raw: string): string {
  const trimmed = raw.replace(/\\/g, '/').replace(/^\.\/?/, '').replace(/\/+$/, '');
  if (trimmed.split('/').some((s) => s === '..')) throw new Error(`package path ${JSON.stringify(raw)} must stay inside the repository`);
  return trimmed;
}

function modeOf(mode: string, path: string): TarFile['mode'] {
  if (mode === '100644' || mode === '100664') return '100644';
  if (mode === '100755') return '100755';
  if (mode === '120000') throw new Error(`${path} is a symlink; releases contain regular files only`);
  if (mode === '160000') throw new Error(`${path} is a git submodule; releases contain regular files only`);
  throw new Error(`${path} has unsupported git mode ${mode}`);
}

/** Splits `git cat-file --batch` output into object contents by id. */
function parseBatch(out: Buffer, ids: string[]): Map<string, Uint8Array> {
  const objects = new Map<string, Uint8Array>();
  let at = 0;
  for (const id of ids) {
    const newline = out.indexOf(0x0a, at);
    const [oid, type, size] = out.subarray(at, newline).toString('utf8').split(' ');
    if (oid !== id || type !== 'blob' || size === undefined) throw new Error(`git cat-file returned an unexpected object for ${id}`);
    const start = newline + 1;
    const end = start + Number(size);
    objects.set(id, new Uint8Array(out.subarray(start, end)));
    at = end + 1;
  }
  return objects;
}

function listTree(repoRoot: string, commit: string, pkgPath: string) {
  const args = ['ls-tree', '-r', '-z', '--full-tree', commit];
  if (pkgPath !== '') args.push('--', `:(literal)${pkgPath}`);
  const records = git(repoRoot, args);
  const entries: Array<{ path: string; mode: TarFile['mode']; oid: string }> = [];
  const excludedNoise: string[] = [];
  const prefix = pkgPath === '' ? '' : `${pkgPath}/`;
  let at = 0;
  while (at < records.length) {
    const end = records.indexOf(0, at);
    const record = records.subarray(at, end < 0 ? records.length : end);
    at = end < 0 ? records.length : end + 1;
    const tab = record.indexOf(0x09);
    const [mode, , oid] = record.subarray(0, tab).toString('utf8').split(' ');
    let full: string;
    try {
      full = utf8.decode(record.subarray(tab + 1));
    } catch {
      throw new Error(`a path in ${commit} is not valid UTF-8`);
    }
    if (!full.startsWith(prefix)) throw new Error(`${pkgPath} is not a directory in ${commit}`);
    const path = full.slice(prefix.length);
    if (isNoisePath(path)) {
      excludedNoise.push(path);
      continue;
    }
    entries.push({ path, mode: modeOf(mode!, full), oid: oid! });
  }
  if (entries.length === 0) throw new Error(`no files under ${pkgPath === '' ? 'the repository root' : pkgPath} in ${commit}`);
  return { entries, excludedNoise };
}

/**
 * Resolves `<dir|git-ref>`: a directory packs HEAD of its repository with the
 * directory as package root; anything else is a git ref of the repository at
 * `cwd`, packed at `packagePath` (default: the repository root).
 */
export function readGitPackSource(input: string, options: { packagePath?: string; cwd?: string } = {}): GitPackSource {
  const cwd = options.cwd ?? process.cwd();
  const fromDir = isDirectory(input);
  if (fromDir && options.packagePath !== undefined) throw new Error('--path applies to a git ref, not a directory');
  const base = fromDir ? input : cwd;
  const repoRoot = gitText(base, ['rev-parse', '--show-toplevel']);
  const ref = fromDir ? 'HEAD' : input;
  if (ref.startsWith('-')) throw new Error(`invalid git ref ${JSON.stringify(ref)}`);
  const commit = gitText(repoRoot, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  if (!/^(?:[0-9a-f]{40}|[0-9a-f]{64})$/.test(commit)) throw new Error(`${ref} does not name a commit`);
  const pkgPath = normalizePackagePath(fromDir ? gitText(base, ['rev-parse', '--show-prefix']) : options.packagePath ?? '');

  const { entries, excludedNoise } = listTree(repoRoot, commit, pkgPath);
  const ids = [...new Set(entries.map((e) => e.oid))];
  const objects = parseBatch(git(repoRoot, ['cat-file', '--batch'], `${ids.join('\n')}\n`), ids);
  const files = entries.map((e) => ({ path: e.path, mode: e.mode, bytes: objects.get(e.oid)! }));

  let uncommitted: string[] = [];
  if (fromDir) {
    const status = git(repoRoot, ['status', '--porcelain', '-z', '--', pkgPath === '' ? '.' : `:(literal)${pkgPath}`]);
    uncommitted = status.toString('utf8').split('\0').filter(Boolean).map((line) => line.slice(3));
  }
  return { repoRoot, commit, path: pkgPath, files, excludedNoise, uncommitted };
}
