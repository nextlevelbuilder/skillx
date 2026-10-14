import { describe, expect, it } from "vitest";
import { PersonalKitError } from "./codes";
import { encodeBase64, sha256Hex, utf8 } from "./bytes";
import { applyOverlay } from "./apply-overlay";
import { memoryTree } from "./kit-tree";
import type { KitTree } from "./kit-tree";
import { emptyOverlay, validateOverlay } from "./overlay-envelope";
import { overlayBetween, rebaseOverlay } from "./rebase";
import { formatPatch } from "./unified-patch";

const skill = (body: string, front = "name: demo\nallowed-tools: Read") => `---\n${front}\n---\n${body}`;
const body = (...xs: string[]) => xs.map((x) => `${x}\n`).join("");
const tree = (files: Record<string, string>) => memoryTree(Object.entries(files).map(([path, text]) => ({ path, text })));
const text = async (t: KitTree, p: string) => new TextDecoder().decode(await t.read(p));
const failure = async (p: Promise<unknown>) => p.then(() => "ok", (e: unknown) => (e instanceof PersonalKitError ? e.code : String(e)));

const B0_BODY = body("intro", "a", "b", "c", "d", "e", "f", "g", "h", "end");

describe("applyOverlay", () => {
  it("gives the base digest for an empty overlay and a new digest otherwise", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY) });
    expect(await applyOverlay(b0, emptyOverlay(b0.digest))).toBe(b0);
    const target = await tree({ "SKILL.md": skill(B0_BODY), "notes.md": "mine\n" });
    const overlay = await overlayBetween(b0, target);
    expect(overlay.ops.map((o) => o.op)).toEqual(["add"]);
    expect((await applyOverlay(b0, overlay)).digest).toBe(target.digest);
  });

  it("refuses stale anchors, adds over files, noise paths and empty results", async () => {
    const b0 = await tree({ "SKILL.md": "x\n" });
    const stale = { ...emptyOverlay(`sha256:${"0".repeat(64)}`), ops: [] };
    expect(await failure(applyOverlay(b0, stale))).toBe("overlay.conflict");
    const add = validateOverlay({ ...emptyOverlay(b0.digest), ops: [{ op: "add", path: "SKILL.md", contentBase64: encodeBase64(utf8("y")) }] });
    expect(await failure(applyOverlay(b0, add))).toBe("overlay.conflict");
    const wrongSha = validateOverlay({ ...emptyOverlay(b0.digest), ops: [{ op: "delete", path: "SKILL.md", expectSha256: "a".repeat(64) }] });
    expect(await failure(applyOverlay(b0, wrongSha))).toBe("overlay.conflict");
    const sha = await sha256Hex(utf8("x\n"));
    const all = validateOverlay({ ...emptyOverlay(b0.digest), ops: [{ op: "delete", path: "SKILL.md", expectSha256: sha }] });
    expect(await failure(applyOverlay(b0, all))).toBe("tree.empty");
    const noise = validateOverlay({ ...emptyOverlay(b0.digest), ops: [{ op: "add", path: ".DS_Store", contentBase64: "" }] });
    expect(await failure(applyOverlay(b0, noise))).toBe("overlay.invalid");
  });

  it("refuses patching a binary file", async () => {
    const b0 = await memoryTree([{ path: "SKILL.md", text: "x\n" }, { path: "a.bin", bytes: new Uint8Array([0, 1]) }]);
    const sha = b0.files.find((f) => f.path === "a.bin")!.sha256;
    const op = validateOverlay({ ...emptyOverlay(b0.digest), ops: [{ op: "patch", path: "a.bin", expectSha256: sha, patch: "@@ -1 +1 @@\n-a\n+b\n" }] });
    expect(await failure(applyOverlay(b0, op))).toBe("overlay.invalid");
  });
});

