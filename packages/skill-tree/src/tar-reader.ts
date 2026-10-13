/**
 * Streaming tar (and tar.gz) reader for `agentkit.skill-tree/v1`. An entry is
 * a header as Go archive/tar Reader.Next returns it: PAX `x` and GNU `L`/`K`
 * headers fold into the following entry, a PAX `g` header is a metadata
 * entry. Content is hashed while it streams; nothing is extracted.
 */
import { StreamReader, asTreeError, decompress, readFailed, toAsyncIterable } from "./byte-source";
import type { ByteSource } from "./byte-source";
import { EntryCollector, decodeName } from "./entry-collector";
import type { TreeManifest } from "./serialize";
import {
  BLOCK,
  MAX_SPECIAL_FILE_SIZE,
  blockPadding,
  isHeaderOnly,
  isZeroBlock,
  mergePaxValues,
  parseHeader,
  parsePax,
} from "./tar-header";
import type { PaxRecords } from "./tar-header";
import { readOldGnuSparse, readPaxSparse } from "./tar-sparse";
import { LIMITS, headerMode } from "./tree";
import type { EntryKind, TreeLimits } from "./tree";

export interface TarReadOptions {
  /** "auto" (default) detects the gzip magic bytes. */
  compression?: "auto" | "gzip" | "none";
  /** Test hook: smaller limits. */
  limits?: TreeLimits;
}

/** Maps a tar type flag to an entry kind; type NUL is a directory when its name ends with "/". */
export function tarEntryKind(typeflag: string, name: string): EntryKind {
  switch (typeflag) {
    case "0":
      return "regular";
    case "\0":
      return name.endsWith("/") ? "directory" : "regular";
    case "5":
      return "directory";
    case "g":
      return "metadata";
    case "2":
      return "symlink";
    case "1":
      return "hardlink";
    default:
      return "special";
  }
}

async function gunzipIfNeeded(source: AsyncIterable<Uint8Array>, compression: string): Promise<AsyncIterable<Uint8Array>> {
  if (compression === "none") return source;
  const it = source[Symbol.asyncIterator]();
  const head: Uint8Array[] = [];
  let seen = 0;
  while (seen < 2) {
    const next = await it.next();
    if (next.done) break;
    head.push(next.value);
    seen += next.value.length;
  }
  const magic = head.flatMap((chunk) => Array.from(chunk.subarray(0, 2))).slice(0, 2);
  const gzip = compression === "gzip" || (magic[0] === 0x1f && magic[1] === 0x8b);
  const replay = (async function* () {
    yield* head;
    for (let next = await it.next(); !next.done; next = await it.next()) yield next.value;
  })();
  if (!gzip) return replay;
  return decompress(replay, "gzip");
}

function nulTerminated(data: Uint8Array): Uint8Array {
  const nul = data.indexOf(0);
  return nul < 0 ? data : data.subarray(0, nul);
}

async function readSpecial(reader: StreamReader, size: number): Promise<Uint8Array> {
  if (size > MAX_SPECIAL_FILE_SIZE) throw readFailed(`tar extension header of ${size} bytes is too large`);
  const data = (await reader.readExact(size)) ?? new Uint8Array(0);
  if (data.length !== size) throw readFailed("truncated tar extension header");
  await reader.skip(blockPadding(size));
  return data;
}

/** Go handleRegularFile: the data section length, which may not be negative. */
function dataLength(typeflag: string, size: number): number {
  const n = isHeaderOnly(typeflag) ? 0 : size;
  if (!(n >= 0)) throw readFailed(`tar entry has a negative size ${size}`);
  return n;
}

/** Bytes an archive may take beyond its file content: headers, extension records and skipped data. */
const ENTRY_OVERHEAD = 16 * 1024;

/**
 * The total byte budget of one archive. Go archive/tar has no such limit;
 * it bounds data that no file limit counts (non-regular entry data, PAX and
 * GNU extension chains), so a stream cannot be read without end.
 */
export function tarByteBudget(limits: TreeLimits): number {
  return limits.maxTreeSize + limits.maxEntries * ENTRY_OVERHEAD;
}

