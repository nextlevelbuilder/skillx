import { describe, expect, it } from "vitest";
import { CanonicalJsonError, canonicalJson, canonicalJsonBytes, parseCanonicalJson } from "./canonical-json";

// Built from code points so no editor or formatter can normalize them away.
const E_ACUTE = String.fromCodePoint(0xe9);
const EMOJI = String.fromCodePoint(0x1f600);
const HALFWIDTH_STOP = String.fromCodePoint(0xff61);
const LINE_SEPARATOR = String.fromCodePoint(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCodePoint(0x2029);
const DEL = String.fromCharCode(0x7f);
const LONE_HIGH = String.fromCharCode(0xd800);
const LONE_LOW = String.fromCharCode(0xdc00);

describe("canonical JSON", () => {
  it("sorts object members at every depth and drops whitespace", () => {
    const a = { b: 1, a: [{ z: true, y: null }], c: { e: "x", d: 0 } };
    const b = { c: { d: 0, e: "x" }, a: [{ y: null, z: true }], b: 1 };
    expect(canonicalJson(a)).toBe('{"a":[{"y":null,"z":true}],"b":1,"c":{"d":0,"e":"x"}}');
    expect(canonicalJson(b)).toBe(canonicalJson(a));
  });

  it("keeps array order", () => {
    expect(canonicalJson(["b", "a"])).toBe('["b","a"]');
  });

  it("orders keys by UTF-16 code units, as RFC 8785 does", () => {
    const value = { [E_ACUTE]: 1, z: 2, A: 3, [EMOJI]: 4, [HALFWIDTH_STOP]: 5 };
    expect(canonicalJson(value)).toBe(`{"A":3,"z":2,"${E_ACUTE}":1,"${EMOJI}":4,"${HALFWIDTH_STOP}":5}`);
  });

  it("escapes only quote, backslash and C0 controls", () => {
    const value = ['"', "\\", "\b", "\t", "\n", "\f", "\r", String.fromCharCode(0), String.fromCharCode(0x1f)].join("");
    expect(canonicalJson(value)).toBe(String.raw`"\"\\\b\t\n\f\r\u0000\u001f"`);
  });

  it("emits HTML characters, DEL, U+2028, U+2029 and non-ASCII as raw UTF-8", () => {
    const value = `</a>&${DEL}${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}caf${E_ACUTE}${EMOJI}/`;
    expect(canonicalJson(value)).toBe(`"${value}"`);
    expect([...canonicalJsonBytes(LINE_SEPARATOR)]).toEqual([0x22, 0xe2, 0x80, 0xa8, 0x22]);
  });

  it("writes non-negative safe integers in plain decimal", () => {
    expect(canonicalJson([0, 1, Number.MAX_SAFE_INTEGER])).toBe("[0,1,9007199254740991]");
  });

  it.each([
    ["a fraction", 1.5],
    ["a negative number", -1],
    ["negative zero", -0],
    ["an unsafe integer", 2 ** 53],
    ["NaN", Number.NaN],
    ["infinity", Number.POSITIVE_INFINITY],
    ["a lone high surrogate", LONE_HIGH],
    ["a lone low surrogate", `x${LONE_LOW}`],
    ["an undefined member", { a: undefined }],
    ["a Date", new Date(0)],
    ["a Map", new Map()],
    ["a bigint", 1n],
    // eslint-disable-next-line no-sparse-arrays
    ["a sparse array", [1, , 3]],
    ["an array with a trailing hole", new Array(2)],
    ["a null-prototype object", Object.create(null)],
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
  });

  it("names the offending path", () => {
    expect(() => canonicalJson({ files: [{ size: 1.5 }] })).toThrow("files[0].size");
    // eslint-disable-next-line no-sparse-arrays
    expect(() => canonicalJson({ files: [1, , 3] })).toThrow("files[1]");
  });
});

describe("parseCanonicalJson", () => {
  const canonical = '{"a":[1,"x"],"b":null,"c":true}';

  it("accepts exactly the canonical text, as a string or UTF-8 bytes", () => {
    expect(parseCanonicalJson(canonical)).toEqual({ ok: true, value: { a: [1, "x"], b: null, c: true } });
    expect(parseCanonicalJson(new TextEncoder().encode(canonical)).ok).toBe(true);
    const unicode = `{"p":"caf${String.fromCodePoint(0xe9)} ${String.fromCodePoint(0x2028)} & <"}`;
    expect(parseCanonicalJson(new TextEncoder().encode(unicode)).ok).toBe(true);
  });

  it.each<[string, string | Uint8Array]>([
    ["whitespace", '{"a": [1,"x"],"b":null,"c":true}'],
    ["member order", '{"b":null,"a":[1,"x"],"c":true}'],
    ["a duplicate member", '{"a":[1,"x"],"a":[1,"x"],"b":null,"c":true}'],
    ["a duplicate member whose last value wins", '{"a":[2],"a":[1,"x"],"b":null,"c":true}'],
    ["an exponent", '{"a":[1e0,"x"],"b":null,"c":true}'],
    ["a fraction", '{"a":[1.0,"x"],"b":null,"c":true}'],
    ["a negative number", '{"a":[-1,"x"],"b":null,"c":true}'],
    ["an escaped ASCII character", '{"a":[1,"\\u0078"],"b":null,"c":true}'],
    ["an escaped solidus", '{"a":[1,"\\/"],"b":null,"c":true}'],
    ["a byte order mark", `${String.fromCodePoint(0xfeff)}${canonical}`],
    ["a trailing newline", `${canonical}\n`],
    ["invalid UTF-8", new Uint8Array([0x22, 0xff, 0x22])],
    ["a UTF-8 byte order mark", new Uint8Array([0xef, 0xbb, 0xbf, ...new TextEncoder().encode(canonical)])],
    ["not JSON", "{"],
    ["an escaped lone surrogate", '"\\ud800"'],
  ])("rejects %s without throwing", (_name, input) => {
    const result = parseCanonicalJson(input);
    expect(result.ok).toBe(false);
  });
});
