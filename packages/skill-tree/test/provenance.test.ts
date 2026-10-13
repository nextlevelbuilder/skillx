/**
 * Pins the vendored fixtures and keeps the generated Unicode tables in sync
 * with their pinned inputs (the AgentKit CaseFolding file and the Go tables
 * dump), so table drift fails here instead of silently changing digests.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { UNICODE_VERSION, caseFoldEntries, combiningClass, isAssigned, isFormat, nfc, nfd } from "../src/unicode-15";
import { fixtureBytes, sha256 } from "./vector-helpers";

const PINS: Record<string, string> = {
  "vectors/skill-tree-v1-vectors.json": "8eb46f1b8bec49cace740b75614f28f8fb4a6fc266fecfcd7e3d6892f28f3172",
  "vectors/identity-v1-vectors.json": "1ab9e013c229d78871abd60e3cd3bf26fcfd0e6067d98dcdd79b4f6bcc1daefb",
  "ucd/CaseFolding-15.0.0.txt": "cdd49e55eae3bbf1f0a3f6580c974a0263cb86a6a08daa10fbf705b4808a56f7",
};
const GO_TABLES_SHA256 = "baa335155dcbaf0cfe8f40fcc0a98232c4134e821a08c3f198f829a51d911ad5";
const MAX_CP = 0x10ffff;

interface GoTables {
  unicodeVersion: string;
  normVersion: string;
  assigned: Array<[number, number]>;
  format: Array<[number, number]>;
  combiningClass: Array<[number, number]>;
  composites: number[];
}

const goBytes = readFileSync(fileURLToPath(new URL("../scripts/unicode-15.0.0-go.json", import.meta.url)));
const go = JSON.parse(goBytes.toString("utf8")) as GoTables;

function rangeSet(ranges: Array<[number, number]>): Uint8Array {
  const set = new Uint8Array(MAX_CP + 1);
  for (const [lo, hi] of ranges) set.fill(1, lo, hi + 1);
  return set;
}

const isSurrogate = (cp: number) => cp >= 0xd800 && cp <= 0xdfff;

describe("fixture provenance", () => {
  it.each(Object.entries(PINS))("%s is the pinned upstream file", (path, pin) => {
    expect(sha256(fixtureBytes(path))).toBe(pin);
  });

  it("the Go tables dump is the pinned Unicode 15.0.0 input", () => {
    expect(sha256(goBytes)).toBe(GO_TABLES_SHA256);
    expect([go.unicodeVersion, go.normVersion, UNICODE_VERSION]).toEqual(["15.0.0", "15.0.0", "15.0.0"]);
  });
});

describe("generated tables stay in sync with their inputs", () => {
  it("case folding equals CaseFolding.txt statuses C and F", () => {
    const want = new Map<number, number[]>();
    for (const line of fixtureBytes("ucd/CaseFolding-15.0.0.txt").toString("utf8").split("\n")) {
      const fields = line.replace(/#.*/, "").split(";").map((f) => f.trim());
      if (fields.length < 3 || (fields[1] !== "C" && fields[1] !== "F")) continue;
      want.set(parseInt(fields[0]!, 16), fields[2]!.split(" ").map((h) => parseInt(h, 16)));
    }
    expect(want.size).toBeGreaterThan(1400);
    expect(new Map(caseFoldEntries())).toEqual(want);
  });

  it("general categories match the Go tables for every code point", () => {
    const assigned = rangeSet(go.assigned);
    const format = rangeSet(go.format);
    for (let cp = 0; cp <= MAX_CP; cp++) {
      if (isAssigned(cp) !== (assigned[cp] === 1)) expect.fail(`assigned U+${cp.toString(16)}`);
      if (isFormat(cp) !== (format[cp] === 1)) expect.fail(`format U+${cp.toString(16)}`);
    }
  });

  it("combining classes match the Go tables", () => {
    const want = new Map(go.combiningClass);
    for (let cp = 0; cp <= MAX_CP; cp++) {
      if (combiningClass(cp) !== (want.get(cp) ?? 0)) expect.fail(`ccc U+${cp.toString(16)}`);
    }
  });
});

describe("normalization agrees with the runtime on Unicode 15.0.0 characters", () => {
  it("NFD and NFC of every assigned code point", () => {
    let checked = 0;
    for (let cp = 0; cp <= MAX_CP; cp++) {
      if (!isAssigned(cp) || isSurrogate(cp)) continue;
      const ch = String.fromCodePoint(cp);
      if (nfd(ch) !== ch.normalize("NFD")) expect.fail(`NFD U+${cp.toString(16)}`);
      if (nfc(ch) !== ch.normalize("NFC")) expect.fail(`NFC U+${cp.toString(16)}`);
      checked++;
    }
    expect(checked).toBeGreaterThan(149_000);
  });

  it("composes, reorders and blocks sequences", () => {
    const samples = [
      "é", "Ǻ", "ḍ̇", "q̣̇", "각", "각",
      "ą́", "Ą́", "אַּ", "क़", "Å", "Ω",
      "ཱི", "̈́", "à̛̀̕", "Ą̊", "ᅡᆨ", "́e",
    ];
    for (const s of samples) {
      expect(nfd(s), JSON.stringify(s)).toBe(s.normalize("NFD"));
      expect(nfc(s), JSON.stringify(s)).toBe(s.normalize("NFC"));
    }
  });
});
