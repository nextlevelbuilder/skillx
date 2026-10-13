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
  checkPaxValues,
  isHeaderOnly,
  isZeroBlock,
  parseHeader,
  parsePax,
} from "./tar-header";
import type { PaxRecords } from "./tar-header";
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
      pax = parsePax(await readSpecial(reader, h.size));
      continue;
    }
    if (h.typeflag === "L" || h.typeflag === "K") {
      const value = nulTerminated(await readSpecial(reader, h.size));
      if (h.typeflag === "L" && value.length > 0) longName = value;
      continue;
    }
    collector.present();
    if (h.typeflag === "g") {
      // Global records describe the archive; pending x and L headers are dropped, as in Go.
      const global = parsePax(await readSpecial(reader, h.size));
      checkPaxValues(global.records);
      const name = decodeName(global.rawPath ?? h.name);
      collector.add({ path: name.path, utf8Valid: name.utf8Valid, mode: "", size: 0, sha256: "", kind: "metadata", paxRecords: global.records });
      pax = undefined;
      longName = undefined;
      continue;
    }
    const records = pax?.records ?? {};
    checkPaxValues(records);
    const name = decodeName(longName ?? pax?.rawPath ?? h.name);
    const declared = records.size !== undefined ? Number(records.size) : h.size;
    const dataSize = isHeaderOnly(h.typeflag) ? 0 : declared;
    const kind = tarEntryKind(h.typeflag, name.path);
    if (h.gnuExtended) {
      // Old GNU sparse headers chain extension blocks before the data.
      for (let ext = await reader.readExact(BLOCK); ; ext = await reader.readExact(BLOCK)) {
        if (ext === null) throw readFailed("truncated GNU sparse header");
        if (ext[504] === 0) break;
      }
    }
    let size = 0;
    let sha256 = "";
    if (kind === "regular") ({ size, sha256 } = await collector.hashFile(name.path, reader.chunks(dataSize)));
    else await reader.skip(dataSize);
    await reader.skip(blockPadding(dataSize));
    collector.add({ path: name.path, utf8Valid: name.utf8Valid, mode: headerMode(h.mode), size, sha256, kind, paxRecords: records });
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
  const collector = new EntryCollector(options.limits ?? LIMITS);
  let reader: StreamReader | undefined;
  try {
    reader = new StreamReader(await gunzipIfNeeded(toAsyncIterable(source), options.compression ?? "auto"));
    await readEntries(reader, collector);
  } catch (err) {
    throw asTreeError(err);
  } finally {
    await reader?.close().catch(() => undefined);
  }
  return collector.build();
}
