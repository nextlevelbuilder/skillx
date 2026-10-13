/**
 * Tar header and PAX record parsing with the semantics of Go archive/tar,
 * the reader the contract names (contract 4.1). Malformed input throws
 * `tree.read_failed`.
 */
import { readFailed } from "./byte-source";

export const BLOCK = 512;
/** Go archive/tar caps PAX and GNU long-name payloads at 1 MiB. */
export const MAX_SPECIAL_FILE_SIZE = 1 << 20;

export interface RawHeader {
  /** Raw name bytes (ustar prefix joined), before any PAX or GNU override. */
  name: Uint8Array;
  linkname: Uint8Array;
  mode: number;
  size: number;
  typeflag: string;
  /** Old GNU sparse ('S') extension flag at offset 482. */
  gnuExtended: boolean;
}

const latin = new TextDecoder("latin1");

function cString(block: Uint8Array, start: number, length: number): Uint8Array {
  const field = block.subarray(start, start + length);
  const nul = field.indexOf(0);
  return nul < 0 ? field : field.subarray(0, nul);
}

function trimField(field: Uint8Array): string {
  return latin.decode(field).replace(/^[ \0]+|[ \0]+$/g, "");
}

/** Octal or GNU base-256 numeric field, like Go's parseNumeric. */
export function parseNumeric(field: Uint8Array, what: string): number {
  const first = field[0] ?? 0;
  if (first & 0x80) {
    if (first & 0x40) throw readFailed(`negative base-256 ${what}`);
    let value = first & 0x3f;
    for (const byte of field.subarray(1)) {
      value = value * 256 + byte;
      if (!Number.isSafeInteger(value)) throw readFailed(`${what} overflows`);
    }
    return value;
  }
  const text = trimField(field);
  if (text === "") return 0;
  if (!/^[0-7]+$/.test(text)) throw readFailed(`invalid octal ${what} ${JSON.stringify(text)}`);
  const value = parseInt(text, 8);
  if (!Number.isSafeInteger(value)) throw readFailed(`${what} overflows`);
  return value;
}

function checksumMatches(block: Uint8Array): boolean {
  const stored = trimField(block.subarray(148, 156));
  if (!/^[0-7]+$/.test(stored)) return false;
  const want = parseInt(stored, 8);
  let unsigned = 0;
  let signed = 0;
  for (let i = 0; i < BLOCK; i++) {
    const byte = i >= 148 && i < 156 ? 0x20 : block[i]!;
    unsigned += byte;
    signed += byte > 127 ? byte - 256 : byte;
  }
  return want === unsigned || want === signed;
}

function startsWith(block: Uint8Array, offset: number, text: string): boolean {
  for (let i = 0; i < text.length; i++) if (block[offset + i] !== text.charCodeAt(i)) return false;
  return true;
}

export function isZeroBlock(block: Uint8Array): boolean {
  return block.every((b) => b === 0);
}

export function parseHeader(block: Uint8Array): RawHeader {
  if (!checksumMatches(block)) throw readFailed("tar header checksum mismatch");
  let name = cString(block, 0, 100);
  const ustar = startsWith(block, 257, "ustar\u000000");
  const gnu = startsWith(block, 257, "ustar  \u0000");
  if (ustar) {
    // star archives end the header with "tar\0" and keep a shorter prefix.
    const star = startsWith(block, 508, "tar\u0000");
    const prefix = cString(block, 345, star ? 131 : 155);
    if (prefix.length > 0) {
      const joined = new Uint8Array(prefix.length + 1 + name.length);
      joined.set(prefix);
      joined[prefix.length] = 0x2f;
      joined.set(name, prefix.length + 1);
      name = joined;
    }
  }
  const typeflag = String.fromCharCode(block[156]!);
  return {
    name,
    linkname: cString(block, 157, 100),
    mode: parseNumeric(block.subarray(100, 108), "mode"),
    size: parseNumeric(block.subarray(124, 136), "size"),
    typeflag,
    gnuExtended: gnu && typeflag === "S" && block[482] !== 0,
  };
}

const utf8 = new TextDecoder("utf-8");

export interface PaxRecords {
  records: Record<string, string>;
  /** Raw bytes of the `path` record, which may not be valid UTF-8. */
  rawPath?: Uint8Array;
}

/** Parses PAX records "<len> <key>=<value>\n" like Go's parsePAX; later records win. */
export function parsePax(data: Uint8Array): PaxRecords {
  const records: Record<string, string> = {};
  let rawPath: Uint8Array | undefined;
  let pos = 0;
  while (pos < data.length) {
    const space = data.indexOf(0x20, pos);
    const lenText = space < 0 ? "" : latin.decode(data.subarray(pos, space));
    if (!/^[1-9][0-9]*$/.test(lenText)) throw readFailed("invalid PAX record length");
    const end = pos + Number(lenText);
    if (end > data.length || end <= space + 1 || data[end - 1] !== 0x0a) throw readFailed("invalid PAX record");
    const body = data.subarray(space + 1, end - 1);
    const eq = body.indexOf(0x3d);
    if (eq <= 0) throw readFailed("invalid PAX record key");
    const key = utf8.decode(body.subarray(0, eq));
    const value = utf8.decode(body.subarray(eq + 1));
    const nulInValue = ["path", "linkpath", "uname", "gname"].includes(key) && value.includes("\0");
    if (key.includes("\0") || nulInValue) throw readFailed(`invalid PAX record ${JSON.stringify(key)}`);
    records[key] = value;
    if (key === "path") rawPath = body.subarray(eq + 1);
    pos = end;
  }
  return rawPath === undefined ? { records } : { records, rawPath };
}

const DECIMAL_RECORDS = ["size", "uid", "gid"];
const TIME_RECORDS = ["atime", "mtime", "ctime"];

/** Rejects records Go's mergePAX cannot parse. */
export function checkPaxValues(records: Readonly<Record<string, string>>): void {
  for (const [key, value] of Object.entries(records)) {
    if (DECIMAL_RECORDS.includes(key) && !(/^[0-9]+$/.test(value) && Number.isSafeInteger(Number(value)))) {
      throw readFailed(`invalid PAX ${key}`);
    }
    if (TIME_RECORDS.includes(key) && !/^-?[0-9]+(\.[0-9]+)?$/.test(value)) throw readFailed(`invalid PAX ${key}`);
  }
}

/** Header-only types carry no data regardless of their size field (Go isHeaderOnlyType). */
export function isHeaderOnly(typeflag: string): boolean {
  return ["1", "2", "3", "4", "5", "6"].includes(typeflag);
}

export function blockPadding(size: number): number {
  return (BLOCK - (size % BLOCK)) % BLOCK;
}
