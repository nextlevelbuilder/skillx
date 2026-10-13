/**
 * Validation and build of `agentkit.skill-tree/v1` from the entries an input
 * presents (contract 4.1-4.7). Readers hand every entry over, of any kind
 * and noise included; `buildTree` applies the validation steps in contract
 * order, so every implementation reports the same first code.
 */
import { checkCollisions, checkFileDirs } from "./collision";
import { ERROR_CODES, SkillTreeError, treeError } from "./errors";
import { checkNfc, checkPathRules, isNoiseDirName, isNoiseFileName } from "./path-rules";
import {
  MODE_EXECUTABLE,
  MODE_REGULAR,
  MODE_SOURCE_RECORDED,
  TREE_SCHEMA,
  sortFiles,
  treeDigest,
} from "./serialize";
import type { FileMode, ModeSource, TreeFile, TreeManifest } from "./serialize";

/** Exact contract limits; changing one is a contract version change. */
export const LIMITS = {
  maxEntries: 10_000,
  maxFiles: 4_096,
  maxFileSize: 32 * 1024 * 1024,
  maxTreeSize: 256 * 1024 * 1024,
} as const;
export type TreeLimits = { maxEntries: number; maxFiles: number; maxFileSize: number; maxTreeSize: number };

/**
 * Entry kinds. `directory` and `metadata` (a PAX global header) add no file
 * but count toward the entry limit; every kind except `regular`, `directory`
 * and `metadata` fails with `tree.unsupported_entry`.
 */
export type EntryKind = "regular" | "symlink" | "hardlink" | "special" | "directory" | "metadata";

/** One presented entry. `mode` is a mode class or the raw octal form of a rejected header mode. */
export interface TreeEntry {
  path: string;
  /** False when the raw name bytes were not valid UTF-8 and `path` is a lossy decoding. */
  utf8Valid?: boolean;
  mode: string;
  size: number;
  sha256: string;
  kind?: EntryKind;
  paxRecords?: Readonly<Record<string, string>>;
  /** Explains why a non-regular or malformed entry is unsupported. */
  reason?: string;
}

const kindOf = (e: TreeEntry): EntryKind => e.kind ?? "regular";

/** Tree path of an entry: a directory entry's one trailing "/" is not part of it. */
function entryPath(e: TreeEntry): string {
  return kindOf(e) === "directory" && e.path.endsWith("/") ? e.path.slice(0, -1) : e.path;
}

function isNoiseEntry(e: TreeEntry): boolean {
  const p = entryPath(e);
  const slash = p.lastIndexOf("/");
  const name = p.slice(slash + 1);
  if (slash >= 0 && p.slice(0, slash).split("/").some(isNoiseDirName)) return true;
  switch (kindOf(e)) {
    case "directory":
      return isNoiseDirName(name);
    case "symlink":
      return isNoiseDirName(name) || isNoiseFileName(name);
    default:
      return isNoiseFileName(name);
  }
}

/** Maps a tar or zip header mode to its class; any other mode keeps its octal form and is rejected. */
export function headerMode(mode: number): string {
  const perm = mode & ~0o170000;
  if (perm === 0o644) return MODE_REGULAR;
  if (perm === 0o755) return MODE_EXECUTABLE;
  return `0${mode.toString(8)}`;
}

function isSparseRecord(key: string): boolean {
  return key.startsWith("GNU.sparse.");
}

const GLOBAL_ONLY_RECORDS = new Set(["path", "linkpath", "size"]);

