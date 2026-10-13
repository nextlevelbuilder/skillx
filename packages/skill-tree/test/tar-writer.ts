/**
 * Minimal streaming ustar/PAX writer for tests. Content can be given as bytes
 * or as a size and fill byte, so limit vectors stream without large buffers.
 */
export interface TarSpec {
  name: Uint8Array;
  typeflag: string;
  mode: number;
  data?: Uint8Array;
  fill?: { size: number; byte: number };
  /** PAX records for an `x` header before this entry, or the records of a `g` entry. */
  pax?: Record<string, string | Uint8Array>;
}

const enc = new TextEncoder();

function octal(value: number, width: number): Uint8Array {
  return enc.encode(value.toString(8).padStart(width - 1, "0") + "\0");
}

export function paxData(records: Record<string, string | Uint8Array>): Uint8Array {
  const parts: Uint8Array[] = [];
  for (const [key, raw] of Object.entries(records)) {
    const value = typeof raw === "string" ? enc.encode(raw) : raw;
    const body = enc.encode(` ${key}=`).length + value.length + 1;
    let len = body + 1;
    while (String(len).length + body !== len) len = String(len).length + body;
    parts.push(enc.encode(`${len} ${key}=`), value, enc.encode("\n"));
  }
  return concat(parts);
}

export function concat(parts: readonly Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}

export function tarHeader(name: Uint8Array, typeflag: string, mode: number, size: number): Uint8Array {
  const block = new Uint8Array(512);
  block.set(name.subarray(0, 100), 0);
  block.set(octal(mode, 8), 100);
  block.set(octal(0, 8), 108);
  block.set(octal(0, 8), 116);
  block.set(octal(size, 12), 124);
  block.set(octal(0, 12), 136);
  block[156] = typeflag.charCodeAt(0);
  block.set(enc.encode("ustar\u000000"), 257);
  block.fill(0x20, 148, 156);
  const sum = block.reduce((n, b) => n + b, 0);
  block.set(octal(sum, 7), 148);
  block[155] = 0x20;
  return block;
}

const pad = (size: number) => new Uint8Array((512 - (size % 512)) % 512);

async function* fillChunks(size: number, byte: number): AsyncGenerator<Uint8Array> {
  const block = new Uint8Array(1 << 20).fill(byte);
  for (let left = size; left > 0; left -= block.length) yield block.subarray(0, Math.min(left, block.length));
}

/** Streams a tar archive of `specs`, closed by two zero blocks unless `trailer` is false. */
export async function* tarStream(specs: readonly TarSpec[], trailer = true): AsyncGenerator<Uint8Array> {
  for (const spec of specs) {
    if (spec.typeflag === "g") {
      const data = paxData(spec.pax ?? {});
      yield concat([tarHeader(spec.name, "g", 0o644, data.length), data, pad(data.length)]);
      continue;
    }
    const records: Record<string, string | Uint8Array> = { ...(spec.pax ?? {}) };
    if (spec.name.length > 100 && records.path === undefined) records.path = spec.name;
    if (Object.keys(records).length > 0) {
      const data = paxData(records);
      yield concat([tarHeader(enc.encode("PaxHeader"), "x", 0o644, data.length), data, pad(data.length)]);
    }
    const size = spec.data?.length ?? spec.fill?.size ?? 0;
    yield tarHeader(spec.name, spec.typeflag, spec.mode, size);
    if (spec.data !== undefined) yield spec.data;
    else if (spec.fill !== undefined) yield* fillChunks(spec.fill.size, spec.fill.byte);
    yield pad(size);
  }
  if (trailer) yield new Uint8Array(1024);
}

export async function tarBytes(specs: readonly TarSpec[], trailer = true): Promise<Uint8Array> {
  const parts: Uint8Array[] = [];
  for await (const part of tarStream(specs, trailer)) parts.push(part.slice());
  return concat(parts);
}
