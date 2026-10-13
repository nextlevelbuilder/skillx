import { describe, expect, it } from "vitest";
import { readZipTree } from "../src/index";
import type { RandomAccessSource } from "../src/index";
import { zipBytes } from "./zip-writer";
import type { ZipOptions, ZipSpec } from "./zip-writer";
import { errorCodeOf } from "./vector-helpers";

const enc = new TextEncoder();

function entry(name: string, data = "x\n", extra: Partial<ZipSpec> = {}): ZipSpec {
  return { name: enc.encode(name), data: enc.encode(data), unixMode: 0o100644, ...extra };
}

const skill = entry("SKILL.md", "---\nname: demo\ndescription: Demo.\n---\n", { method: 8 });
const baseline = await readZipTree(zipBytes([skill, entry("refs/a.md", "a\n".repeat(500), { method: 8 })]));

function zipCode(specs: ZipSpec[], options?: ZipOptions): Promise<string | null> {
  return errorCodeOf(() => readZipTree(zipBytes(specs, options)));
}

describe("zip reader accepts every valid layout", () => {
  it.each([12, 16, 20, 24] as const)("data descriptor of %i bytes", async (descriptor) => {
    const got = await readZipTree(zipBytes([skill, entry("refs/a.md", "a\n".repeat(500), { method: 8, descriptor })]));
    expect(got.digest).toBe(baseline.digest);
  });

  it("stored and deflated entries hash the same content", async () => {
    const got = await readZipTree(zipBytes([{ ...skill, method: 0 }, entry("refs/a.md", "a\n".repeat(500))]));
    expect(got.digest).toBe(baseline.digest);
  });

  it("reads through a random-access source and a Blob", async () => {
    const bytes = zipBytes([skill, entry("refs/a.md", "a\n".repeat(500), { method: 8 })]);
    const source: RandomAccessSource = { size: bytes.length, read: async (offset, length) => bytes.slice(offset, offset + length) };
    expect((await readZipTree(source)).digest).toBe(baseline.digest);
    expect((await readZipTree(new Blob([new Uint8Array(bytes)]))).digest).toBe(baseline.digest);
  });

  it("records executable files", async () => {
    const got = await readZipTree(zipBytes([skill, entry("run.sh", "#!/bin/sh\n", { unixMode: 0o100755 })]));
    expect(got.files.find((f) => f.path === "run.sh")?.mode).toBe("100755");
  });
});

describe("zip reader rejects unsafe or unsupported entries", () => {
  it.each([
    ["zip-slip", [entry("../evil.md")], "tree.unsafe_path"],
    ["absolute path", [entry("/evil.md")], "tree.unsafe_path"],
    ["case collision", [entry("Refs/a.md"), entry("refs/b.md")], "tree.case_collision"],
    ["symbolic link", [entry("link", "/etc", { unixMode: 0o120777 })], "tree.unsupported_entry"],
    ["setuid file", [entry("run.sh", "x", { unixMode: 0o104755 })], "tree.unsupported_entry"],
    ["non-Unix host attributes", [entry("a.md", "x", { madeByHost: 0 })], "tree.unsupported_entry"],
    ["encrypted entry", [entry("a.md", "x", { flags: 0x1 })], "tree.unsupported_entry"],
    ["central CRC disagrees with the local header", [entry("a.md", "x", { centralCrc: 0x12345678 })], "tree.unsupported_entry"],
  ] as const)("%s", async (_name, specs, code) => {
    expect(await zipCode([skill, ...specs])).toBe(code);
  });

  it("rejects an entry whose data does not match its CRC", async () => {
    const bytes = zipBytes([skill, entry("a.md", "hello\n")]);
    const at = Buffer.from(bytes).indexOf("hello\n");
    bytes[at] = 0x48;
    expect(await errorCodeOf(() => readZipTree(bytes))).toBe("tree.read_failed");
  });

  it("rejects deflate data that is corrupt", async () => {
    const bytes = zipBytes([skill, entry("a.md", "z".repeat(4096), { method: 8 })]);
    const local = Buffer.from(bytes).indexOf("a.md") + 4;
    bytes.fill(0xff, local, local + 6);
    expect(await errorCodeOf(() => readZipTree(bytes))).toBe("tree.read_failed");
  });
});

describe("zip reader rejects archive-level ambiguity", () => {
  it("rejects bytes before the first local entry", async () => {
    expect(await zipCode([skill], { prefix: enc.encode("#!/bin/sh\nexit 0\n") })).toBe("tree.unsupported_entry");
  });

  it("rejects bytes between the entries and the central directory", async () => {
    expect(await zipCode([skill], { gap: new Uint8Array(32) })).toBe("tree.unsupported_entry");
  });

  it("rejects truncated and non-zip input", async () => {
    const bytes = zipBytes([skill]);
    expect(await errorCodeOf(() => readZipTree(bytes.subarray(0, bytes.length - 10)))).toBe("tree.read_failed");
    expect(await errorCodeOf(() => readZipTree(enc.encode("not a zip archive")))).toBe("tree.read_failed");
    expect(await errorCodeOf(() => readZipTree(new Uint8Array(0)))).toBe("tree.read_failed");
  });

  it("enforces the per-file limit on inflated size", async () => {
    const limits = { maxEntries: 10, maxFiles: 10, maxFileSize: 1024, maxTreeSize: 4096 };
    const bytes = zipBytes([skill, entry("big.bin", "0".repeat(1 << 20), { method: 8 })]);
    expect(await errorCodeOf(() => readZipTree(bytes, { limits }))).toBe("tree.limit_exceeded");
  });
});
