import { once } from "node:events";
import { createGzip, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildTree, readTarTree, readZipTree } from "../src/index";
import { tarBytes, tarStream } from "./tar-writer";
import type { TarSpec } from "./tar-writer";
import { zipBytes } from "./zip-writer";
import { errorCodeOf, sha256 } from "./vector-helpers";

const enc = new TextEncoder();
const SKILL = enc.encode("---\nname: demo\ndescription: Demo.\n---\n");

function file(name: string, data: Uint8Array | string = "x\n", mode = 0o644): TarSpec {
  return { name: enc.encode(name), typeflag: "0", mode, data: typeof data === "string" ? enc.encode(data) : data };
}

const skill = file("SKILL.md", SKILL);

/** Gzips a stream without holding its uncompressed bytes. */
async function gzipStream(source: AsyncIterable<Uint8Array>): Promise<Uint8Array> {
  const parts: Buffer[] = [];
  const gz = createGzip();
  const drained = (async () => {
    for await (const chunk of gz) parts.push(chunk as Buffer);
  })();
  for await (const chunk of source) if (!gz.write(chunk)) await once(gz, "drain");
  gz.end();
  await drained;
  return Buffer.concat(parts);
}

async function tarCode(specs: TarSpec[]): Promise<string | null> {
  return errorCodeOf(() => readTarTree(tarStream(specs)));
}

describe("tar reader rejects unsafe entries", () => {
  it.each([
    ["zip-slip parent segment", [file("../evil.md")], "tree.unsafe_path"],
    ["nested parent segment", [file("refs/../../evil.md")], "tree.unsafe_path"],
    ["absolute path", [file("/etc/passwd")], "tree.unsafe_path"],
    ["backslash", [file("refs\\x.md")], "tree.unsafe_path"],
    ["Windows reserved name", [file("CON.md")], "tree.unsafe_path"],
    ["8.3 short name", [file("PROGRA~1/x.md")], "tree.unsafe_path"],
    ["trailing dot", [file("notes.")], "tree.unsafe_path"],
    ["NFD name", [file("café.md")], "tree.non_nfc_path"],
    ["Kelvin sign (NFC maps it to K)", [file("K.md")], "tree.non_nfc_path"],
    ["full case-fold collision", [file("STRASSE.md"), file("straße.md")], "tree.case_collision"],
    ["simple case collision", [file("Refs/a.md"), file("refs/b.md")], "tree.case_collision"],
    ["symbolic link", [{ name: enc.encode("link"), typeflag: "2", mode: 0o777 }], "tree.unsupported_entry"],
    ["hard link", [{ name: enc.encode("hard"), typeflag: "1", mode: 0o644 }], "tree.unsupported_entry"],
    ["FIFO", [{ name: enc.encode("pipe"), typeflag: "6", mode: 0o644 }], "tree.unsupported_entry"],
    ["contiguous file", [{ ...file("big.bin"), typeflag: "7" }], "tree.unsupported_entry"],
    ["sparse PAX file", [{ ...file("sparse.bin"), pax: { "GNU.sparse.major": "1", "GNU.sparse.minor": "0" } }], "tree.unsupported_entry"],
    ["setuid file", [file("run.sh", "#!/bin/sh\n", 0o4755)], "tree.unsupported_entry"],
    ["group-writable file", [file("w.md", "x\n", 0o664)], "tree.unsupported_entry"],
  ] as const)("%s", async (_name, specs, code) => {
    expect(await tarCode([skill, ...specs])).toBe(code);
  });

  it("rejects a tree with no files", async () => {
    expect(await tarCode([{ name: enc.encode("empty/"), typeflag: "5", mode: 0o755 }])).toBe("tree.empty");
  });
});

