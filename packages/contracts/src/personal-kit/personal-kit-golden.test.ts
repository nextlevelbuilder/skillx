import { describe, expect, it } from "vitest";
import { applyOverlay, buildKitLock, memoryTree, revisionDigest, validateKitDocument } from "../index";
import type { FileMode } from "@skillx/skill-tree/rules";
import golden from "../fixtures/personal-kit-golden.json";

/**
 * Golden vector shared with AgentKit's Go implementation: every digest in
 * `src/fixtures/personal-kit-golden.json` must be re-derived byte for byte from
 * its inputs. A change here is a wire-format change for both sides.
 */

describe("personal kit golden vector", () => {
  it("re-derives the base tree, composition, revision digest and lock", async () => {
    const base = await memoryTree(golden.baseFiles as unknown as Array<{ path: string; text: string; mode?: FileMode }>);
    expect(base.digest).toBe(golden.base.treeDigest);
    expect(base.files).toEqual(golden.base.files);

    const doc = validateKitDocument(golden.document as unknown);
    expect(doc).toEqual(golden.document);
    const composed = await applyOverlay(base, doc.skills[0]!.overlay);
    expect(composed.digest).toBe(golden.expected.compositionDigest);
    expect(composed.files).toEqual(golden.expected.composedFiles);
    expect(new TextDecoder().decode(await composed.read("SKILL.md"))).toContain("two (mine)\n");

    const digest = await revisionDigest(doc);
    expect(digest).toBe(golden.expected.revisionDigest);
    const lock = await buildKitLock([doc], { id: golden.expected.lock.revisionId, number: 1, digest });
    expect(lock).toEqual(golden.expected.lock);
  });
});
