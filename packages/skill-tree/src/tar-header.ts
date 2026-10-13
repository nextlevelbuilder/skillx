/**
 * Tar header and PAX record parsing with the semantics of Go archive/tar,
 * the reader the contract names (contract 4.1). Malformed input throws
 * `tree.read_failed`.
 */
import { readFailed } from "./byte-source";

export const BLOCK = 512;
/** Go archive/tar caps PAX and GNU long-name payloads at 1 MiB. */
export const MAX_SPECIAL_FILE_SIZE = 1 << 20;

const INT64_MIN = -(1n << 63n);
const INT64_MAX = (1n << 63n) - 1n;

export type TarFormat = "v7" | "ustar" | "star" | "gnu";

export interface RawHeader {
  /** Raw name bytes (prefix joined), before any PAX or GNU override. */
  name: Uint8Array;
  linkname: Uint8Array;
  /** Header mode; may be negative or beyond 2^53 (then imprecise), which `headerMode` rejects. */
  mode: number;
  /** Header size; negative when a base-256 field says so. */
  size: number;
  typeflag: string;
  format: TarFormat;
  /** The raw header block, kept for the old GNU sparse map. */
  block: Uint8Array;
}

/** Bytes as a string of char codes 0-255; only ever matched against ASCII patterns. */
export function byteString(bytes: Uint8Array): string {
  let out = "";
  for (const b of bytes) out += String.fromCharCode(b);
  return out;
}

/** Go parser.parseString: the bytes before the first NUL. */
function cString(field: Uint8Array): Uint8Array {
  const nul = field.indexOf(0);
  return nul < 0 ? field : field.subarray(0, nul);
}

const isPad = (b: number) => b === 0x20 || b === 0;

/** Go parseOctal: trim spaces and NULs, cut at a NUL, then an unsigned 64-bit octal number. */
function parseOctal(field: Uint8Array, what: string): bigint {
  let start = 0;
  let end = field.length;
  while (start < end && isPad(field[start]!)) start++;
  while (end > start && isPad(field[end - 1]!)) end--;
  if (start === end) return 0n;
  const text = byteString(cString(field.subarray(start, end)));
  if (!/^[0-7]+$/.test(text)) throw readFailed(`invalid octal ${what} ${JSON.stringify(text)}`);
  const value = BigInt(`0o${text}`);
  if (value >> 64n > 0n) throw readFailed(`${what} overflows`);
  return BigInt.asIntN(64, value);
}

/** Go parseNumeric: octal, or GNU base-256 two's complement (negative values included) within int64. */
export function parseNumeric(field: Uint8Array, what: string): bigint {
  const first = field[0] ?? 0;
  if ((first & 0x80) === 0) return parseOctal(field, what);
  const inv = first & 0x40 ? 0xff : 0;
  let x = 0n;
  for (let i = 0; i < field.length; i++) {
    let c = field[i]! ^ inv;
    if (i === 0) c &= 0x7f;
    if (x >> 56n > 0n) throw readFailed(`${what} overflows`);
    x = (x << 8n) | BigInt(c);
  }
  if (x >> 63n > 0n) throw readFailed(`${what} overflows`);
  return inv ? -x - 1n : x;
}

function checksumMatches(block: Uint8Array): boolean {
  let want: bigint;
  try {
    want = parseOctal(block.subarray(148, 156), "checksum");
  } catch {
    return false;
  }
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i++) {
    const byte = i >= 148 && i < 156 ? 0x20 : block[i]!;
    unsigned += byte;
    signed += byte > 127 ? byte - 256 : byte;
  }
  return want === BigInt(unsigned) || want === BigInt(signed);
}