describe("tar reader fails closed on damaged archives", () => {
  it("rejects a truncated archive", async () => {
    const bytes = await tarBytes([skill, file("refs/a.md", new Uint8Array(4000).fill(97))]);
    expect(await errorCodeOf(() => readTarTree(bytes.subarray(0, 2048)))).toBe("tree.read_failed");
  });

  it("rejects a header with a bad checksum", async () => {
    const bytes = await tarBytes([skill]);
    bytes[0] = bytes[0]! ^ 0x01;
    expect(await errorCodeOf(() => readTarTree(bytes))).toBe("tree.read_failed");
  });

  it("rejects a corrupt gzip stream", async () => {
    const gz = gzipSync(await tarBytes([skill]));
    gz[gz.length - 6] = gz[gz.length - 6]! ^ 0xff;
    expect(await errorCodeOf(() => readTarTree(gz))).toBe("tree.read_failed");
  });

  it("accepts an archive without the end-of-archive blocks", async () => {
    const manifest = await readTarTree(await tarBytes([skill], false));
    expect(manifest.files.map((f) => f.path)).toEqual(["SKILL.md"]);
  });
});

describe("tar reader enforces limits while streaming", () => {
  it("stops reading a file once it exceeds the per-file limit", async () => {
    let pulled = 0;
    const source = (async function* () {
      for await (const chunk of tarStream([skill, { ...file("bomb.bin"), data: undefined, fill: { size: 64 << 20, byte: 0 } }])) {
        pulled += chunk.length;
        yield chunk;
      }
    })();
    expect(await errorCodeOf(() => readTarTree(source, { limits: { maxEntries: 10, maxFiles: 10, maxFileSize: 4 << 20, maxTreeSize: 8 << 20 } }))).toBe(
      "tree.limit_exceeded",
    );
    expect(pulled).toBeLessThan(8 << 20);
  });

  it("stops inflating a gzip bomb at the default limit", async () => {
    // 512 MiB of zeros inflates from ~0.5 MB; the reader must stop near the 32 MiB file limit.
    const gz = await gzipStream(tarStream([skill, { ...file("bomb.bin"), data: undefined, fill: { size: 512 << 20, byte: 0 } }]));
    let consumed = 0;
    const source = (async function* () {
      for (let at = 0; at < gz.length; at += 1024) {
        const chunk = gz.subarray(at, at + 1024);
        consumed += chunk.length;
        yield chunk;
      }
    })();
    expect(await errorCodeOf(() => readTarTree(source))).toBe("tree.limit_exceeded");
    expect(consumed).toBeLessThan(gz.length / 2);
  }, 120_000);

  it("rejects more files than the file limit", async () => {
    const specs = Array.from({ length: 5 }, (_, n) => file(`f${n}.md`));
    const limits = { maxEntries: 100, maxFiles: 4, maxFileSize: 1024, maxTreeSize: 4096 };
    expect(await errorCodeOf(() => readTarTree(tarStream(specs), { limits }))).toBe("tree.limit_exceeded");
  });
});

describe("one tree, one digest", () => {
  const files = [
    { name: "SKILL.md", data: SKILL, mode: 0o644 },
    { name: "scripts/run.sh", data: enc.encode("#!/bin/sh\necho hi\n"), mode: 0o755 },
    { name: "refs/été.md", data: enc.encode("summer\n"), mode: 0o644 },
    { name: "refs/z.md", data: new Uint8Array(70_000).fill(122), mode: 0o644 },
  ];

  it("tar, tar.gz, zip and presented entries agree in any order", async () => {
    const specs = files.map((f) => file(f.name, f.data, f.mode));
    const tar = await tarBytes(specs);
    const reversed = await tarBytes([...specs].reverse());
    const zip = zipBytes(files.map((f, i) => ({ name: enc.encode(f.name), data: f.data, unixMode: 0o100000 | f.mode, method: i % 2 === 0 ? 8 : 0 })));
    const presented = buildTree(
      files.map((f) => ({ path: f.name, mode: f.mode === 0o755 ? "100755" : "100644", size: f.data.length, sha256: sha256(f.data), kind: "regular" as const })),
    );
    const digests = [
      (await readTarTree(tar)).digest,
      (await readTarTree(reversed)).digest,
      (await readTarTree(gzipSync(tar))).digest,
      (await readTarTree(new Blob([gzipSync(tar)]).stream())).digest,
      (await readZipTree(zip)).digest,
      presented.digest,
    ];
    expect(new Set(digests).size).toBe(1);
    expect(digests[0]).toMatch(/^sha256:[0-9a-f]{64}$/);
  });
});
