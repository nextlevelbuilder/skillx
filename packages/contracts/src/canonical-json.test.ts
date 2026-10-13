import { describe, expect, it } from "vitest";
import { CanonicalJsonError, canonicalJson, canonicalJsonBytes } from "./canonical-json";

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
  ])("rejects %s", (_name, value) => {
    expect(() => canonicalJson(value)).toThrow(CanonicalJsonError);
  });

  it("names the offending path", () => {
    expect(() => canonicalJson({ files: [{ size: 1.5 }] })).toThrow("files[0].size");
  });
});
