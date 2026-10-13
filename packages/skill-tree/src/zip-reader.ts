/**
 * Zip reader for `agentkit.skill-tree/v1` (schemas 2.1). The central
 * directory is read first; the local entries must be exactly its entries,
 * contiguous from offset 0 up to the central directory. Content is inflated
 * and hashed as it streams, then checked against the central CRC-32.
 */
import { asTreeError, decompress, readFailed } from "./byte-source";
import { EntryCollector, decodeName } from "./entry-collector";
import { ERROR_CODES, treeError } from "./errors";
import type { TreeManifest } from "./serialize";
import { LIMITS, headerMode } from "./tree";
import type { TreeLimits } from "./tree";
import {
  crc32,
  parseDescriptor,
  readAt,
  readCentralDirectory,
  readDirectoryEnd,
  readLocalHeader,
  toRandomAccess,
} from "./zip-records";
import type { CentralEntry, LocalHeader, RandomAccessSource, Sizes } from "./zip-records";

const CHUNK = 64 * 1024;
const S_IFMT = 0o170000, S_IFREG = 0o100000, S_IFDIR = 0o040000;
const UNIX_HOST = 3;

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Header agreement on CRC-32 and sizes (schemas 2.1); returns a disagreement or undefined. */
function sizesDisagree(local: LocalHeader, central: CentralEntry, descriptor: Sizes | null): string | undefined {
  const keys = ["crc", "csize", "usize"] as const;
  if (central.flags & 0x8) {
    if (descriptor === null) return "data descriptor is malformed";
    if (keys.some((k) => local[k] !== 0 && local[k] !== descriptor[k])) return "local header disagrees with its data descriptor";
    if (keys.some((k) => descriptor[k] !== central[k])) return "data descriptor disagrees with the central directory";
    return undefined;
  }
  return keys.some((k) => local[k] !== central[k]) ? "local header disagrees with the central directory" : undefined;
}

function entryFault(central: CentralEntry, local: LocalHeader): string | undefined {
  if (central.fault !== undefined || local.fault !== undefined) return central.fault ?? local.fault;
  if ((central.flags | local.flags) & 0x41) return "entry is encrypted";
  if ((central.flags & 0x8) !== (local.flags & 0x8)) return "local header and central directory disagree on the data descriptor flag";
  if (central.method !== local.method) return "local header and central directory disagree on the method";
  if (central.method !== 0 && central.method !== 8) return `compression method ${central.method} is not stored or deflate`;
  const type = (central.externalAttrs >>> 16) & S_IFMT;
  if (central.madeBy >> 8 !== UNIX_HOST || (type !== S_IFREG && type !== S_IFDIR)) {
    return "entry lacks Unix attributes of a regular file or directory";
  }
  return undefined;
}

async function* rawData(src: RandomAccessSource, start: number, length: number): AsyncGenerator<Uint8Array> {
  for (let at = 0; at < length; at += CHUNK) yield await readAt(src, start + at, Math.min(CHUNK, length - at));
}

/** Content of an entry, inflated when deflated, with its CRC-32 and size checked at the end. */
async function* content(src: RandomAccessSource, central: CentralEntry, dataStart: number, verify: boolean): AsyncGenerator<Uint8Array> {
  const raw = rawData(src, dataStart, central.csize);
  const data = central.method === 8 ? decompress(raw, "deflate-raw") : raw;
  let crc = 0;
  let size = 0;
  for await (const chunk of data) {
    crc = crc32(chunk, crc);
    size += chunk.length;
    yield chunk;
  }
  if (verify && (crc !== central.crc || size !== central.usize)) throw readFailed("zip entry data does not match its CRC-32 or size");
}

async function readEntries(src: RandomAccessSource, collector: EntryCollector, limits: TreeLimits): Promise<void> {
  const dir = await readDirectoryEnd(src);
  if (dir.entries > limits.maxEntries) {
    throw treeError(ERROR_CODES.limitExceeded, "", `archive has ${dir.entries} entries, more than ${limits.maxEntries}`);
  }
  const central = (await readCentralDirectory(src, dir)).sort((a, b) => a.localOffset - b.localOffset);
  let archiveFault: string | undefined;
  let pos = 0;
  for (let i = 0; i < central.length; i++) {
    const c = central[i]!;
    collector.present();
    const name = decodeName(c.name);
    if (c.localOffset !== pos) archiveFault ??= `bytes before or between local entries at offset ${pos}`;
    const local = await readLocalHeader(src, c.localOffset, dir.cdOffset);
    if (local === null || !sameBytes(local.name, c.name)) {
      archiveFault ??= `no local entry ${JSON.stringify(name.path)} at offset ${c.localOffset}`;
      collector.add({ path: name.path, utf8Valid: name.utf8Valid, mode: "", size: 0, sha256: "", kind: "special", reason: archiveFault });
      continue;
    }
    const dataEnd = local.dataStart + c.csize;
    const nextStart = central[i + 1]?.localOffset ?? dir.cdOffset;
    let fault = entryFault(c, local);
    let descriptor: Sizes | null = null;
    if (dataEnd > dir.cdOffset) {
      archiveFault ??= `entry ${JSON.stringify(name.path)} data overruns the central directory`;
      fault ??= archiveFault;
    } else if (c.flags & 0x8) {
      const length = nextStart - dataEnd;
      descriptor = [12, 16, 20, 24].includes(length) ? parseDescriptor(await readAt(src, dataEnd, length)) : null;
      pos = descriptor === null ? dataEnd : nextStart;
    } else {
      pos = dataEnd;
    }
    fault ??= sizesDisagree(local, c, descriptor);
    const type = (c.externalAttrs >>> 16) & S_IFMT;
    const base = { path: name.path, utf8Valid: name.utf8Valid, ...(fault === undefined ? {} : { reason: fault }) };
    if (type === S_IFDIR && fault === undefined) {
      collector.add({ ...base, mode: "", size: 0, sha256: "", kind: "directory" });
      continue;
    }
    if (dataEnd > dir.cdOffset) {
      collector.add({ ...base, mode: "", size: 0, sha256: "", kind: "special" });
      continue;
    }
    // Header agreement comes first; only agreeing entries are checked against their CRC-32.
    const hashed = await collector.hashFile(name.path, content(src, c, local.dataStart, fault === undefined));
    collector.add({ ...base, mode: headerMode(c.externalAttrs >>> 16), ...hashed, kind: "regular" });
  }
  if (pos !== dir.cdOffset) archiveFault ??= "bytes between the last local entry and the central directory";
  if (archiveFault !== undefined) {
    collector.add({ path: "", mode: "", size: 0, sha256: "", kind: "special", reason: `zip archive is not contiguous: ${archiveFault}` });
  }
}

export interface ZipReadOptions {
  /** Test hook: smaller limits. */
  limits?: TreeLimits;
}

/**
 * Reads a zip archive into a validated tree manifest. Throws a
 * `SkillTreeError`: unparseable records and corrupt data are
 * `tree.read_failed`, header disagreements and non-contiguous entries are
 * `tree.unsupported_entry`.
 */
export async function readZipTree(source: Uint8Array | Blob | RandomAccessSource, options: ZipReadOptions = {}): Promise<TreeManifest> {
  const limits = options.limits ?? LIMITS;
  const collector = new EntryCollector(limits);
  try {
    await readEntries(toRandomAccess(source), collector, limits);
  } catch (err) {
    throw asTreeError(err);
  }
  return collector.build();
}
