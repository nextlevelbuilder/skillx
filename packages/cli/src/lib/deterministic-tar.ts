/**
 * Deterministic POSIX ustar/PAX writer for release artifacts. The archive is a
 * pure function of the (path, mode, bytes) list: files sorted by raw UTF-8
 * path bytes, regular-file entries only, mode 0644 or 0755, uid/gid 0, empty
 * owner names, mtime 0, and a PAX `path` record only for paths longer than
 * the 100-byte ustar name field.
 */
import { compareUtf8 } from '@skillx/skill-tree';

export interface TarFile {
  path: string;
  mode: '100644' | '100755';
  bytes: Uint8Array;
}

const BLOCK = 512;
const NAME_FIELD = 100;
const encoder = new TextEncoder();

function writeOctal(block: Uint8Array, offset: number, width: number, value: number): void {
  const digits = value.toString(8).padStart(width - 1, '0');
  if (digits.length > width - 1) throw new Error(`value ${value} does not fit a ${width}-byte tar field`);
  block.set(encoder.encode(`${digits}\0`), offset);
}

function header(name: Uint8Array, typeflag: string, mode: number, size: number): Uint8Array {
  const block = new Uint8Array(BLOCK);
  block.set(name.subarray(0, NAME_FIELD), 0);
  writeOctal(block, 100, 8, mode);
  writeOctal(block, 108, 8, 0); // uid
  writeOctal(block, 116, 8, 0); // gid
  writeOctal(block, 124, 12, size);
  writeOctal(block, 136, 12, 0); // mtime
  block[156] = typeflag.charCodeAt(0);
  block.set(encoder.encode('ustar\u000000'), 257);
  writeOctal(block, 329, 8, 0); // devmajor
  writeOctal(block, 337, 8, 0); // devminor
  block.fill(0x20, 148, 156);
  const sum = block.reduce((n, b) => n + b, 0);
  block.set(encoder.encode(`${sum.toString(8).padStart(6, '0')}\0 `), 148);
  return block;
}

/** One PAX extended record: `<length> <key>=<value>\n`, where length counts itself. */
function paxRecord(key: string, value: Uint8Array): Uint8Array {
  const body = encoder.encode(` ${key}=`).length + value.length + 1;
  let length = body + 1;
  while (String(length).length + body !== length) length = String(length).length + body;
  const out = new Uint8Array(length);
  const head = encoder.encode(`${length} ${key}=`);
  out.set(head, 0);
  out.set(value, head.length);
  out[length - 1] = 0x0a;
  return out;
}

const padding = (size: number) => (BLOCK - (size % BLOCK)) % BLOCK;

/** Writes the archive. Throws on a duplicate path. */
export function writeDeterministicTar(files: readonly TarFile[]): Uint8Array {
  const sorted = [...files].sort((a, b) => compareUtf8(a.path, b.path));
  const parts: Uint8Array[] = [];
  let total = 0;
  const push = (part: Uint8Array) => {
    parts.push(part);
    total += part.length;
  };
  sorted.forEach((file, i) => {
    if (i > 0 && sorted[i - 1]!.path === file.path) throw new Error(`duplicate path ${file.path}`);
    const name = encoder.encode(file.path);
    if (name.length > NAME_FIELD) {
      const record = paxRecord('path', name);
      push(header(encoder.encode('././@PaxHeader'), 'x', 0o644, record.length));
      push(record);
      push(new Uint8Array(padding(record.length)));
    }
    push(header(name, '0', file.mode === '100755' ? 0o755 : 0o644, file.bytes.length));
    push(file.bytes);
    push(new Uint8Array(padding(file.bytes.length)));
  });
  push(new Uint8Array(BLOCK * 2));
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}
