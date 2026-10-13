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
  STREAM_SAFE,
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
/** Leading and trailing non-starter counts of x/text norm's Stream-Safe Text Processing. */
const streamSafe = decodeMap(STREAM_SAFE);

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

/** U+034F COMBINING GRAPHEME JOINER, a starter that never composes. */
const CGJ = 0x034f;
const MAX_NON_STARTERS = 30;

/** Code points that are the second of a primary composite pair (x/text "combines backward"). */
const combinesBackward = new Set<number>();
for (const key of compositions.keys()) combinesBackward.add(key % 0x110000);

/**
 * Splits code points into the segments Go's x/text norm normalizes one at a
 * time, each decomposed and canonically ordered. A segment starts at a code
 * point with no leading non-starter. Stream-Safe Text Processing: when a
 * code point would extend a run past 30 non-starters (counted over
 * compatibility decompositions, as x/text does), a CGJ ends the segment and
 * the code point starts the next one, so a string with such a run is never
 * NFC.
 */
function segments(cps: Iterable<number>): number[][] {
  const out: number[][] = [];
  let segment: number[] = [];
  let run = 0;
  for (const cp of cps) {
    const [lead = 0, trail = 0] = streamSafe.get(cp) ?? [];
    if (lead > 0 && run + lead > MAX_NON_STARTERS) {
      segment.push(CGJ);
      run = 0;
      out.push(segment);
      segment = [];
    } else if (lead === 0 && segment.length > 0) {
      out.push(segment);
      segment = [];
    }
    run = lead === 0 ? trail : run + lead;
    decomposeInto(cp, segment);
  }
  if (segment.length > 0) out.push(segment);
  for (const s of out) {
    // Canonical ordering: stable insertion sort of each run of non-starters.
    for (let i = 1; i < s.length; i++) {
      const cc = combiningClass(s[i]!);
      if (cc === 0) continue;
      let j = i;
      while (j > 0 && combiningClass(s[j - 1]!) > cc) {
        [s[j - 1], s[j]] = [s[j]!, s[j - 1]!];
        j--;
      }
    }
  }
  return out;
}

/**
 * Recomposes one segment exactly as x/text reorderBuffer.compose does. It
 * differs from UAX #15 in one way: a starter only becomes the composition
 * target when a code point that combines backward follows it directly, so a
 * starter such as U+FF9E inside a segment does not block.
 */
function composeSegment(b: number[]): number[] {
  const ccc = b.map(combiningClass);
  let k = 1;
  let s = 0;
  const keep = (i: number) => {
    b[k] = b[i]!;
    ccc[k++] = ccc[i]!;
  };
  const assign = (cp: number) => {
    b[s] = cp;
    ccc[s] = 0;
  };
  for (let i = 1; i < b.length; i++) {
    if (b[i]! >= 0x1100 && b[i]! <= 0x11ff) {
      // Hangul mode for the rest of the segment, as in x/text combineHangul.
      for (; i < b.length; i++) {
        const cccB = ccc[k - 1]!;
        if (cccB === 0) s = k - 1;
        if (s !== k - 1 && cccB >= ccc[i]!) {
          keep(i);
          continue;
        }
        const l = b[s]! - L_BASE, v = b[i]! - V_BASE, lv = b[s]! - S_BASE, t = b[i]! - T_BASE;
        if (l >= 0 && l < L_COUNT && v >= 0 && v < V_COUNT) assign(S_BASE + (l * V_COUNT + v) * T_COUNT);
        else if (lv >= 0 && lv < S_COUNT && lv % T_COUNT === 0 && t > 0 && t < T_COUNT) assign(b[s]! + t);
        else keep(i);
      }
      break;
    }
    if (combinesBackward.has(b[i]!)) {
      const cccB = ccc[k - 1]!;
      let blocked = false;
      if (cccB === 0) s = k - 1;
      else blocked = s !== k - 1 && cccB >= ccc[i]!;
      const composite = blocked ? undefined : compositions.get(pairKey(b[s]!, b[i]!));
      if (composite !== undefined) {
        assign(composite);
        continue;
      }
    }
    keep(i);
  }
  b.length = Math.min(k, b.length);
  return b;
}

function nfdCodePoints(cps: Iterable<number>): number[] {
  return segments(cps).flat();
}

function nfcCodePoints(cps: Iterable<number>): number[] {
  return segments(cps).flatMap(composeSegment);
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