async function readEntries(reader: StreamReader, collector: EntryCollector): Promise<void> {
  let pax: PaxRecords | undefined;
  let longName: Uint8Array | undefined;
  for (;;) {
    const block = await reader.readExact(BLOCK);
    if (block === null) return;
    if (isZeroBlock(block)) {
      const second = await reader.readExact(BLOCK);
      if (second === null || isZeroBlock(second)) return;
      throw readFailed("tar header follows a single zero block");
    }
    const h = parseHeader(block);
    if (h.typeflag === "x") {
      pax = parsePax(await readSpecial(reader, dataLength(h.typeflag, h.size)));
      continue;
    }
    if (h.typeflag === "L" || h.typeflag === "K") {
      const value = nulTerminated(await readSpecial(reader, dataLength(h.typeflag, h.size)));
      // An empty long name clears an earlier one, as Go's parseString result does.
      if (h.typeflag === "L") longName = value.length > 0 ? value : undefined;
      continue;
    }
    collector.present();
    if (h.typeflag === "g") {
      // Global records describe the archive; pending x and L headers are dropped, as in Go.
      // Go ignores a global header's merge failure and then reports no records.
      const global = parsePax(await readSpecial(reader, dataLength(h.typeflag, h.size)));
      let records = global.records;
      try {
        mergePaxValues(records);
      } catch {
        records = Object.create(null) as Record<string, string>;
      }
      const name = decodeName(records.path ? global.raw.get("path")! : h.name);
      collector.add({ path: name.path, utf8Valid: name.utf8Valid, mode: "", size: 0, sha256: "", kind: "metadata", paxRecords: records });
      pax = undefined;
      longName = undefined;
      continue;
    }
    const records = pax?.records ?? (Object.create(null) as Record<string, string>);
    const size = mergePaxValues(records) ?? h.size;
    let rawName = longName ?? (records.path ? pax!.raw.get("path")! : h.name);
    const physical = dataLength(h.typeflag, size);
    let logical = size;
    let consumed = 0;
    if (h.typeflag === "S") await readOldGnuSparse(reader, h);
    else {
      const sparse = await readPaxSparse(reader, h, pax, size, physical);
      if (sparse !== undefined) {
        rawName = sparse.name ?? rawName;
        logical = sparse.size;
        consumed = sparse.consumed;
      }
    }
    const name = decodeName(rawName);
    const kind = tarEntryKind(h.typeflag, name.path);
    const sparse = logical !== size || consumed > 0 || Object.keys(records).some((k) => k.startsWith("GNU.sparse."));
    let hashed = { size: 0, sha256: "" };
    if (kind === "regular" && !sparse) hashed = await collector.hashFile(name.path, reader.chunks(physical));
    else {
      // Sparse files are rejected later, but their logical size counts toward the limits first.
      if (kind === "regular") {
        collector.countFile(name.path, logical);
        hashed = { size: logical, sha256: "" };
      }
      await reader.skip(physical - consumed);
    }
    await reader.skip(blockPadding(physical));
    collector.add({ path: name.path, utf8Valid: name.utf8Valid, mode: headerMode(h.mode), ...hashed, kind, paxRecords: records });
    pax = undefined;
    longName = undefined;
  }
}

/**
 * Reads a tar or tar.gz stream into a validated tree manifest. Throws a
 * `SkillTreeError`; malformed archives fail with `tree.read_failed` and
 * limits stop reading as soon as they are exceeded.
 */
export async function readTarTree(source: ByteSource, options: TarReadOptions = {}): Promise<TreeManifest> {
  const limits = options.limits ?? LIMITS;
  const collector = new EntryCollector(limits);
  let reader: StreamReader | undefined;
  try {
    reader = new StreamReader(await gunzipIfNeeded(toAsyncIterable(source), options.compression ?? "auto"), tarByteBudget(limits));
    await readEntries(reader, collector);
  } catch (err) {
    throw asTreeError(err);
  } finally {
    await reader?.close().catch(() => undefined);
  }
  return collector.build();
}
