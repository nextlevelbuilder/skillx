import { describe, expect, it } from "vitest";
import { foldKey } from "../src/collision";
import { decodeName } from "../src/entry-collector";
import { buildTree, frontmatterExposure, validatePath } from "../src/index";
import { errorCodeOf } from "./vector-helpers";

const PATH_CODES = new Set(["tree.unsafe_path", "tree.non_nfc_path"]);

/** Deterministic xorshift32, so a failure reproduces from the printed seed. */
function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 0x100000000;
  };
}

const ALPHABET = ["a", "A", "/", ".", "..", "~1", " ", "\\", ":", "\u0000", "é", "é", "K", "​", "\ud800", "CON", "ß", "\u{1f600}", ".ak-tmp.", "$"];

describe("path validation never throws", () => {
  it("classifies random byte names", () => {
    const next = rng(0x5eed);
    for (let i = 0; i < 20_000; i++) {
      const bytes = Uint8Array.from({ length: Math.floor(next() * 40) }, () => Math.floor(next() * 256));
      const name = decodeName(bytes);
      const result = validatePath(name.path);
      if (result !== null && !PATH_CODES.has(result.code)) expect.fail(`seed 0x5eed #${i}: ${result.code}`);
    }
  });

  it("classifies random token names and agrees with buildTree", async () => {
    const next = rng(0xc0ffee);
    for (let i = 0; i < 5_000; i++) {
      const path = Array.from({ length: 1 + Math.floor(next() * 6) }, () => ALPHABET[Math.floor(next() * ALPHABET.length)]).join("");
      const result = validatePath(path);
      if (result !== null && !PATH_CODES.has(result.code)) expect.fail(`${JSON.stringify(path)}: ${result.code}`);
      const entry = { path, mode: "100644", size: 1, sha256: "0".repeat(64), kind: "regular" as const };
      const code = await errorCodeOf(() => buildTree([entry]));
      if (result !== null) expect(code, JSON.stringify(path)).toBe(result.code);
      // A valid path still fails as a whole tree only when it is noise (empty tree).
      else expect(code === null || code === "tree.empty", JSON.stringify(path)).toBe(true);
    }
  });
});

describe("collision keys", () => {
  it("fold each segment independently, so directory keys are prefixes of file keys", () => {
    const next = rng(0xf01d);
    const marks = ["́", "̅", "̖", "̈́", "͏"];
    const tokens = [...ALPHABET, ...marks, ...marks, ...marks];
    for (let i = 0; i < 5_000; i++) {
      const path = Array.from({ length: 1 + Math.floor(next() * 40) }, () => tokens[Math.floor(next() * tokens.length)]).join("");
      expect(foldKey(path).split("/"), JSON.stringify(path)).toEqual(path.split("/").map(foldKey));
    }
    expect(foldKey("a" + "̅".repeat(20) + "/" + "̅".repeat(20))).toBe(foldKey("a" + "̅".repeat(20)) + "/" + foldKey("̅".repeat(20)));
  });
});

describe("frontmatter exposure never throws", () => {
  it.each([
    ["", "AUTO", false],
    ["user-invocable: false", "INTERNAL", false],
    ["disable-model-invocation: TRUE", "EXPLICIT", false],
    // A quoted value is a string, not a boolean: it is ignored without a warning.
    ["user-invocable: 'false'", "AUTO", false],
    ["user-invocable: !!bool false", "AUTO", true],
    ["user-invocable: &a false", "AUTO", true],
    ["user-invocable: false\nuser-invocable: true", "AUTO", true],
    ["- a\n- b", "AUTO", true],
    ["key: [unclosed", "AUTO", true],
  ] as const)("%j", (text, exposure, warning) => {
    expect(frontmatterExposure(text)).toEqual({ exposure, warning });
  });

  it("handles random input", () => {
    const next = rng(0xfeed);
    const pieces = ["user-invocable", "disable-model-invocation", ":", " ", "\n", "true", "false", "!!", "&", "*", "'", '"', "[", "{", "- ", "#"];
    for (let i = 0; i < 5_000; i++) {
      const text = Array.from({ length: Math.floor(next() * 12) }, () => pieces[Math.floor(next() * pieces.length)]).join("");
      const got = frontmatterExposure(text);
      expect(["AUTO", "EXPLICIT", "INTERNAL"]).toContain(got.exposure);
    }
  });
});
