import { describe, expect, it } from "vitest";
import vectors from "../fixtures/three-way-merge-v1-vectors.json";
import { mergeThreeWay } from "./three-way-merge";

/**
 * `src/fixtures/three-way-merge-v1-vectors.json` is a byte-for-byte copy of
 * AgentKit's `docs/conformance/skill-lifecycle/three-way-merge-v1-vectors.json`,
 * which AgentKit's rebase merge (skilloverlay merge3) is checked against too.
 * A rebase of the same overlay must merge identically on both sides, so the
 * file is replaced only by a newer copy, never edited here.
 */
describe("three-way merge conformance vectors", () => {
  it("is the shared vector schema", () => {
    expect(vectors.schema).toBe("agentkit.three-way-merge-vectors/v1");
    expect(new Set(vectors.cases.map((c) => c.name)).size).toBe(vectors.cases.length);
  });

  for (const c of vectors.cases) {
    it(c.name, () => {
      const got = mergeThreeWay(c.base, c.ours, c.theirs);
      if (c.expect.clean) {
        expect(got).toEqual({ clean: true, text: c.expect.text });
        return;
      }
      expect(got.clean).toBe(false);
      if (got.clean) return;
      expect(got.conflicts.map(({ baseStart, baseEnd }) => ({ baseStart, baseEnd }))).toEqual(c.expect.conflicts);
    });
  }
});
