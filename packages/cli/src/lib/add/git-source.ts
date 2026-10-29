import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { InstallError } from '../install/install-errors.js';
import { isCommitRef, redactCredentials } from './add-source.js';
import type { ListedEntry, SourceSnapshot } from './skill-discovery.js';
import { isDiscoverable } from './skill-discovery.js';

/**
 * A git source, cloned into a private temporary directory and read from git
 * objects only. The clone is shallow, single-branch and has no checkout, so
 * no file of the repository is ever written to disk, no checkout filter, LFS
 * smudge or hook runs, and a symlink stays a `120000` tree entry that the
 * tree rules refuse. git runs with argument arrays (no shell), `--` before the
 * URL, every credential prompt off (`core.askPass=` plus an empty
 * `GIT_ASKPASS`, `GIT_TERMINAL_PROMPT=0`, `GCM_INTERACTIVE=never`), and only
 * the https transport allowed, so `ext::`, `file://` and `ssh` are refused by
 * git itself too, also on a redirect. Variables that point git at another
 * repository (`GIT_DIR`, `GIT_WORK_TREE`, ...) are never inherited, and every
 * read names the clone's `--git-dir`. Every message is redacted.
 */

const CLONE_TIMEOUT_MS = 120_000;
const MAX_OUTPUT = 1024 * 1024 * 1024;

/** Variables that redirect git to another repository, index or object store. */
const REPO_ENV = new Set(['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_OBJECT_DIRECTORY', 'GIT_ALTERNATE_OBJECT_DIRECTORIES', 'GIT_COMMON_DIR', 'GIT_NAMESPACE', 'GIT_CEILING_DIRECTORIES']);

export function gitEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  // Compared in upper case: Windows environment names are case-insensitive.
  const env = Object.fromEntries(Object.entries(base).filter(([key]) => !REPO_ENV.has(key.toUpperCase())));
  return { ...env, GIT_TERMINAL_PROMPT: '0', GCM_INTERACTIVE: 'never', GIT_ASKPASS: '', SSH_ASKPASS: '', GIT_LFS_SKIP_SMUDGE: '1' };
}

/** Pins a read to the clone itself, never a repository found from the directory or environment. */
const inClone = (repo: string) => ['-C', repo, `--git-dir=${join(repo, '.git')}`];

const guard = (transport: string) => ['-c', 'core.askPass=', '-c', 'protocol.allow=never', '-c', `protocol.${transport}.allow=always`];

/**
 * The command lines that read `ref` of `url` into `dest`. A branch or tag is
 * a shallow clone; a full commit id is fetched on its own (`init`, then
 * `fetch --depth 1 <url> <commit>`, then `HEAD` set to it), which the server
 * must allow for a reachable commit (GitHub and most hosts do).
 * `transport` is `https` outside tests.
 */
export function fetchCommitArgs(url: string, dest: string, commit: string, transport = 'https'): string[][] {
  return [
    ['init', '-q', '--template=', ...(commit.length === 64 ? ['--object-format=sha256'] : []), '--', dest],
    [...guard(transport), ...inClone(dest), 'fetch', '-q', '--depth', '1', '--no-tags', '--', url, `+${commit}:refs/skillx/commit`],
    [...inClone(dest), 'update-ref', '--no-deref', 'HEAD', commit],
  ];
}

/** The clone command line. `transport` is `https` outside tests. */
export function cloneArgs(url: string, dest: string, ref?: string, transport = 'https'): string[] {
  return [
    ...guard(transport),
    'clone', '--depth', '1', '--no-checkout', '--single-branch', '--no-tags',
    ...(ref === undefined ? [] : ['--branch', ref]),
    '--', url, dest,
  ];
}

