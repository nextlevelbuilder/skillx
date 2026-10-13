import { describe, expect, it } from "vitest";
import { readTarTree } from "../src/index";
import { tarBytes, tarStream } from "./tar-writer";
import type { TarSpec } from "./tar-writer";

/**
 * `onFileContent` hands the exact bytes of each regular file to the caller
 * (the registry stores them as blobs) without changing the tree digest.
 */
const enc = new TextEncoder();
const spec = (name: string, data: Uint8Array, mode = 0o644): TarSpec => ({ name: enc.encode(name), typeflag: "0", mode, data });

const SKILL = enc.encode("---\nname: demo\ndescription: Demo.\n---\n");
// Bytes a sanitizer would alter: zero-width space, ANSI escape, CRLF, NUL.
const HOSTILE = enc.encode("a​b\u001b[31mred\u001b[0m\r\n\0end");
const BIG = new Uint8Array(3 * (1 << 20) + 17).map((_, i) => (i * 13) % 251);
// Element-wise toEqual on megabytes is too slow for CI; compare the buffers directly.
const sameBytes = (a: Uint8Array | undefined, b: Uint8Array) => a !== undefined && Buffer.compare(a, b) === 0;
const LONG = `${"nested/".repeat(16)}file.md`;

const specs: TarSpec[] = [
  spec("SKILL.md", SKILL),
  spec("scripts/run.sh", enc.encode("#!/bin/sh\n"), 0o755),
  spec("hostile.txt", HOSTILE),
  spec("assets/big.bin", BIG),
  spec("empty.md", new Uint8Array(0)),
  spec(LONG, enc.encode("long\n")),
];

describe("readTarTree onFileContent", () => {
  it("returns every file's exact bytes and leaves the digest unchanged", async () => {
    const bytes = await tarBytes(specs);
    const plain = await readTarTree(bytes);
    const seen = new Map<string, Uint8Array>();
    const hooked = await readTarTree(bytes, { onFileContent: (path, content) => seen.set(path, content.slice()) });

    expect(hooked).toEqual(plain);
    expect([...seen.keys()].sort()).toEqual(plain.files.map((f) => f.path).sort());
    expect(seen.get("SKILL.md")).toEqual(SKILL);
    expect(seen.get("hostile.txt")).toEqual(HOSTILE);
    expect(sameBytes(seen.get("assets/big.bin"), BIG)).toBe(true);
    expect(seen.get("empty.md")).toEqual(new Uint8Array(0));
    expect(seen.get(LONG)).toEqual(enc.encode("long\n"));
  });

  it("delivers the same bytes from a chunked stream", async () => {
    const seen = new Map<string, Uint8Array>();
    const manifest = await readTarTree(tarStream(specs), { onFileContent: (path, content) => seen.set(path, content.slice()) });
    expect(manifest.digest).toBe((await readTarTree(await tarBytes(specs))).digest);
    expect(sameBytes(seen.get("assets/big.bin"), BIG)).toBe(true);
  });
});
