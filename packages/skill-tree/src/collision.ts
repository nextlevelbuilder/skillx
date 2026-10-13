/**
 * File-versus-directory and case-collision checks (contract 4.4, validation
 * steps 7 and 8). Keys use Unicode canonical caseless matching,
 * NFD(fold(NFD(path))), with the generated Unicode 15.0.0 tables.
 */
import { ERROR_CODES, SkillTreeError, treeError } from "./errors";
import { fold, nfd } from "./unicode-15";

/** Canonical caseless key of a path. Folding never touches "/". */
export function foldKey(p: string): string {
  return nfd(fold(nfd(p)));
}

/** Every directory prefix of `p`, shortest first. */
function dirPrefixes(p: string): string[] {
  const out: string[] = [];
  for (let i = p.indexOf("/"); i >= 0; i = p.indexOf("/", i + 1)) out.push(p.slice(0, i));
  return out;
}

/** A file whose exact path is also a directory of another file or a directory entry. */
export function checkFileDirs(files: readonly string[], dirEntries: readonly string[]): SkillTreeError | null {
  const dirs = new Map<string, string>();
  for (const file of files) {
    for (const dir of dirPrefixes(file)) if (!dirs.has(dir)) dirs.set(dir, file);
  }
  for (const file of files) {
    const child = dirs.get(file);
    if (child !== undefined) {
      return treeError(ERROR_CODES.unsafePath, file, `is a file and also the directory of ${JSON.stringify(child)}`);
    }
  }
  const entries = new Set(dirEntries);
  for (const file of files) {
    if (entries.has(file)) return treeError(ERROR_CODES.unsafePath, file, "is a file and also a directory entry");
  }
  return null;
}

/**
 * Paths a case-insensitive file system would merge: two files with equal
 * keys (including a path listed twice), a file whose key equals a directory
 * or directory entry key, and two distinct directories with equal keys.
 * Directory entries are compared with files only. Checks follow input order,
 * so a given entry list always reports the same path.
 */
export function checkCollisions(files: readonly string[], dirEntries: readonly string[]): SkillTreeError | null {
  const keys = files.map(foldKey);
  const byKey = new Map<string, string>();
  for (const [i, file] of files.entries()) {
    const key = keys[i]!;
    const prior = byKey.get(key);
    if (prior !== undefined) {
      return treeError(ERROR_CODES.caseCollision, file, `collides with ${JSON.stringify(prior)} under case folding`);
    }
    byKey.set(key, file);
  }
  const foldedDirs = new Map<string, { dir: string; file: string }>();
  let dirConflict: SkillTreeError | null = null;
  for (const [i, file] of files.entries()) {
    // "/" is a starter that neither folds, decomposes nor reorders, and nothing
    // folds or decomposes to it, so the key's prefixes are the prefixes' keys.
    const dirKeys = dirPrefixes(keys[i]!);
    for (const [j, dir] of dirPrefixes(file).entries()) {
      const key = dirKeys[j]!;
      const prior = foldedDirs.get(key);
      if (prior === undefined) foldedDirs.set(key, { dir, file });
      else if (prior.dir !== dir && dirConflict === null) {
        dirConflict = treeError(
          ERROR_CODES.caseCollision,
          file,
          `directory ${JSON.stringify(dir)} collides with directory ${JSON.stringify(prior.dir)} of ${JSON.stringify(prior.file)} under case folding`,
        );
      }
    }
  }
  for (const [i, file] of files.entries()) {
    const owner = foldedDirs.get(keys[i]!);
    if (owner !== undefined) {
      return treeError(ERROR_CODES.caseCollision, file, `collides under case folding with the directory of ${JSON.stringify(owner.file)}`);
    }
  }
  for (const dir of dirEntries) {
    const prior = byKey.get(foldKey(dir));
    if (prior !== undefined) {
      return treeError(ERROR_CODES.caseCollision, prior, `collides under case folding with directory entry ${JSON.stringify(dir)}`);
    }
  }
  return dirConflict;
}
