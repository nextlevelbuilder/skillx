/**
 * GNU sparse maps as Go archive/tar Reader.Next reads them. The tree never
 * accepts a sparse file (contract 4.4), but the map decides the entry's name,
 * logical size and how much of its data section is the map itself, and a
 * malformed map is a malformed archive (`tree.read_failed`), as in Go.
 */
import { readFailed } from "./byte-source";
import type { StreamReader } from "./byte-source";
import { BLOCK, MAX_SPECIAL_FILE_SIZE, SPARSE_MAP, byteString, isHeaderOnly, parseInt64, parseNumeric } from "./tar-header";
import type { PaxRecords, RawHeader } from "./tar-header";

interface SparseEntry {
  offset: bigint;
  length: bigint;
}

const INT64_MAX = (1n << 63n) - 1n;
/** Go parses the entry count as a native int and rejects counts whose double overflows. */
const MAX_SPARSE_COUNT = INT64_MAX / 2n;

/** Go validateSparseEntries: in order, non-overlapping, non-negative and within `size`. */
function validSparseEntries(entries: readonly SparseEntry[], size: bigint): boolean {
  if (size < 0n) return false;
  let preEnd = 0n;
  for (const { offset, length } of entries) {
    if (offset < 0n || length < 0n || offset > INT64_MAX - length) return false;
    if (offset + length > size || preEnd > offset) return false;
    preEnd = offset + length;
  }
  return true;
}

function sparseCount(text: string | undefined): bigint {
  const n = parseInt64(text ?? "");
  if (n === undefined || n < 0n || n > MAX_SPARSE_COUNT) throw readFailed("invalid GNU sparse entry count");
  return n;
}

function sparsePair(offset: string, length: string): SparseEntry {
  const o = parseInt64(offset);
  const l = parseInt64(length);
  if (o === undefined || l === undefined) throw readFailed("invalid GNU sparse map entry");
  return { offset: o, length: l };
}

/** Go readGNUSparseMap0x1: the map from the GNU.sparse.numblocks and GNU.sparse.map records. */
function map0x1(records: Readonly<Record<string, string>>): SparseEntry[] {
  const n = sparseCount(records["GNU.sparse.numblocks"]);
  const map = records[SPARSE_MAP] ?? "";
  const fields = map === "" ? [] : map.split(",");
  if (BigInt(fields.length) !== 2n * n) throw readFailed("GNU sparse map does not match its entry count");
  const out: SparseEntry[] = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push(sparsePair(fields[i]!, fields[i + 1]!));
  return out;
}

/**
 * Go readGNUSparseMap1x0: newline-separated decimal fields at the start of
 * the data section, read in whole blocks up to 1 MiB. Returns the map and
 * the data bytes it took.
 */
async function map1x0(reader: StreamReader, available: number): Promise<{ entries: SparseEntry[]; consumed: number }> {
  let text = "";
  let newlines = 0;
  let consumed = 0;
  let at = 0;
  const feed = async (want: bigint) => {
    while (BigInt(newlines) < want) {
      consumed += BLOCK;
      if (consumed > MAX_SPECIAL_FILE_SIZE) throw readFailed("GNU sparse map is too long");
      const block = consumed <= available ? await reader.readExact(BLOCK) : null;
      if (block === null) throw readFailed("truncated GNU sparse map");
      const chunk = byteString(block);
      text += chunk;
      for (let i = 0; i < chunk.length; i++) if (chunk.charCodeAt(i) === 0x0a) newlines++;
    }
  };
  const token = () => {
    const nl = text.indexOf("\n", at);
    const out = text.slice(at, nl);
    at = nl + 1;
    newlines--;
    return out;
  };
  await feed(1n);
  const n = sparseCount(token());
  await feed(2n * n);
  const entries: SparseEntry[] = [];
  for (let i = 0n; i < n; i++) entries.push(sparsePair(token(), token()));
  return { entries, consumed };
}

/** Go readGNUSparsePAXHeaders version detection: "0.x", "1.0", or undefined when not sparse. */
function paxSparseVersion(records: Readonly<Record<string, string>>): "0.x" | "1.0" | undefined {
  const major = records["GNU.sparse.major"] ?? "";
  const minor = records["GNU.sparse.minor"] ?? "";
  if (major === "0" && (minor === "0" || minor === "1")) return "0.x";
  if (major === "1" && minor === "0") return "1.0";
  if (major !== "" || minor !== "") return undefined; // an unknown version is not sparse
  return (records[SPARSE_MAP] ?? "") !== "" ? "0.x" : undefined;
}

export interface PaxSparse {
  /** `GNU.sparse.name`, which replaces the entry name. */
  name?: Uint8Array;
  /** Logical file size. */
  size: number;
  /** Data section bytes the 1.0 map occupied. */
  consumed: number;
}

/**
 * Applies GNU sparse PAX records like Go: the name and size overrides, then
 * the map, validated against the logical size. Returns undefined when the
 * records do not describe a sparse file.
 */
export async function readPaxSparse(
  reader: StreamReader,
  typeflag: string,
  pax: PaxRecords | undefined,
  size: number,
  physical: number,
): Promise<PaxSparse | undefined> {
  const records = pax?.records ?? {};
  const version = paxSparseVersion(records);
  if (version === undefined) return undefined;
  const nameText = records["GNU.sparse.name"] ?? "";
  const sizeText = records["GNU.sparse.size"] || records["GNU.sparse.realsize"] || "";
  let logical = BigInt(size);
  if (sizeText !== "") {
    const n = parseInt64(sizeText);
    if (n === undefined) throw readFailed("invalid GNU sparse size");
    logical = n;
  }
  const { entries, consumed } = version === "1.0" ? await map1x0(reader, physical) : { entries: map0x1(records), consumed: 0 };
  if (isHeaderOnly(typeflag) || !validSparseEntries(entries, logical)) throw readFailed("invalid GNU sparse map");
  return { ...(nameText === "" ? {} : { name: pax?.raw.get("GNU.sparse.name") }), size: Number(logical), consumed };
}

/**
 * Go readOldGNUSparseMap for type 'S': GNU format only, map entries in the
 * header and in extension blocks that precede the data.
 */
export async function readOldGnuSparse(reader: StreamReader, h: RawHeader): Promise<void> {
  if (h.format !== "gnu") throw readFailed("old GNU sparse header outside the GNU format");
  let block = h.block;
  const size = parseNumeric(block.subarray(483, 495), "sparse real size");
  const entries: SparseEntry[] = [];
  let base = 386;
  let count = 4;
  let extended = 482;
  for (;;) {
    for (let i = 0; i < count; i++) {
      const at = base + i * 24;
      if (block[at] === 0) break;
      entries.push({ offset: parseNumeric(block.subarray(at, at + 12), "sparse offset"), length: parseNumeric(block.subarray(at + 12, at + 24), "sparse length") });
    }
    if (block[extended]! === 0) break;
    const next = await reader.readExact(BLOCK);
    if (next === null) throw readFailed("truncated GNU sparse header");
    block = next;
    base = 0;
    count = 21;
    extended = 504;
  }
  if (!validSparseEntries(entries, size)) throw readFailed("invalid GNU sparse map");
}
