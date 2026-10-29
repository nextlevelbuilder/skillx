import { join } from 'node:path';
import { LIMITS } from '@skillx/skill-tree';
import { InstallError } from '../install/install-errors.js';
import { git, guardArgs, remoteOf } from './git-run.js';
import { scratchDir } from './scratch-dirs.js';
import type { ListedEntry, SourceSnapshot } from './skill-discovery.js';
import { isDiscoverable } from './skill-discovery.js';

/**
 * A git source, cloned into a private temporary directory and read from git
 * objects only. The clone is shallow, single-branch, has no checkout and asks
 * for no blobs (`--filter=blob:none`; a server without partial clone sends
 * them all): the listing comes from tree objects, and only the blobs
 * discovery or a chosen skill needs are fetched, in one batch each (a no-op
 * for blobs already there). A fetched blob is downloaded whole, since git
 * offers no way to learn a size first, so download time is bounded by the
 * per-call timeout; memory is bounded by reading sizes from the local object
 * headers before any content, and content in batches. No file of the
 * repository is written to disk, no checkout filter, LFS smudge or hook runs,
 * and a symlink stays a `120000` tree entry that the tree rules refuse. How
 * git is run, and how URL credentials are kept off disk, is in `git-run.ts`.
 * Every local call names the clone's `--git-dir`, never a repository found
 * from the directory or environment.
 */

const MAX_LISTING = 256 * 1024 * 1024;
const READ_BATCH = 64 * 1024 * 1024;

/** The clone command line. `transport` is `https` outside tests. */
export function cloneArgs(url: string, dest: string, ref?: string, transport = 'https'): string[] {
  return [
    ...guardArgs(transport),
    'clone', '--depth', '1', '--no-checkout', '--single-branch', '--no-tags', '--filter=blob:none',
    ...(ref === undefined ? [] : ['--branch', ref]),
    '--', url, dest,
  ];
}

type GitEntry = Omit<ListedEntry, 'size'> & { oid: string };

/** `ls-tree -r -z` records: every blob and submodule of the commit, with its mode. No size, so no blob is fetched. */
function parseTree(out: Buffer): GitEntry[] {
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: GitEntry[] = [];
  for (const record of out.toString('latin1').split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const m = /^(\d{6}) \w+ ([0-9a-f]{40,64})$/.exec(record.slice(0, tab));
    if (tab < 0 || !m) throw new InstallError('unexpected_error', 'git ls-tree printed an unexpected record');
    let path: string;
    try {
      path = decoder.decode(Buffer.from(record.slice(tab + 1), 'latin1'));
    } catch {
      throw new InstallError('incompatible', 'a path in the repository is not valid UTF-8');
    }
    const [mode, oid] = [m[1]!, m[2]!];
    const kind = mode === '120000' ? 'symlink' : mode === '160000' ? 'special' : 'regular';
    entries.push({ path, kind, mode: mode === '100664' ? '100644' : mode, oid });
  }
  return entries;
}

/** Splits `git cat-file --batch` output into blob contents, in request order. */
function splitBlobs(out: Buffer, oids: readonly string[]): Uint8Array[] {
  const blobs: Uint8Array[] = [];
  let at = 0;
  for (const oid of oids) {
    const newline = out.indexOf(0x0a, at);
    const [id, type, size] = out.subarray(at, newline).toString('utf8').split(' ');
    if (id !== oid || type !== 'blob' || size === undefined) throw new InstallError('unexpected_error', `git returned an unexpected object for ${oid}`);
    const start = newline + 1;
    blobs.push(new Uint8Array(out.subarray(start, start + Number(size))));
    at = start + Number(size) + 1;
  }
  return blobs;
}

/** Pins a call to the clone itself, never a repository found from the directory or environment. */
const inClone = (repo: string) => ['-C', repo, `--git-dir=${join(repo, '.git')}`];

