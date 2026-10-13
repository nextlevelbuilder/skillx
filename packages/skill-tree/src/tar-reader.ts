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
  /**
   * Smaller limits. A registry may pass lower limits as a resource guard: a
   * lower limit only ever rejects with `tree.limit_exceeded` and never changes
   * a digest.
   */
  limits?: TreeLimits;
  /**
   * Receives the exact bytes of every hashed regular file, in archive order,
   * before validation finishes (noise and later-rejected entries included).
   * The bytes may be a view into the source buffer. Callers use them only
   * after `readTarTree` resolves, and only for paths of the returned tree.
   */
  onFileContent?: (path: string, content: Uint8Array) => void;
}

/** Joins chunks into one array; a single chunk is passed through without a copy. */
function joinChunks(chunks: readonly Uint8Array[], size: number): Uint8Array {
  if (chunks.length === 1) return chunks[0]!;
  const out = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

/** Passes `content` through while keeping its chunks for `onFileContent`. */
async function* keepChunks(content: AsyncIterable<Uint8Array>, kept: Uint8Array[]): AsyncGenerator<Uint8Array> {
  for await (const chunk of content) {
    kept.push(chunk);
    yield chunk;
  }
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

/** Overhead allowance per file (of `maxFiles`) for the ingest overhead guard. */
const ENTRY_OVERHEAD = 64 * 1024;

/**
 * The ingest overhead guard of one archive: the bytes it may take beyond
 * hashed regular-file content (headers, PAX/GNU extension records, sparse
 * maps, padding and the data of non-regular entries). Hashed content counts
 * against the tree limits instead. This is a SkillX resource guard outside
 * the Go parity claim (Go archive/tar has no such bound): it only ever
 * rejects with `tree.limit_exceeded` and never changes a digest.
 */
export function tarOverheadBudget(limits: TreeLimits): number {
  return limits.maxFiles * ENTRY_OVERHEAD;
}

async function readEntries(reader: StreamReader, collector: EntryCollector, onFile?: TarReadOptions["onFileContent"]): Promise<void> {
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
    // Go checks the raw header size before any PAX record can override it.
    dataLength(h.typeflag, h.size);
    const records = pax?.records ?? (Object.create(null) as Record<string, string>);
    const size = mergePaxValues(records) ?? h.size;
    let rawName = longName ?? (records.path ? pax!.raw.get("path")! : h.name);
    // Go rewrites TypeRegA ('\0') from the merged name, before sparse handling:
    // a directory when it ends in "/", a regular file otherwise.
    const type = h.typeflag === "\0" ? (rawName[rawName.length - 1] === 0x2f ? "5" : "0") : h.typeflag;
    const physical = dataLength(type, size);
    let logical = size;
    let consumed = 0;
    if (type === "S") await readOldGnuSparse(reader, h);
    else {
      const sparse = await readPaxSparse(reader, type, pax, size, physical);
      if (sparse !== undefined) {
        rawName = sparse.name ?? rawName;
        logical = sparse.size;
        consumed = sparse.consumed;
      }
    }
    const name = decodeName(rawName);
    // The kind follows the effective type, never the sparse-overridden name.
    const kind = tarEntryKind(type, name.path);
    const sparse = logical !== size || consumed > 0 || Object.keys(records).some((k) => k.startsWith("GNU.sparse."));
    let hashed = { size: 0, sha256: "" };
    if (kind === "regular" && !sparse) {
      const content = reader.chunks(physical, false);
      if (onFile === undefined) hashed = await collector.hashFile(name.path, content);
      else {
        const kept: Uint8Array[] = [];
        hashed = await collector.hashFile(name.path, keepChunks(content, kept));
        onFile(name.path, joinChunks(kept, hashed.size));
      }
    } else {
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
    reader = new StreamReader(await gunzipIfNeeded(toAsyncIterable(source), options.compression ?? "auto"), tarOverheadBudget(limits));
    await readEntries(reader, collector, options.onFileContent);
  } catch (err) {
    throw asTreeError(err);
  } finally {
    await reader?.close().catch(() => undefined);
  }
  return collector.build();
}
