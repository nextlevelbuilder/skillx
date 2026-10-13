/**
 * Zip record parsing for the skill-tree zip reader (schemas 2.1): end of
 * central directory (with zip64), central directory entries, local headers
 * and data descriptors. A record that is missing or cannot be parsed throws
 * `tree.read_failed`; disagreements are judged by the reader.
 */
import { readFailed } from "./byte-source";

/** Random access to archive bytes, so the central directory can be read first. */
export interface RandomAccessSource {
  readonly size: number;
  read(offset: number, length: number): Promise<Uint8Array>;
}

export function toRandomAccess(source: Uint8Array | Blob | RandomAccessSource): RandomAccessSource {
  if (source instanceof Uint8Array) {
    return { size: source.length, read: async (offset, length) => source.subarray(offset, offset + length) };
  }
  if (typeof Blob !== "undefined" && source instanceof Blob) {
    return { size: source.size, read: async (o, l) => new Uint8Array(await source.slice(o, o + l).arrayBuffer()) };
  }
  return source as RandomAccessSource;
}

export async function readAt(src: RandomAccessSource, offset: number, length: number): Promise<Uint8Array> {
  if (offset < 0 || length < 0 || offset + length > src.size) throw readFailed(`zip read past the end at ${offset}`);
  const bytes = await src.read(offset, length);
  if (bytes.length !== length) throw readFailed(`zip read returned ${bytes.length} of ${length} bytes`);
  return bytes;
}

const view = (b: Uint8Array) => new DataView(b.buffer, b.byteOffset, b.byteLength);
const u16 = (b: Uint8Array, o: number) => view(b).getUint16(o, true);
const u32 = (b: Uint8Array, o: number) => view(b).getUint32(o, true);
function u64(b: Uint8Array, o: number): number {
  const value = view(b).getBigUint64(o, true);
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) throw readFailed("zip64 value overflows");
  return Number(value);
}

export const MAX32 = 0xffffffff;
const SIG_LOCAL = 0x04034b50, SIG_CENTRAL = 0x02014b50, SIG_EOCD = 0x06054b50;
const SIG_EOCD64 = 0x06064b50, SIG_LOCATOR64 = 0x07064b50, SIG_DESCRIPTOR = 0x08074b50;
/** Reading a larger central directory is refused rather than buffered. */
const MAX_CENTRAL_DIRECTORY_BYTES = 64 * 1024 * 1024;

export interface Directory {
  entries: number;
  cdOffset: number;
  cdSize: number;
}

/** Finds the end of central directory record (and the zip64 record when it is used), like Go archive/zip. */
export async function readDirectoryEnd(src: RandomAccessSource): Promise<Directory> {
  const tailStart = Math.max(0, src.size - (22 + 0xffff));
  const tail = await readAt(src, tailStart, src.size - tailStart);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) {
    if (u32(tail, i) === SIG_EOCD && i + 22 + u16(tail, i + 20) <= tail.length) {
      at = i;
      break;
    }
  }
  if (at < 0) throw readFailed("zip end of central directory record not found");
  if (u16(tail, at + 4) !== 0 || u16(tail, at + 6) !== 0) throw readFailed("multi-disk zip archives are not supported");
  let dir: Directory = { entries: u16(tail, at + 10), cdSize: u32(tail, at + 12), cdOffset: u32(tail, at + 16) };
  let dirEnd = tailStart + at;
  if ((dir.entries === 0xffff || dir.cdSize === MAX32 || dir.cdOffset === MAX32) && dirEnd >= 20) {
    const locator = await readAt(src, dirEnd - 20, 20);
    if (u32(locator, 0) === SIG_LOCATOR64) {
      const offset = u64(locator, 8);
      const record = await readAt(src, offset, 56);
      if (u32(record, 0) !== SIG_EOCD64) throw readFailed("bad zip64 end of central directory signature");
      dir = { entries: u64(record, 32), cdSize: u64(record, 40), cdOffset: u64(record, 48) };
      dirEnd = offset;
    }
  }
  if (dir.cdOffset + dir.cdSize > dirEnd) throw readFailed("zip central directory overlaps its end record");
  if (dir.cdSize > MAX_CENTRAL_DIRECTORY_BYTES) throw readFailed("zip central directory is too large");
  return dir;
}

export interface Sizes {
  crc: number;
  csize: number;
  usize: number;
}

export interface CentralEntry extends Sizes {
  name: Uint8Array;
  madeBy: number;
  flags: number;
  method: number;
  externalAttrs: number;
  localOffset: number;
  /** Set when a 0xFFFFFFFF field has no zip64 extra value. */
  fault?: string;
}