function validateEntry(e: TreeEntry): SkillTreeError | null {
  const kind = kindOf(e);
  const records = Object.keys(e.paxRecords ?? {}).sort();
  const unsupported = (detail: string) => treeError(ERROR_CODES.unsupportedEntry, e.path, detail);
  if (kind === "directory") return null;
  if (kind === "metadata") {
    const key = records.find((k) => GLOBAL_ONLY_RECORDS.has(k) || isSparseRecord(k));
    return key === undefined ? null : unsupported(`PAX global header carries record ${JSON.stringify(key)}`);
  }
  if (kind !== "regular") return unsupported(e.reason ?? `entry is not a regular file (${kind})`);
  if (e.reason !== undefined) return unsupported(e.reason);
  const sparse = records.find(isSparseRecord);
  if (sparse !== undefined) return unsupported(`PAX record ${JSON.stringify(sparse)} marks a sparse file`);
  if (e.mode !== MODE_REGULAR && e.mode !== MODE_EXECUTABLE) return unsupported(`mode ${JSON.stringify(e.mode)} is not a regular file mode`);
  if (!Number.isSafeInteger(e.size) || e.size < 0) return unsupported(`size ${e.size} is not a non-negative integer`);
  if (!/^[0-9a-f]{64}$/.test(e.sha256)) return unsupported("sha256 is not 64 lowercase hex characters");
  return null;
}

/** File count and byte limits over every presented regular-file entry, noise included. */
export function checkLimits(entries: readonly TreeEntry[], listed: number, limits: TreeLimits): SkillTreeError | null {
  if (listed > limits.maxEntries) {
    return treeError(ERROR_CODES.limitExceeded, "", `tree has ${listed} entries, more than ${limits.maxEntries}`);
  }
  let count = 0;
  let total = 0;
  for (const e of entries) {
    if (kindOf(e) !== "regular") continue;
    if (++count > limits.maxFiles) return treeError(ERROR_CODES.limitExceeded, e.path, `tree has more than ${limits.maxFiles} files`);
    const size = Math.max(e.size, 0);
    if (size > limits.maxFileSize) return treeError(ERROR_CODES.limitExceeded, e.path, `file exceeds ${limits.maxFileSize} bytes`);
    if ((total += size) > limits.maxTreeSize) return treeError(ERROR_CODES.limitExceeded, e.path, `tree exceeds ${limits.maxTreeSize} bytes`);
  }
  return null;
}

function firstError<T>(items: readonly T[], check: (item: T) => SkillTreeError | null): SkillTreeError | null {
  for (const item of items) {
    const err = check(item);
    if (err !== null) return err;
  }
  return null;
}

export interface BuildOptions {
  /** Total entries the input presented, when it passes on fewer than it listed. */
  listed?: number;
  modeSource?: ModeSource;
  /** Test hook: smaller limits. Public readers always use the contract limits. */
  limits?: TreeLimits;
}

/**
 * Validates every presented entry and returns the sorted manifest with its
 * digest. Throws a `SkillTreeError` with the code of the first failing step.
 */
export function buildTree(entries: readonly TreeEntry[], options: BuildOptions = {}): TreeManifest {
  const limits = options.limits ?? LIMITS;
  const limitError = checkLimits(entries, options.listed ?? entries.length, limits);
  if (limitError !== null) throw limitError;
  // A PAX global header's name is metadata: never noise, never path-checked.
  const named = entries.filter((e) => kindOf(e) === "metadata" || !isNoiseEntry(e));
  const files = named.filter((e) => kindOf(e) !== "directory" && kindOf(e) !== "metadata");
  const dirs = named.filter((e) => kindOf(e) === "directory").map(entryPath);
  const filePaths = files.map((e) => e.path);
  const stages: Array<() => SkillTreeError | null> = [
    () => firstError(named, validateEntry),
    () => firstError(named, (e) => (kindOf(e) === "metadata" ? null : checkPathRules(entryPath(e), e.utf8Valid ?? true))),
    () => firstError(filePaths, checkNfc),
    () => (files.length === 0 ? treeError(ERROR_CODES.empty, "", "tree contains no files") : null),
    () => checkFileDirs(filePaths, dirs),
    () => checkCollisions(filePaths, dirs),
  ];
  const failure = firstError(stages, (stage) => stage());
  if (failure !== null) throw failure;
  const treeFiles: TreeFile[] = sortFiles(
    files.map((e) => ({ path: e.path, mode: e.mode as FileMode, size: e.size, sha256: e.sha256 })),
  );
  return {
    schema: TREE_SCHEMA,
    digest: treeDigest(treeFiles),
    modeSource: options.modeSource ?? MODE_SOURCE_RECORDED,
    files: treeFiles,
  };
}
