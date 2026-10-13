/**
 * Minimal zip writer for tests, with knobs for the layouts the reader must
 * accept (stored, deflate, data descriptors with and without signature,
 * zip64 descriptors) and the defects it must reject.
 */
import { deflateRawSync } from "node:zlib";
import { crc32 } from "../src/zip-records";
import { concat } from "./tar-writer";

export interface ZipSpec {
  name: Uint8Array;
  data: Uint8Array;
  /** Unix mode including type bits, e.g. 0o100644 or 0o040755. */
  unixMode: number;
  method?: 0 | 8;
  /** Data descriptor layout; omitted means no descriptor (flag bit 3 clear). */
  descriptor?: 12 | 16 | 20 | 24;
  /** Overrides written into the central directory only. */
  centralCrc?: number;
  flags?: number;
  madeByHost?: number;
}

export interface ZipOptions {
  prefix?: Uint8Array;
  /** Bytes inserted between the last entry and the central directory. */
  gap?: Uint8Array;
}

function le(width: 2 | 4 | 8, value: number): Uint8Array {
  const out = new Uint8Array(width);
  const view = new DataView(out.buffer);
  if (width === 2) view.setUint16(0, value, true);
  else if (width === 4) view.setUint32(0, value, true);
  else view.setBigUint64(0, BigInt(value), true);
  return out;
}

function descriptorBytes(kind: 12 | 16 | 20 | 24, crc: number, csize: number, usize: number): Uint8Array {
  const sig = kind === 16 || kind === 24 ? [le(4, 0x08074b50)] : [];
  const sizes = kind === 20 || kind === 24 ? [le(8, csize), le(8, usize)] : [le(4, csize), le(4, usize)];
  return concat([...sig, le(4, crc), ...sizes]);
}

export function zipBytes(specs: readonly ZipSpec[], options: ZipOptions = {}): Uint8Array {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = options.prefix?.length ?? 0;
  for (const spec of specs) {
    const method = spec.method ?? 0;
    const body = method === 8 ? new Uint8Array(deflateRawSync(spec.data)) : spec.data;
    const crc = crc32(spec.data);
    const flags = (spec.flags ?? 0) | (spec.descriptor !== undefined ? 0x8 : 0) | 0x800;
    const zeroInLocal = spec.descriptor !== undefined;
    const local = concat([
      le(4, 0x04034b50), le(2, 20), le(2, flags), le(2, method), le(2, 0), le(2, 0x21),
      le(4, zeroInLocal ? 0 : crc), le(4, zeroInLocal ? 0 : body.length), le(4, zeroInLocal ? 0 : spec.data.length),
      le(2, spec.name.length), le(2, 0), spec.name, body,
      spec.descriptor !== undefined ? descriptorBytes(spec.descriptor, crc, body.length, spec.data.length) : new Uint8Array(0),
    ]);
    centrals.push(concat([
      le(4, 0x02014b50), le(2, ((spec.madeByHost ?? 3) << 8) | 20), le(2, 20), le(2, flags), le(2, method),
      le(2, 0), le(2, 0x21), le(4, spec.centralCrc ?? crc), le(4, body.length), le(4, spec.data.length),
      le(2, spec.name.length), le(2, 0), le(2, 0), le(2, 0), le(2, 0), le(4, (spec.unixMode << 16) >>> 0),
      le(4, offset), spec.name,
    ]));
    locals.push(local);
    offset += local.length;
  }
  const gap = options.gap ?? new Uint8Array(0);
  const cd = concat(centrals);
  const cdOffset = offset + gap.length;
  const end = concat([
    le(4, 0x06054b50), le(2, 0), le(2, 0), le(2, specs.length), le(2, specs.length),
    le(4, cd.length), le(4, cdOffset), le(2, 0),
  ]);
  return concat([options.prefix ?? new Uint8Array(0), ...locals, gap, cd, end]);
}