/** Replaces 0xFFFFFFFF fields, in order, with the zip64 extra (0x0001) values. */
function applyZip64(extra: Uint8Array, fields: number[]): string | undefined {
  let values: Uint8Array | undefined;
  for (let p = 0; p + 4 <= extra.length; ) {
    const id = u16(extra, p);
    const len = u16(extra, p + 2);
    if (p + 4 + len > extra.length) throw readFailed("zip extra field overruns its record");
    if (id === 0x0001) values = extra.subarray(p + 4, p + 4 + len);
    p += 4 + len;
  }
  let next = 0;
  for (let i = 0; i < fields.length; i++) {
    if (fields[i] !== MAX32) continue;
    if (values === undefined || next + 8 > values.length) return "a 0xFFFFFFFF field has no zip64 extra value";
    fields[i] = u64(values, next);
    next += 8;
  }
  return undefined;
}

export async function readCentralDirectory(src: RandomAccessSource, dir: Directory): Promise<CentralEntry[]> {
  const cd = await readAt(src, dir.cdOffset, dir.cdSize);
  const entries: CentralEntry[] = [];
  let p = 0;
  for (let i = 0; i < dir.entries; i++) {
    if (p + 46 > cd.length || u32(cd, p) !== SIG_CENTRAL) throw readFailed("bad zip central directory record");
    const nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > cd.length) throw readFailed("zip central directory record overruns the directory");
    const fields = [u32(cd, p + 24), u32(cd, p + 20), u32(cd, p + 42)]; // usize, csize, offset
    const fault = applyZip64(cd.subarray(p + 46 + nameLen, p + 46 + nameLen + extraLen), fields);
    entries.push({
      name: cd.subarray(p + 46, p + 46 + nameLen),
      madeBy: u16(cd, p + 4),
      flags: u16(cd, p + 8),
      method: u16(cd, p + 10),
      crc: u32(cd, p + 16),
      usize: fields[0]!,
      csize: fields[1]!,
      localOffset: fields[2]!,
      externalAttrs: u32(cd, p + 38),
      ...(fault === undefined ? {} : { fault }),
    });
    p = end;
  }
  return entries;
}

export interface LocalHeader extends Sizes {
  name: Uint8Array;
  flags: number;
  method: number;
  /** Offset of the entry data. */
  dataStart: number;
  fault?: string;
}

/** Reads the local header at `offset`, or returns null when no local header signature is there. */
export async function readLocalHeader(src: RandomAccessSource, offset: number, limit: number): Promise<LocalHeader | null> {
  if (offset + 30 > limit) return null;
  const fixed = await readAt(src, offset, 30);
  if (u32(fixed, 0) !== SIG_LOCAL) return null;
  const nameLen = u16(fixed, 26), extraLen = u16(fixed, 28);
  if (offset + 30 + nameLen + extraLen > limit) return null;
  const rest = await readAt(src, offset + 30, nameLen + extraLen);
  const fields = [u32(fixed, 22), u32(fixed, 18)]; // usize, csize
  const fault = applyZip64(rest.subarray(nameLen), fields);
  return {
    name: rest.subarray(0, nameLen),
    flags: u16(fixed, 6),
    method: u16(fixed, 8),
    crc: u32(fixed, 14),
    usize: fields[0]!,
    csize: fields[1]!,
    dataStart: offset + 30 + nameLen + extraLen,
    ...(fault === undefined ? {} : { fault }),
  };
}

/** Parses a data descriptor whose length (12, 16, 20 or 24) the contiguity rule fixed; null when malformed. */
export function parseDescriptor(bytes: Uint8Array): Sizes | null {
  const signed = bytes.length === 16 || bytes.length === 24;
  if (signed && u32(bytes, 0) !== SIG_DESCRIPTOR) return null;
  const b = signed ? bytes.subarray(4) : bytes;
  if (b.length === 12) return { crc: u32(b, 0), csize: u32(b, 4), usize: u32(b, 8) };
  if (b.length === 20) return { crc: u32(b, 0), csize: u64(b, 4), usize: u64(b, 12) };
  return null;
}

const CRC_TABLE = Uint32Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

/** Incremental CRC-32 (IEEE): pass the previous value to continue. */
export function crc32(data: Uint8Array, previous = 0): number {
  let c = ~previous >>> 0;
  for (const byte of data) c = CRC_TABLE[(c ^ byte) & 0xff]! ^ (c >>> 8);
  return ~c >>> 0;
}