function startsWith(block: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) if (block[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

/** Go block.getFormat after the checksum: the 6-byte magic decides, the USTAR version is not checked. */
function formatOf(block: Uint8Array): TarFormat {
  if (startsWith(block, 257, "ustar\u0000")) return startsWith(block, 508, "tar\u0000") ? "star" : "ustar";
  if (startsWith(block, 257, "ustar ") && startsWith(block, 263, " \u0000")) return "gnu";
  return "v7";
}

export function isZeroBlock(block: Uint8Array): boolean {
  return block.every((b) => b === 0);
}

function joinPrefix(prefix: Uint8Array, name: Uint8Array): Uint8Array {
  if (prefix.length === 0) return name;
  const joined = new Uint8Array(prefix.length + 1 + name.length);
  joined.set(prefix);
  joined[prefix.length] = 0x2f;
  joined.set(name, prefix.length + 1);
  return joined;
}

/**
 * Go Reader.readHeader: every numeric field of the format must parse, even
 * those the tree does not use, or the header is malformed.
 */
export function parseHeader(block: Uint8Array): RawHeader {
  if (!checksumMatches(block)) throw readFailed("tar header checksum mismatch");
  const format = formatOf(block);
  const field = (start: number, length: number) => block.subarray(start, start + length);
  const size = parseNumeric(field(124, 12), "size");
  const mode = parseNumeric(field(100, 8), "mode");
  parseNumeric(field(108, 8), "uid");
  parseNumeric(field(116, 8), "gid");
  parseNumeric(field(136, 12), "mtime");
  let prefix: Uint8Array = new Uint8Array(0);
  if (format !== "v7") {
    parseNumeric(field(329, 8), "devmajor");
    parseNumeric(field(337, 8), "devminor");
  }
  if (format === "ustar") prefix = cString(field(345, 155));
  if (format === "star") {
    prefix = cString(field(345, 131));
    parseNumeric(field(476, 12), "atime");
    parseNumeric(field(488, 12), "ctime");
  }
  if (format === "gnu") {
    // Pre-Go 1.8 writers put a USTAR prefix where GNU keeps atime and ctime;
    // Go falls back to it when those fields do not parse and it is ASCII.
    try {
      if (block[345] !== 0) parseNumeric(field(345, 12), "atime");
      if (block[357] !== 0) parseNumeric(field(357, 12), "ctime");
    } catch {
      const legacy = cString(field(345, 155));
      if (legacy.every((b) => b < 0x80)) prefix = legacy;
    }
  }
  return {
    name: joinPrefix(prefix, cString(field(0, 100))),
    linkname: cString(field(157, 100)),
    mode: Number(mode),
    size: Number(size),
    typeflag: String.fromCharCode(block[156]!),
    format,
    block,
  };
}

const utf8 = new TextDecoder("utf-8");

export const SPARSE_MAP = "GNU.sparse.map";
const SPARSE_OFFSET = "GNU.sparse.offset";
const SPARSE_NUMBYTES = "GNU.sparse.numbytes";
/** Records whose raw value bytes are kept, since they become entry names. */
const RAW_RECORDS = new Set(["path", "GNU.sparse.name"]);

export interface PaxRecords {
  /** Records by key, in a prototype-free object so no key can reach Object.prototype. */
  records: Record<string, string>;
  /** Raw value bytes of `path` and `GNU.sparse.name`, which may not be valid UTF-8. */
  raw: Map<string, Uint8Array>;
}

/** Go parsePAXRecord's length: ParseInt base 10, so a sign and leading zeros are allowed. */
function recordLength(text: string): number {
  return /^[+-]?[0-9]+$/.test(text) ? Number(text) : NaN;
}

/**
 * Parses PAX records "<len> <key>=<value>\n" like Go's parsePAX; later
 * records win, and GNU 0.0 sparse offset/numbytes pairs become `GNU.sparse.map`.
 */
export function parsePax(data: Uint8Array): PaxRecords {
  const records: Record<string, string> = Object.create(null) as Record<string, string>;
  const raw = new Map<string, Uint8Array>();
  const sparseMap: string[] = [];
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    if (space < 0) throw readFailed("invalid PAX record length");
    const lenText = byteString(data.subarray(pos, space));
    const n = recordLength(lenText);
    if (!(n >= 5 && n <= data.length - pos) || n - (lenText.length + 1) <= 0) throw readFailed("invalid PAX record length");
    const end = pos + n;
    if (data[end - 1] !== 0x0a) throw readFailed("invalid PAX record");
    const body = data.subarray(space + 1, end - 1);
    const eq = body.indexOf(0x3d);
    if (eq <= 0) throw readFailed("invalid PAX record key");
    const keyBytes = body.subarray(0, eq);
    const valueBytes = body.subarray(eq + 1);
    const key = utf8.decode(keyBytes);
    const value = utf8.decode(valueBytes);
    const nulInValue = ["path", "linkpath", "uname", "gname"].includes(key) ? valueBytes.includes(0) : keyBytes.includes(0);
    if (nulInValue) throw readFailed(`invalid PAX record ${JSON.stringify(key)}`);
    pos = end;
    if (key === SPARSE_OFFSET || key === SPARSE_NUMBYTES) {
      const want = sparseMap.length % 2 === 0 ? SPARSE_OFFSET : SPARSE_NUMBYTES;
      if (key !== want || value.includes(",")) throw readFailed("invalid GNU sparse PAX records");
      sparseMap.push(value);
      continue;
    }
    records[key] = value;
    if (RAW_RECORDS.has(key)) raw.set(key, valueBytes);
  }
  if (sparseMap.length > 0) records[SPARSE_MAP] = sparseMap.join(",");
  return { records, raw };
}

/** Go strconv.ParseInt(value, 10, 64), or undefined when it fails. */
export function parseInt64(value: string): bigint | undefined {
  if (!/^[+-]?[0-9]+$/.test(value)) return undefined;
  const n = BigInt(value);
  return n < INT64_MIN || n > INT64_MAX ? undefined : n;
}

/** Go parsePAXTime: int64 seconds, then optional "." and sub-second digits ("1." is valid). */
function validPaxTime(value: string): boolean {
  const dot = value.indexOf(".");
  const secs = dot < 0 ? value : value.slice(0, dot);
  return parseInt64(secs) !== undefined && /^[0-9]*$/.test(dot < 0 ? "" : value.slice(dot + 1));
}

const INT_RECORDS = new Set(["size", "uid", "gid"]);
const TIME_RECORDS = new Set(["atime", "mtime", "ctime"]);

/**
 * Go mergePAX: rejects a non-empty value it cannot parse, and returns the
 * `size` record when it overrides the header (empty values keep the header's).
 */
export function mergePaxValues(records: Readonly<Record<string, string>>): number | undefined {
  let size: number | undefined;
  for (const key of Object.keys(records)) {
    const value = records[key]!;
    if (value === "") continue;
    if (INT_RECORDS.has(key)) {
      const n = parseInt64(value);
      if (n === undefined) throw readFailed(`invalid PAX ${key}`);
      if (key === "size") size = Number(n);
    }
    if (TIME_RECORDS.has(key) && !validPaxTime(value)) throw readFailed(`invalid PAX ${key}`);
  }
  return size;
}

/** Header-only types carry no data regardless of their size field (Go isHeaderOnlyType). */
export function isHeaderOnly(typeflag: string): boolean {
  return ["1", "2", "3", "4", "5", "6"].includes(typeflag);
}

export function blockPadding(size: number): number {
  return (BLOCK - (size % BLOCK)) % BLOCK;
}