/** Clones `url` and returns a snapshot of its HEAD; the clone is removed by `dispose`, or when the process exits or is interrupted. */
export function openGitSource(url: string, label: string, ref?: string, transport = 'https'): SourceSnapshot {
  const remote = remoteOf(url);
  const scratch = scratchDir('skillx-add-');
  const repo = join(scratch.dir, 'repo');
  // Missing blobs are fetched explicitly, in one batch; git 2.44+ also refuses to fetch them lazily here.
  const local = (args: string[], what: string, maxBuffer: number, input?: string) =>
    git([...guardArgs(transport), ...inClone(repo), ...args], what, { input, maxBuffer, config: remote.config, env: { GIT_NO_LAZY_FETCH: '1' } });
  try {
    git(cloneArgs(remote.url, repo, ref, transport), `cloning ${label}`, { config: remote.config, maxBuffer: 1024 * 1024 });
    let commit: string;
    try {
      commit = local(['rev-parse', '--verify', 'HEAD^{commit}'], 'git rev-parse', 4096).toString('utf8').trim();
    } catch {
      throw new InstallError('not_found', `${label} has no commit to read`);
    }
    const entries = parseTree(local(['ls-tree', '-r', '-z', '--full-tree', 'HEAD'], 'git ls-tree', MAX_LISTING));
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const fetched = new Set<string>();
    const sizes = new Map<string, number>();

    const fetchBlobs = (oids: readonly string[]) => {
      const want = [...new Set(oids)].filter((oid) => !fetched.has(oid) && !sizes.has(oid));
      if (want.length === 0) return;
      git(
        [...guardArgs(transport), ...inClone(repo), '-c', 'fetch.negotiationAlgorithm=noop', 'fetch', '-q', '--no-tags', '--no-write-fetch-head', '--recurse-submodules=no', '--filter=blob:none', '--stdin', 'origin'],
        `fetching files of ${label}`,
        { input: `${want.join('\n')}\n`, config: remote.config, maxBuffer: 1024 * 1024 },
      );
      want.forEach((oid) => fetched.add(oid));
    };
    const sizeOf = (list: readonly GitEntry[]): number[] => {
      const blobs = list.filter((e) => e.kind !== 'special');
      fetchBlobs(blobs.map((e) => e.oid));
      const unknown = [...new Set(blobs.map((e) => e.oid).filter((oid) => !sizes.has(oid)))];
      if (unknown.length > 0) {
        const out = local(['cat-file', '--batch-check'], 'git cat-file', unknown.length * 160 + 1024, `${unknown.join('\n')}\n`).toString('utf8');
        out.split('\n').filter(Boolean).forEach((line, i) => {
          const [id, type, size] = line.split(' ');
          if (id !== unknown[i] || type !== 'blob') throw new InstallError('unexpected_error', `git could not read object ${unknown[i]}`);
          sizes.set(id, Number(size));
        });
      }
      return list.map((e) => (e.kind === 'special' ? 0 : sizes.get(e.oid)!));
    };
    const readBlobs = (list: readonly GitEntry[]): Uint8Array[] => {
      const lengths = sizeOf(list);
      const blobs: Uint8Array[] = [];
      for (let i = 0; i < list.length; ) {
        let end = i + 1;
        let bytes = lengths[i]!;
        while (end < list.length && bytes + lengths[end]! <= READ_BATCH) bytes += lengths[end++]!;
        const oids = list.slice(i, end).map((e) => e.oid);
        blobs.push(...splitBlobs(local(['cat-file', '--batch'], 'git cat-file', bytes + oids.length * 160 + 1024, `${oids.join('\n')}\n`), oids));
        i = end;
      }
      return blobs;
    };
    const under = (d: string) => (p: string) => d === '' || p.startsWith(`${d}/`);
    const entry = (p: string): GitEntry => {
      const found = byPath.get(p);
      if (!found) throw new InstallError('unexpected_error', `${p} is not a file of ${label}`);
      return found;
    };

    return {
      label,
      commit,
      skillFiles: (searchPath) =>
        entries.filter((e) => e.kind === 'regular' && under(searchPath)(e.path) && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md')) && isDiscoverable(e.path, searchPath)).map((e) => e.path),
      sizes: (paths) => sizeOf(paths.map(entry)),
      hasDir: (path) => entries.some((e) => e.path.startsWith(`${path}/`)),
      entriesUnder: (d) => {
        const list = entries.filter((e) => under(d)(e.path));
        if (list.length > LIMITS.maxEntries) {
          throw new InstallError('incompatible', `${d || label} has more than ${LIMITS.maxEntries} entries`, { code: 'tree.limit_exceeded', dir: d });
        }
        const lengths = sizeOf(list);
        return list.map(({ path, kind, mode }, i) => ({ path: d === '' ? path : path.slice(d.length + 1), kind, mode, size: lengths[i]! }));
      },
      read: (paths) => {
        const blobs = readBlobs(paths.map(entry));
        return new Map(paths.map((p, i) => [p, blobs[i]!]));
      },
      dispose: scratch.remove,
    };
  } catch (error) {
    scratch.remove();
    throw error;
  }
}
