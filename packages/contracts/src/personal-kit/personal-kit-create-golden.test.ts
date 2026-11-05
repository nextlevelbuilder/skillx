import { describe, expect, it } from "vitest";
import { EMPTY_TREE_DIGEST, applyOverlay, buildKitLock, emptyKitTree, kitTreeDigest, revisionDigest, validateKitDocument } from "../index";
import golden from "../fixtures/personal-kit-create-golden.json";

/**
 * Golden vector of a `create` entry, shared with AgentKit's Go
 * implementation: the skill files are added onto the empty tree, so the
 * composition is exactly the user's files. A change here is a wire-format
 * change for both sides.
 */

describe("personal kit create golden vector", () => {
  it("re-derives the empty tree, composition, revision digest and lock", async () => {
    expect(await kitTreeDigest([])).toBe(EMPTY_TREE_DIGEST);
    expect(golden.emptyTreeDigest).toBe(EMPTY_TREE_DIGEST);

    const doc = validateKitDocument(golden.document as unknown);
    expect(doc).toEqual(golden.document);
    const composed = await applyOverlay(emptyKitTree(), doc.skills[0]!.overlay);
    expect(composed.digest).toBe(golden.expected.compositionDigest);
    expect(composed.files).toEqual(golden.expected.composedFiles);

    const digest = await revisionDigest(doc);
    expect(digest).toBe(golden.expected.revisionDigest);
    const lock = await buildKitLock([doc], { id: golden.expected.lock.revisionId, number: 1, digest });
    expect(lock).toEqual(golden.expected.lock);
  });

  it("round-trips the skill files byte for byte", async () => {
    const composed = await applyOverlay(emptyKitTree(), validateKitDocument(golden.document as unknown).skills[0]!.overlay);
    for (const f of golden.files) {
      expect(new TextDecoder().decode(await composed.read(f.path))).toBe(f.text);
      expect(composed.files.find((c) => c.path === f.path)!.mode).toBe(f.mode ?? "100644");
    }
    expect(composed.files.map((f) => f.path)).toEqual(golden.files.map((f) => f.path));
  });
});
