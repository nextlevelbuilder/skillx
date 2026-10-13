import { beforeEach, describe, expect, it } from "vitest";
import { tarBytes } from "../../../../packages/skill-tree/test/tar-writer";
import { createHarness, file, tarOf } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
const enc = new TextEncoder();
const skillFiles = () => [file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n")];

let h: Harness;
beforeEach(async () => {
  h = await createHarness();
});

describe("release publish: hostile archives fail before any R2 write", () => {
  const spec = (name: string, typeflag = "0", data = "x") => ({ name: enc.encode(name), typeflag, mode: 0o644, data: enc.encode(data) });

  it.each([
    ["zip-slip path", [spec("SKILL.md"), spec("../evil.sh")], "tree.unsafe_path"],
    ["absolute path", [spec("SKILL.md"), spec("/etc/passwd")], "tree.unsafe_path"],
    ["symlink", [spec("SKILL.md"), { ...spec("link", "2", ""), data: undefined }], "tree.unsupported_entry"],
    ["hardlink", [spec("SKILL.md"), { ...spec("hard", "1", ""), data: undefined }], "tree.unsupported_entry"],
  ])("rejects a %s", async (_label, specs, code) => {
    const res = await h.upload("@alpha/demo", await tarBytes(specs));
    expect(res).toMatchObject({ status: 422, body: { error: { code } } });
    expect(h.r2.putLog).toEqual([]);
    expect(h.releaseRows()).toEqual([]);
  });

  it("rejects an oversized upload while it streams (413)", async () => {
    const chunk = new Uint8Array(1024 * 1024);
    let sent = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent++ < 40) controller.enqueue(chunk);
        else controller.close();
      },
    });
    const res = await h.upload("@alpha/demo", stream);
    expect(res).toMatchObject({ status: 413, body: { error: { code: "tree.limit_exceeded" } } });
    expect(sent).toBeLessThan(40);
    expect(h.r2.putLog).toEqual([]);
  });

  it("rejects gzip and non-tar bodies", async () => {
    const gz = new Uint8Array([0x1f, 0x8b, 8, 0, 0, 0, 0, 0, 0, 3, ...new Array(600).fill(0)]);
    expect((await h.upload("@alpha/demo", gz)).status).toBe(422);
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { contentType: "application/gzip" })).status).toBe(415);
    expect(h.r2.putLog).toEqual([]);
  });

  it("rejects invalid metadata with 400 before storage", async () => {
    for (const metadata of [{ version: "01.0.0" }, { version: "1.0.0", extra: 1 }, { version: "1.0.0", sourceProvenance: { repo: "http://x", commit: "a", path: "" } }]) {
      expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { metadata })).status).toBe(400);
    }
    expect(h.r2.putLog).toEqual([]);
  });
});
