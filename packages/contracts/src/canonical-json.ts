/**
 * Canonical JSON used for signed SkillX payloads.
 *
 * The output is the RFC 8785 (JCS) form restricted to the value space signed
 * payloads use, so every byte is defined without a floating-point formatter:
 *
 * - objects: members sorted by key, comparing UTF-16 code units (equal to
 *   byte order for the ASCII keys every SkillX schema uses); no whitespace;
 *   members whose value is `undefined` are rejected, never skipped;
 * - arrays: elements in order, no whitespace;
 * - numbers: non-negative safe integers (0 .. 2^53-1) only, in plain decimal;
 * - strings: `"` and `\` are escaped as `\"` and `\\`; U+0008, U+0009,
 *   U+000A, U+000C and U+000D as `\b`, `\t`, `\n`, `\f`, `\r`; every other
 *   code point below U+0020 as `\u00xx` with lowercase hex; every other code
 *   point, including `/`, `<`, `>`, `&`, U+007F, U+2028 and U+2029, is
 *   emitted as raw UTF-8. A string with an unpaired surrogate is rejected;
 * - `true`, `false` and `null` literally.
 *
 * The bytes are the UTF-8 encoding of the result, without a BOM or trailing
 * newline. Go's `encoding/json.Marshal` does NOT produce this form (it
 * HTML-escapes `<>&`, escapes U+2028/U+2029 and keeps struct field order).
 */

export class CanonicalJsonError extends Error {
  constructor(path: string, message: string) {
    super(path === "" ? message : `${path}: ${message}`);
    this.name = "CanonicalJsonError";
  }
}

const SHORT_ESCAPES: Readonly<Record<number, string>> = {
  0x08: "\\b",
  0x09: "\\t",
  0x0a: "\\n",
  0x0c: "\\f",
  0x0d: "\\r",
  0x22: '\\"',
  0x5c: "\\\\",
};

function encodeString(value: string, path: string): string {
  let out = '"';
  for (let i = 0; i < value.length; i++) {
    const unit = value.charCodeAt(i);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new CanonicalJsonError(path, "string holds an unpaired surrogate");
      out += value[i]! + value[i + 1]!;
      i++;
      continue;
    }
    if (unit >= 0xdc00 && unit <= 0xdfff) throw new CanonicalJsonError(path, "string holds an unpaired surrogate");
    const short = SHORT_ESCAPES[unit];
    if (short !== undefined) out += short;
    else if (unit < 0x20) out += `\\u${unit.toString(16).padStart(4, "0")}`;
    else out += value[i]!;
  }
  return `${out}"`;
}

function encode(value: unknown, path: string): string {
  if (value === null) return "null";
  if (value === true) return "true";
  if (value === false) return "false";
  if (typeof value === "string") return encodeString(value, path);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0 || Object.is(value, -0)) {
      throw new CanonicalJsonError(path, `number ${value} is not a non-negative safe integer`);
    }
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item, i) => encode(item, `${path}[${i}]`)).join(",")}]`;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    const record = value as Record<string, unknown>;
    // Array.prototype.sort without a comparator orders by UTF-16 code units, as JCS requires.
    const keys = Object.keys(record).sort();
    const members = keys.map((key) => {
      const memberPath = path === "" ? key : `${path}.${key}`;
      if (record[key] === undefined) throw new CanonicalJsonError(memberPath, "value is undefined");
      return `${encodeString(key, memberPath)}:${encode(record[key], memberPath)}`;
    });
    return `{${members.join(",")}}`;
  }
  throw new CanonicalJsonError(path, `unsupported value of type ${typeof value}`);
}

/** The canonical JSON text of `value`. Throws `CanonicalJsonError` outside the supported value space. */
export function canonicalJson(value: unknown): string {
  return encode(value, "");
}

/** The UTF-8 bytes of `canonicalJson(value)`. */
export function canonicalJsonBytes(value: unknown): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(canonicalJson(value));
}
