import { randomUUID } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { InstallLock } from '@skillx/contracts';
import { sha256Hex } from './fetch-verify.js';
import { InstallError } from './install-errors.js';

/**
 * Local installer state under `<skillxHome>`:
 *
 * - `receipts/<runtime>/<alias>.json` (`skillx.install-receipt/v1`): what one
 *   installed skill directory holds (every owned file with its SHA-256) and
 *   which sources require it (`requiredBy`, the ref-count).
 * - `owners/<runtime>.json` (`skillx.install-owners/v1`): per source, the ref
 *   it was installed from and its lock, so update and uninstall know which
 *   skills a source brought in.
 *
 * Files are written to a temporary name and renamed over the old one, so a
 * crash leaves either the old or the new document, never a torn one.
 */

export const RECEIPT_SCHEMA = 'skillx.install-receipt/v1';
export const OWNERS_SCHEMA = 'skillx.install-owners/v1';

export interface ReceiptFile {
  path: string;
  sha256: string;
  mode: '100644' | '100755';
}

export interface InstallReceipt {
  schema: typeof RECEIPT_SCHEMA;
  runtime: string;
  alias: string;
  package: string;
  version: string;
  releaseDigest: string;
  compositionDigest: string;
  overlayDigests: string[];
  files: ReceiptFile[];
  /** Owner keys of the sources that need this skill, sorted. Empty means removable. */
  requiredBy: string[];
  installedAt: string;
}

export interface OwnerRecord {
  ref: string;
  lock: InstallLock;
}

export interface OwnersFile {
  schema: typeof OWNERS_SCHEMA;
  owners: Record<string, OwnerRecord>;
}

export function writeJsonAtomic(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(value, null, 2)}\n`);
  renameSync(tmp, path);
}

function readJson<T>(path: string): T | null {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return null;
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new InstallError('unexpected_error', `${path} is corrupt; move it aside and run the command again`);
  }
}

const receiptsDir = (home: string, runtime: string) => join(home, 'receipts', runtime);
const receiptPath = (home: string, runtime: string, alias: string) => join(receiptsDir(home, runtime), `${alias}.json`);
const ownersPath = (home: string, runtime: string) => join(home, 'owners', `${runtime}.json`);

export const readReceipt = (home: string, runtime: string, alias: string) => readJson<InstallReceipt>(receiptPath(home, runtime, alias));
export const writeReceipt = (home: string, receipt: InstallReceipt) => writeJsonAtomic(receiptPath(home, receipt.runtime, receipt.alias), receipt);
export const deleteReceipt = (home: string, runtime: string, alias: string) => rmSync(receiptPath(home, runtime, alias), { force: true });

export function listReceipts(home: string, runtime: string): InstallReceipt[] {
  let names: string[];
  try {
    names = readdirSync(receiptsDir(home, runtime));
  } catch {
    return [];
  }
  return names
    .filter((n) => n.endsWith('.json'))
    .map((n) => readReceipt(home, runtime, n.slice(0, -'.json'.length)))
    .filter((r): r is InstallReceipt => r !== null)
    .sort((a, b) => (a.alias < b.alias ? -1 : 1));
}

export function readOwners(home: string, runtime: string): OwnersFile {
  return readJson<OwnersFile>(ownersPath(home, runtime)) ?? { schema: OWNERS_SCHEMA, owners: {} };
}

export function writeOwners(home: string, runtime: string, owners: OwnersFile): void {
  writeJsonAtomic(ownersPath(home, runtime), owners);
}

export interface LocalFile {
  path: string;
  sha256: string;
}

/** Regular files under `dir` with POSIX relative paths. Links and other non-files are listed with an empty hash. */
export function scanDir(dir: string): LocalFile[] {
  const out: LocalFile[] = [];
  const walk = (abs: string, rel: string) => {
    let entries: string[];
    try {
      entries = readdirSync(abs);
    } catch {
      return;
    }
    for (const name of entries) {
      const path = join(abs, name);
      const relPath = rel === '' ? name : `${rel}/${name}`;
      const stat = lstatSync(path);
      if (stat.isDirectory()) walk(path, relPath);
      else out.push({ path: relPath, sha256: stat.isFile() ? sha256Hex(readFileSync(path)) : '' });
    }
  };
  walk(dir, '');
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

export interface LocalState {
  exists: boolean;
  /** Receipt files whose content changed. */
  modified: string[];
  /** Receipt files that are gone. */
  missing: string[];
  /** Files the receipt does not list (all files when there is no receipt). */
  unknown: string[];
  /** Symlinks, junctions and other entries that are not regular files or directories. */
  links: string[];
}

export function inspectLocal(dir: string, receipt: InstallReceipt | null): LocalState {
  let isDir: boolean;
  try {
    isDir = lstatSync(dir).isDirectory();
  } catch {
    return { exists: false, modified: [], missing: receipt?.files.map((f) => f.path) ?? [], unknown: [], links: [] };
  }
  // A file or link where the skill directory belongs is never ours to replace.
  if (!isDir) return { exists: true, modified: [], missing: [], unknown: ['.'], links: ['.'] };
  const files = scanDir(dir);
  const links = files.filter((f) => f.sha256 === '').map((f) => f.path);
  const local = new Map(files.map((f) => [f.path, f.sha256]));
  const owned = new Map((receipt?.files ?? []).map((f) => [f.path, f.sha256]));
  const modified: string[] = [];
  const missing: string[] = [];
  for (const [path, sha] of owned) {
    const now = local.get(path);
    if (now === undefined) missing.push(path);
    else if (now !== sha) modified.push(path);
  }
  const unknown = [...local.keys()].filter((p) => !owned.has(p));
  return { exists: true, modified, missing, unknown, links };
}
