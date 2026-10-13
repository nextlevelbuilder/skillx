/**
 * Unicode 15.0.0 character data for path validation: general category
 * (assigned / Cf), canonical normalization (NFD, NFC) and full case folding
 * (CaseFolding.txt statuses C and F). Everything is driven by tables
 * generated from the 15.0.0 UCD files, never by the runtime's Intl or
 * String.prototype.normalize data, so every runtime classifies a path
 * identically (contract 4.3).
 */
import {
  ASSIGNED_RANGES,
  CANONICAL_DECOMPOSITIONS,
  CASE_FOLDING,
  COMBINING_CLASSES,
  FORMAT_RANGES,
  PRIMARY_COMPOSITES,
  UNICODE_VERSION,
} from "./unicode-15-tables";

export { UNICODE_VERSION };

/** Decodes "delta.len" base-36 range items into flat [lo, hi, ...] pairs. */
function decodeRanges(encoded: string): Int32Array {
  const items = encoded.split(",");
  const out = new Int32Array(items.length * 2);
  let prev = 0;
  items.forEach((item, i) => {
    const [delta = "", len = ""] = item.split(".");
    const lo = prev + parseInt(delta, 36);
    const hi = lo + parseInt(len, 36);
    out[i * 2] = lo;
    out[i * 2 + 1] = hi;
    prev = hi;
  });
  return out;
}

/** Decodes "deltaKey:v1.v2" items (key delta-coded, values absolute) into a map. */
function decodeMap(encoded: string): Map<number, number[]> {
  const out = new Map<number, number[]>();
  let prev = 0;
  for (const item of encoded.split(",")) {
    const [key = "", values = ""] = item.split(":");
    prev += parseInt(key, 36);
    out.set(prev, values.split(".").map((v) => parseInt(v, 36)));
  }
  return out;
}

function inRanges(ranges: Int32Array, cp: number): boolean {
  let lo = 0;
  let hi = ranges.length / 2 - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (cp < ranges[mid * 2]!) hi = mid - 1;
    else if (cp > ranges[mid * 2 + 1]!) lo = mid + 1;
    else return true;
  }
  return false;
}

const assigned = decodeRanges(ASSIGNED_RANGES);
const format = decodeRanges(FORMAT_RANGES);
const decompositions = decodeMap(CANONICAL_DECOMPOSITIONS);
const folding = decodeMap(CASE_FOLDING);

const combiningClasses = new Map<number, number>();
{
  let prev = 0;
  for (const item of COMBINING_CLASSES.split(",")) {
    const [delta = "", len = "", value = ""] = item.split(".");
    const lo = prev + parseInt(delta, 36);
    const hi = lo + parseInt(len, 36);
    for (let cp = lo; cp <= hi; cp++) combiningClasses.set(cp, parseInt(value, 36));
    prev = hi;
  }
}

const compositions = new Map<number, number>();
{
  let prev = 0;
  for (const delta of PRIMARY_COMPOSITES.split(",")) {
    prev += parseInt(delta, 36);
    const [a, b] = decompositions.get(prev) ?? [];
    if (a !== undefined && b !== undefined) compositions.set(pairKey(a, b), prev);
  }
}

function pairKey(a: number, b: number): number {
  return a * 0x110000 + b;
}

/** General category is not Cn (Co and Cs count as assigned). */
export function isAssigned(cp: number): boolean {
  return inRanges(assigned, cp);
}

/** General category Cf. */
export function isFormat(cp: number): boolean {
  return inRanges(format, cp);
}

export function combiningClass(cp: number): number {
  return combiningClasses.get(cp) ?? 0;
}

/** The C+F case folding of one code point, or undefined when it has none. */
export function caseFold(cp: number): readonly number[] | undefined {
  return folding.get(cp);
}

/** Every code point with a C or F case folding entry. */
export function caseFoldEntries(): ReadonlyMap<number, readonly number[]> {
  return folding;
}

// Hangul syllable constants (Unicode 3.12).
const S_BASE = 0xac00, L_BASE = 0x1100, V_BASE = 0x1161, T_BASE = 0x11a7;
const L_COUNT = 19, V_COUNT = 21, T_COUNT = 28, N_COUNT = V_COUNT * T_COUNT, S_COUNT = L_COUNT * N_COUNT;

function decomposeInto(cp: number, out: number[]): void {
  const s = cp - S_BASE;
  if (s >= 0 && s < S_COUNT) {
    out.push(L_BASE + Math.floor(s / N_COUNT), V_BASE + Math.floor((s % N_COUNT) / T_COUNT));
    if (s % T_COUNT !== 0) out.push(T_BASE + (s % T_COUNT));
    return;
  }
  const mapping = decompositions.get(cp);
  if (mapping === undefined) out.push(cp);
  else for (const m of mapping) decomposeInto(m, out);
}

/** Canonical decomposition with canonical ordering (NFD) over code points. */
function nfdCodePoints(cps: Iterable<number>): number[] {
  const out: number[] = [];
  for (const cp of cps) decomposeInto(cp, out);
  // Canonical ordering: stable insertion sort of each run of non-starters.
  for (let i = 1; i < out.length; i++) {
    const cc = combiningClass(out[i]!);
    if (cc === 0) continue;
    let j = i;
    while (j > 0 && combiningClass(out[j - 1]!) > cc) {
      [out[j - 1], out[j]] = [out[j]!, out[j - 1]!];
      j--;
    }
  }
  return out;
}

function composePair(a: number, b: number): number | undefined {
  const l = a - L_BASE, v = b - V_BASE;
  if (l >= 0 && l < L_COUNT && v >= 0 && v < V_COUNT) return S_BASE + (l * V_COUNT + v) * T_COUNT;
  const s = a - S_BASE, t = b - T_BASE;
  if (s >= 0 && s < S_COUNT && s % T_COUNT === 0 && t > 0 && t < T_COUNT) return a + t;
  return compositions.get(pairKey(a, b));
}

function nfcCodePoints(cps: Iterable<number>): number[] {
  const d = nfdCodePoints(cps);
  if (d.length === 0) return d;
  const out = [d[0]!];
  let starterPos = 0;
  let lastClass = combiningClass(d[0]!) === 0 ? 0 : 256;
  for (let i = 1; i < d.length; i++) {
    const ch = d[i]!;
    const chClass = combiningClass(ch);
    const composite = composePair(out[starterPos]!, ch);
    if (composite !== undefined && (lastClass < chClass || lastClass === 0)) {
      out[starterPos] = composite;
      continue;
    }
    if (chClass === 0) starterPos = out.length;
    lastClass = chClass;
    out.push(ch);
  }
  return out;
}

const codePoints = (s: string): number[] => Array.from(s, (ch) => ch.codePointAt(0)!);
export function nfd(s: string): string {
  return String.fromCodePoint(...nfdCodePoints(codePoints(s)));
}

export function nfc(s: string): string {
  return String.fromCodePoint(...nfcCodePoints(codePoints(s)));
}

export function isNfc(s: string): boolean {
  return nfc(s) === s;
}

/** Full case folding (statuses C and F), code point by code point. */
export function fold(s: string): string {
  const out: number[] = [];
  for (const cp of codePoints(s)) {
    const mapped = folding.get(cp);
    if (mapped === undefined) out.push(cp);
    else out.push(...mapped);
  }
  return String.fromCodePoint(...out);
}