describe("rebaseOverlay", () => {
  const userBody = B0_BODY.replace("b\n", "B-user\n");

  it("is clean when the overlay is empty and follows upstream", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY) });
    const b1 = await tree({ "SKILL.md": skill(B0_BODY + "more\n") });
    const result = await rebaseOverlay(b0, b1, emptyOverlay(b0.digest));
    expect(result.status).toBe("clean");
    if (result.status === "clean") expect(result.compositionDigest).toBe(b1.digest);
  });

  it("merges disjoint upstream and user edits into a re-anchored patch", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY) });
    const u0 = await overlayBetween(b0, await tree({ "SKILL.md": skill(userBody) }));
    const b1 = await tree({ "SKILL.md": skill(B0_BODY.replace("h\n", "H-up\n")) });
    const result = await rebaseOverlay(b0, b1, u0);
    expect(result.status).toBe("clean");
    if (result.status !== "clean") return;
    expect(result.findings.map((f) => f.category)).toEqual(["clean.disjoint"]);
    expect(result.overlay.baseTreeDigest).toBe(b1.digest);
    expect(await text(result.tree, "SKILL.md")).toBe(skill(userBody.replace("h\n", "H-up\n")));
    const again = await rebaseOverlay(b0, b1, u0);
    expect(again).toMatchObject({ compositionDigest: result.compositionDigest });
  });

  it("stops for review on the same hunk, deleted files and both-added paths", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY), "ref.md": "r\n" });
    const user = await tree({ "SKILL.md": skill(userBody), "ref.md": "r2\n", "new.md": "mine\n" });
    const u0 = await overlayBetween(b0, user);
    const b1 = await tree({ "SKILL.md": skill(B0_BODY.replace("b\n", "B-up\n")), "new.md": "theirs\n" });
    const result = await rebaseOverlay(b0, b1, u0);
    expect(result.status).toBe("needs-review");
    expect(result.findings.map((f) => `${f.path}:${f.category}`)).toEqual([
      "SKILL.md:conflict.same_hunk",
      "new.md:conflict.added_both",
      "ref.md:conflict.renamed_or_deleted",
    ]);
  });

  it("flags semantic changes even when text merges cleanly", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY) });
    const u0 = await overlayBetween(b0, await tree({ "SKILL.md": skill(userBody) }));
    const b1 = await tree({ "SKILL.md": skill(B0_BODY, "name: demo\nallowed-tools: Read Bash\nlicense: MIT") });
    const result = await rebaseOverlay(b0, b1, u0);
    expect(result.status).toBe("needs-review");
    expect(result.findings.map((f) => f.category)).toEqual(["clean.disjoint", "conflict.capability_escalation", "conflict.license_changed"]);
  });

  it("drops ops that upstream already contains", async () => {
    const b0 = await tree({ "SKILL.md": skill(B0_BODY) });
    const u0 = await overlayBetween(b0, await tree({ "SKILL.md": skill(userBody) }));
    const b1 = await tree({ "SKILL.md": skill(userBody) });
    const result = await rebaseOverlay(b0, b1, u0);
    expect(result).toMatchObject({ status: "clean", compositionDigest: b1.digest });
    if (result.status === "clean") expect(result.overlay.ops).toEqual([]);
  });

  it("flags a SKILL.md link to a file the candidate lost", async () => {
    const b0 = await tree({ "SKILL.md": skill(body("see [ref](./ref.md)", ...B0_BODY.split("\n").slice(0, -1))), "ref.md": "r\n" });
    const user = await tree({ "SKILL.md": skill(body("see [ref](./ref.md)", ...B0_BODY.split("\n").slice(0, -1))), "ref.md": "r\n", "extra.md": "x\n" });
    const u0 = await overlayBetween(b0, user);
    const b1 = await tree({ "SKILL.md": skill(body("see [ref](./ref.md)", ...B0_BODY.split("\n").slice(0, -1))) });
    const result = await rebaseOverlay(b0, b1, u0);
    expect(result.status).toBe("needs-review");
    expect(result.findings.some((f) => f.category === "conflict.dependency_missing" && f.path === "ref.md")).toBe(true);
  });

  it("formats patches against the new base", async () => {
    expect(formatPatch("a\n", "b\n")).toBe("@@ -1,1 +1,1 @@\n-a\n+b\n");
  });
});