function git(args: string[], what: string, input?: string): Buffer {
  const r = spawnSync('git', args, { env: gitEnv(), input, maxBuffer: MAX_OUTPUT, timeout: CLONE_TIMEOUT_MS, windowsHide: true });
  if (r.error) {
    const code = (r.error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') throw new InstallError('unexpected_error', 'git is not installed or not on PATH');
    if (code === 'ETIMEDOUT') throw new InstallError('network_error', `${what} timed out after ${CLONE_TIMEOUT_MS / 1000}s`);
    throw new InstallError('unexpected_error', `${what} failed: ${redactCredentials(r.error.message)}`);
  }
  if (r.status !== 0) {
    const stderr = redactCredentials(r.stderr.toString('utf8')).trim();
    const line = stderr.split('\n').filter((l) => !/^\s*$/.test(l)).pop() ?? `exit ${r.status}`;
    throw new InstallError(classify(stderr), `${what} failed: ${line}`);
  }
  return r.stdout;
}

function classify(stderr: string): 'auth_error' | 'not_found' | 'usage_error' | 'network_error' {
  if (/authentication failed|could not read (username|password)|terminal prompts disabled|returned error: 40[13]/i.test(stderr)) return 'auth_error';
  if (/repository .*not found|not found|not our ref|remote branch .* not found|returned error: 404/i.test(stderr)) return 'not_found';
  if (/transport .* not allowed|unsupported protocol/i.test(stderr)) return 'usage_error';
  return 'network_error';
}

/** `ls-tree -r -l -z` records: every blob and submodule of the commit, with its mode and size. */
function listTree(dir: string): Array<ListedEntry & { oid: string }> {
  const out = git([...inClone(dir), 'ls-tree', '-r', '-l', '-z', '--full-tree', 'HEAD'], 'git ls-tree');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const entries: Array<ListedEntry & { oid: string }> = [];
  for (const record of out.toString('latin1').split('\0')) {
    if (record === '') continue;
    const tab = record.indexOf('\t');
    const m = /^(\d{6}) \w+ ([0-9a-f]{40,64}) +(\S+)$/.exec(record.slice(0, tab));
    if (tab < 0 || !m) throw new InstallError('unexpected_error', 'git ls-tree printed an unexpected record');
    let path: string;
    try {
      path = decoder.decode(Buffer.from(record.slice(tab + 1), 'latin1'));
    } catch {
      throw new InstallError('incompatible', 'a path in the repository is not valid UTF-8');
    }
    const [mode, oid, size] = [m[1]!, m[2]!, m[3]!];
    const kind = mode === '120000' ? 'symlink' : mode === '160000' ? 'special' : 'regular';
    entries.push({ path, kind, mode: mode === '100664' ? '100644' : mode, size: size === '-' ? 0 : Number(size), oid });
  }
  return entries;
}

/** Splits `git cat-file --batch` output into blob contents, in request order. */
function readBlobs(dir: string, oids: readonly string[]): Uint8Array[] {
  if (oids.length === 0) return [];
  const out = git([...inClone(dir), 'cat-file', '--batch'], 'git cat-file', `${oids.join('\n')}\n`);
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

/**
 * A host may serve any commit of its object store, and on GitHub that holds
 * commits pushed only to a fork, so a commit id alone does not prove the
 * named repository has it. It is read only when a branch or tag of that
 * repository contains it: the recorded branch or tag first (`follow`), then
 * the default branch, then every branch and tag, as commits only where the
 * host supports `--filter=tree:0`; a branch holding it costs only later history.
 */
function assertOnBranchOrTag(repo: string, url: string, label: string, commit: string, transport: string, follow?: string): void {
  const what = `checking that a branch or tag of ${label} has ${commit}`;
  const fetch = (refspecs: string[]) => git([...guard(transport), ...inClone(repo), 'fetch', '-q', '--filter=tree:0', '--no-tags', '--', url, ...refspecs], what);
  const contained = () => git([...inClone(repo), 'for-each-ref', '--count=1', '--format=%(refname)', '--contains', commit, 'refs/skillx/head', 'refs/skillx/heads/', 'refs/skillx/tags/'], what).length > 0;
  const found = [...(follow === undefined ? [] : [follow]), 'HEAD'].some((ref) => {
    try {
      fetch([`+${ref}:refs/skillx/head`]);
    } catch {
      return false; // no such ref (or no HEAD): the full check below decides
    }
    return contained();
  });
  if (!found) {
    fetch(['+refs/heads/*:refs/skillx/heads/*', '+refs/tags/*:refs/skillx/tags/*']);
    if (!contained()) throw new InstallError('integrity_error', `no branch or tag of ${label} has commit ${commit}; a host can serve a commit that only a fork has, so it is not read`, { commit });
  }
  // The filtered fetch made the URL a promisor remote; without it no later read fetches a missing object.
  spawnSync('git', [...inClone(repo), 'config', '--remove-section', `remote.${url}`], { env: gitEnv(), windowsHide: true });
}

/** Clones `url` and returns a snapshot of its HEAD (`follow`: the branch or tag a commit `ref` is checked on first); the clone is removed by `dispose`. */
export function openGitSource(url: string, label: string, ref?: string, transport = 'https', follow?: string): SourceSnapshot {
  const dir = mkdtempSync(join(tmpdir(), 'skillx-add-'));
  const dispose = () => rmSync(dir, { recursive: true, force: true });
  try {
    const repo = join(dir, 'repo');
    if (ref !== undefined && isCommitRef(ref)) {
      for (const args of fetchCommitArgs(url, repo, ref, transport)) git(args, `fetching commit ${ref} of ${label}`);
    } else {
      git(cloneArgs(url, repo, ref, transport), `cloning ${label}`);
    }
    let commit: string;
    try {
      commit = git([...inClone(repo), 'rev-parse', '--verify', 'HEAD^{commit}'], 'git rev-parse').toString('utf8').trim();
    } catch {
      throw new InstallError('not_found', `${label} has no commit to read`);
    }
    if (ref !== undefined && isCommitRef(ref)) {
      if (commit !== ref) throw new InstallError('integrity_error', `${label} returned commit ${commit}, not ${ref}`);
      assertOnBranchOrTag(repo, url, label, commit, transport, follow);
    }
    const entries = listTree(repo);
    const byPath = new Map(entries.map((e) => [e.path, e]));
    const under = (d: string) => (p: string) => d === '' || p.startsWith(`${d}/`);
    return {
      label,
      commit,
      skillFiles: (searchPath) =>
        entries.filter((e) => e.kind === 'regular' && under(searchPath)(e.path) && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md')) && isDiscoverable(e.path, searchPath)).map((e) => e.path),
      hasDir: (path) => entries.some((e) => e.path.startsWith(`${path}/`)),
      entriesUnder: (d) => entries.filter((e) => under(d)(e.path)).map(({ path, kind, mode, size }) => ({ path: d === '' ? path : path.slice(d.length + 1), kind, mode, size })),
      read: (paths) => {
        const blobs = readBlobs(repo, paths.map((p) => byPath.get(p)!.oid));
        return new Map(paths.map((p, i) => [p, blobs[i]!]));
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
