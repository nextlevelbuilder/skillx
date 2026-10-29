import { lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { join } from 'node:path';
import { InstallError, usageError } from '../install/install-errors.js';
import { containedPath, linkFreeParents } from '../install/safe-fs.js';
import { LIMITS } from '@skillx/skill-tree';
import type { EntryKind } from '@skillx/skill-tree';
import type { ListedEntry, SourceSnapshot } from './skill-discovery.js';
import { isDiscoverable } from './skill-discovery.js';

/**
 * A local directory source. Everything is listed with `lstat` and links are
 * never followed: a symlink or junction is listed as `symlink` (and refused
 * by the tree rules if it sits inside a chosen skill), a regular file with
 * more than one hard link as `hardlink` (refused too), anything else that is
 * not a file or directory as `special`. A file is read only when it is still a
 * regular, single-link file reached through real directories, so a swap after
 * the listing is refused, not followed.
 */

/** Discovery stops listing past this many entries: point at a smaller directory. */
const MAX_DISCOVERY_ENTRIES = 100_000;

function kindOf(stat: Stats): EntryKind {
  if (stat.isSymbolicLink()) return 'symlink';
  if (stat.isDirectory()) return 'directory';
  if (!stat.isFile()) return 'special';
  return stat.nlink > 1 ? 'hardlink' : 'regular';
}

const modeOf = (stat: Stats) => ((stat.mode & 0o111) !== 0 ? '100755' : '100644');

/** Lists `root/rel` recursively; `enter` decides which directories to walk into. */
function walk(root: string, rel: string, enter: (rel: string) => boolean, limit: number, tooMany: () => Error): ListedEntry[] {
  const out: ListedEntry[] = [];
  const visit = (dirRel: string) => {
    const abs = dirRel === '' ? root : containedPath(root, dirRel);
    for (const name of readdirSync(abs).sort()) {
      const path = dirRel === '' ? name : `${dirRel}/${name}`;
      const stat = lstatSync(join(abs, name));
      const kind = kindOf(stat);
      if (kind === 'directory') {
        if (enter(path)) visit(path);
        continue;
      }
      out.push({ path, kind, mode: modeOf(stat), size: stat.size });
      if (out.length > limit) throw tooMany();
    }
  };
  visit(rel);
  return out;
}

export function openLocalSource(dir: string): SourceSnapshot {
  let root: string;
  try {
    root = realpathSync(dir);
    if (!lstatSync(root).isDirectory()) throw new Error('not a directory');
  } catch {
    throw usageError(`${dir} is not a directory`);
  }
  const strip = (d: string) => (e: ListedEntry) => ({ ...e, path: d === '' ? e.path : e.path.slice(d.length + 1) });
  return {
    label: dir,
    skillFiles: (searchPath) =>
      walk(root, searchPath, (rel) => isDiscoverable(`${rel}/SKILL.md`, searchPath), MAX_DISCOVERY_ENTRIES, () =>
        usageError(`more than ${MAX_DISCOVERY_ENTRIES} files under ${dir}; point at the skill directory or a smaller tree`),
      )
        .filter((e) => e.kind === 'regular' && (e.path === 'SKILL.md' || e.path.endsWith('/SKILL.md')))
        .map((e) => e.path),
    hasDir: (path) => linkFreeParents(root, `${path}/x`),
    entriesUnder: (d) =>
      walk(root, d, () => true, LIMITS.maxEntries, () =>
        new InstallError('incompatible', `${d || dir} has more than ${LIMITS.maxEntries} entries`, { code: 'tree.limit_exceeded', dir: d }),
      ).map(strip(d)),
    read: (paths) => {
      const out = new Map<string, Uint8Array>();
      for (const path of paths) {
        const abs = containedPath(root, path);
        const stat = lstatSync(abs);
        if (!linkFreeParents(root, path) || kindOf(stat) !== 'regular') {
          throw new InstallError('incompatible', `${path} changed into a link or special file while it was read`, { path });
        }
        out.set(path, new Uint8Array(readFileSync(abs)));
      }
      return out;
    },
    dispose: () => {},
  };
}
