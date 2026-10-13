import { once } from "node:events";
import { createGzip, gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildTree, readTarTree, readZipTree } from "../src/index";
import { parsePax } from "../src/tar-header";
import { concat, paxData, tarBytes, tarHeader, tarStream } from "./tar-writer";
import type { TarSpec } from "./tar-writer";
import { zipBytes } from "./zip-writer";
import { errorCodeOf, sha256 } from "./vector-helpers";

const enc = new TextEncoder();
const SKILL = enc.encode("---\nname: demo\ndescription: Demo.\n---\n");

function file(name: string, data: Uint8Array | string = "x\n", mode = 0o644): TarSpec {
  return { name: enc.encode(name), typeflag: "0", mode, data: typeof data === "string" ? enc.encode(data) : data };
}

const skill = file("SKILL.md", SKILL);

const SPARSE_1_0 = { "GNU.sparse.major": "1", "GNU.sparse.minor": "0" };

/** A GNU 1.0 sparse data section: the map (decimal lines, padded to a block), then the data. */
function sparse1x0Data(data: string, map = "0\n"): Uint8Array {
  const block = new Uint8Array(Math.ceil(map.length / 512) * 512);
  block.set(enc.encode(map));
  return concat([block, enc.encode(data)]);
}

/** Overwrites header fields of a tar block and recomputes its checksum. */
function patchHeader(block: Uint8Array, fields: Array<[number, string | number[]]>): Uint8Array {
  const b = block.slice();
  for (const [at, value] of fields) b.set(typeof value === "string" ? enc.encode(value) : value, at);
  b.fill(0x20, 148, 156);
  const sum = b.reduce((n, x) => n + x, 0);
  b.set(enc.encode(`${sum.toString(8).padStart(6, "0")}\0 `), 148);
  return b;
}

const pad = (size: number) => new Uint8Array((512 - (size % 512)) % 512);

/** One entry as raw blocks: a (patched) header, its data and padding. */
function rawEntry(name: string, typeflag: string, data: Uint8Array, fields: Array<[number, string | number[]]> = [], size = data.length): Uint8Array {
  return concat([patchHeader(tarHeader(enc.encode(name), typeflag, 0o644, size), fields), data, pad(data.length)]);
}

const END = new Uint8Array(1024);
const skillBytes = () => tarBytes([skill], false);

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
    ["sparse PAX file", [{ ...file("sparse.bin", sparse1x0Data("x")), pax: SPARSE_1_0 }], "tree.unsupported_entry"],
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

describe("tar headers parse like Go archive/tar", () => {
  const data = enc.encode("x\n");
  const expected = async () => (await readTarTree(await tarBytes([skill, file("refs/a.md")]))).digest;
  const read = async (...parts: Uint8Array[]) => readTarTree(concat([await skillBytes(), ...parts, END]));
  const code = (...parts: Uint8Array[]) => errorCodeOf(() => read(...parts));
  const ff = (n: number) => new Array<number>(n).fill(0xff);

  it("cuts an octal field at its first NUL", async () => {
    expect((await read(rawEntry("refs/a.md", "0", data, [[100, "644\0zzz\0"]]))).digest).toBe(await expected());
  });

  it("accepts negative and wide base-256 ids and times", async () => {
    const wide = [0x80, 0, 0x7f, 0xff, 0xff, 0xff, 0xff, 0xff];
    expect((await read(rawEntry("refs/a.md", "0", data, [[108, ff(8)], [116, wide], [136, ff(12)]]))).digest).toBe(await expected());
  });

  it("rejects numeric fields that do not parse, used or not", async () => {
    expect(await code(rawEntry("refs/a.md", "0", data, [[108, "0000009\0"]]))).toBe("tree.read_failed");
    expect(await code(rawEntry("refs/a.md", "0", data, [[329, "zz\0"]]))).toBe("tree.read_failed");
    // A base-256 value beyond int64 overflows, as in Go.
    expect(await code(rawEntry("refs/a.md", "0", data, [[136, [0x80, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0]]]))).toBe("tree.read_failed");
  });

  it("rejects a negative size, on files and extension headers", async () => {
    expect(await code(rawEntry("refs/a.md", "0", data, [[124, ff(12)]]))).toBe("tree.read_failed");
    expect(await code(rawEntry("PaxHeader", "x", new Uint8Array(0), [[124, ff(12)]]), rawEntry("refs/a.md", "0", data))).toBe("tree.read_failed");
    // Header-only types ignore their size.
    expect(await code(rawEntry("refs/", "5", new Uint8Array(0), [[124, ff(12)]]), rawEntry("refs/a.md", "0", data))).toBeNull();
  });

  it("checks the raw header size before a PAX size overrides it", async () => {
    const paxSize = (size: string) => rawEntry("PaxHeader", "x", paxData({ size }));
    expect(await code(paxSize("2"), rawEntry("refs/a.md", "0", data, [[124, ff(12)]]))).toBe("tree.read_failed");
    // A negative merged size is fine once type NUL becomes a header-only directory.
    expect(await code(paxSize("-1"), rawEntry("refs/", "\0", new Uint8Array(0)), rawEntry("refs/a.md", "0", data))).toBeNull();
  });

  it("never truncates a base-256 mode to 32 bits", async () => {
    const mode = [0x80, 0, 0, 0x01, 0, 0, 0x01, 0xa4]; // 2^32 + 0o644
    expect(await code(rawEntry("refs/a.md", "0", data, [[100, mode]]))).toBe("tree.unsupported_entry");
    expect(await code(rawEntry("refs/a.md", "0", data, [[100, ff(8)]]))).toBe("tree.unsupported_entry");
  });

  it("joins a USTAR prefix whatever the version field holds", async () => {
    expect((await read(rawEntry("a.md", "0", data, [[263, [0, 0]], [345, "refs\0"]]))).digest).toBe(await expected());
  });

  it("falls back to a USTAR prefix where a GNU header's times do not parse", async () => {
    expect((await read(rawEntry("a.md", "0", data, [[257, "ustar  \0"], [345, "refs\0"]]))).digest).toBe(await expected());
  });

  it("accepts PAX record lengths with a sign or leading zeros", async () => {
    for (const len of ["0020", "+020"]) {
      const pax = rawEntry("PaxHeader", "x", enc.encode(`${len} path=refs/a.md\n`));
      expect((await read(pax, rawEntry("placeholder.md", "0", data))).digest, len).toBe(await expected());
    }
    expect(await code(rawEntry("PaxHeader", "x", enc.encode("-20 path=refs/a.md\n")), rawEntry("a.md", "0", data))).toBe("tree.read_failed");
  });

  it.each([
    [{ mtime: "1." }, null],
    [{ mtime: "-1.5" }, null],
    [{ mtime: ".5" }, "tree.read_failed"],
    [{ mtime: "1.5x" }, "tree.read_failed"],
    [{ uid: "-5" }, null],
    [{ uid: "+5" }, null],
    [{ uid: "9223372036854775808" }, "tree.read_failed"],
    [{ size: "" }, null],
    [{ size: "+2" }, null],
  ] as const)("PAX values %j", async (pax, want) => {
    expect(await tarCode([skill, { ...file("refs/a.md"), pax }])).toBe(want);
  });

  it("an empty GNU long name clears an earlier one", async () => {
    const longName = (name: string) => rawEntry("././@LongLink", "L", enc.encode(`${name}\0`));
    expect((await read(longName("refs/long-name.md"), longName(""), rawEntry("refs/a.md", "0", data))).digest).toBe(await expected());
  });

  it("keeps PAX records in a prototype-free object", () => {
    const { records } = parsePax(paxData({ ["__proto__"]: "x", constructor: "y", path: "p" }));
    expect(Object.getPrototypeOf(records)).toBeNull();
    expect(Object.keys(records).sort()).toEqual(["__proto__", "constructor", "path"]);
    expect(records["__proto__"]).toBe("x");
  });
});

describe("tar reader rewrites type NUL like Go archive/tar", () => {
  const data = enc.encode("x\n");
  const v01 = { "GNU.sparse.major": "0", "GNU.sparse.minor": "1", "GNU.sparse.numblocks": "0", "GNU.sparse.map": "" };

  it("reads no data for a type NUL directory, so the next block is a header", async () => {
    const smuggled = rawEntry("evil.md", "0", data);
    const manifest = await readTarTree(concat([await skillBytes(), rawEntry("refs/", "\0", smuggled), END]));
    expect(manifest.files.map((f) => f.path)).toEqual(["SKILL.md", "evil.md"]);
    expect(manifest.digest).toBe((await readTarTree(await tarBytes([skill, file("evil.md")]))).digest);
  });

  it("rejects a sparse map on a type NUL directory", async () => {
    expect(await tarCode([skill, { name: enc.encode("refs/"), typeflag: "\0", mode: 0o755, pax: v01 }])).toBe("tree.read_failed");
  });

  it("decides the type from the name before GNU.sparse.name replaces it", async () => {
    const spec = { name: enc.encode("placeholder"), typeflag: "\0", mode: 0o644, data: enc.encode("x"), pax: { ...v01, path: "a", "GNU.sparse.name": "a/" } };
    expect(await tarCode([skill, spec])).toBe("tree.unsupported_entry");
  });
});

describe("tar reader ingest overhead guard", () => {
  const limits = { maxEntries: 10, maxFiles: 10, maxFileSize: 1 << 20, maxTreeSize: 2 << 20 };

  async function readCounted(source: AsyncIterable<Uint8Array>): Promise<{ error: unknown; pulled: number }> {
    let pulled = 0;
    const counted = (async function* () {
      for await (const chunk of source) {
        pulled += chunk.length;
        yield chunk;
      }
    })();
    const error = await readTarTree(counted, { limits }).then(
      () => null,
      (err: unknown) => err,
    );
    return { error, pulled };
  }

  const overheadGuard = expect.objectContaining({ code: "tree.limit_exceeded", detail: expect.stringContaining("ingest overhead guard") });

  it("stops in the data of a non-regular entry", async () => {
    const got = await readCounted(tarStream([skill, { name: enc.encode("big.bin"), typeflag: "7", mode: 0o644, fill: { size: 64 << 20, byte: 0 } }]));
    expect(got.error).toEqual(overheadGuard);
    expect(got.pulled).toBeLessThan(4 << 20);
  });

  it("stops in a chain of PAX headers", async () => {
    const chain = (async function* () {
      yield* tarStream([skill], false);
      const header = rawEntry("PaxHeader", "x", paxData({ comment: "c".repeat(60_000) }));
      for (let i = 0; i < 100_000; i++) yield header;
    })();
    const got = await readCounted(chain);
    expect(got.error).toEqual(overheadGuard);
    expect(got.pulled).toBeLessThan(4 << 20);
  });

  it("accepts a near-limit tree with a 40 KiB xattr on every file at the default limits", async () => {
    // 4096 files (the file limit) totalling exactly 256 MiB (the tree limit),
    // each behind a PAX header with a 40 KiB SCHILY.xattr record: about 170 MiB
    // of overhead on top of the content. Specs share one buffer and stream lazily.
    const content = new Uint8Array(64 << 10).fill(0x61);
    const pax = { "SCHILY.xattr.user.blob": "x".repeat(40 << 10) };
    const specs: TarSpec[] = [{ ...file("SKILL.md", SKILL), pax }];
    specs.push({ ...file("f/0000.md", new Uint8Array((128 << 10) - SKILL.length).fill(0x62)), pax });
    for (let n = 1; n < 4095; n++) specs.push({ ...file(`f/${String(n).padStart(4, "0")}.md`, content), pax });
    const manifest = await readTarTree(tarStream(specs));
    expect(manifest.files).toHaveLength(4096);
    expect(manifest.files.reduce((sum, f) => sum + f.size, 0)).toBe(256 << 20);
  }, 300_000);
});

describe("tar reader handles GNU sparse files like Go", () => {
  const sparse = (pax: Record<string, string>, data: Uint8Array | string, name = "data.bin"): TarSpec => ({
    name: enc.encode(name),
    typeflag: "0",
    mode: 0o644,
    data: typeof data === "string" ? enc.encode(data) : data,
    pax,
  });
  const v01 = (numblocks: string, map: string) => ({ "GNU.sparse.major": "0", "GNU.sparse.minor": "1", "GNU.sparse.numblocks": numblocks, "GNU.sparse.map": map });

  it.each([
    ["1.0 with an empty map", sparse(SPARSE_1_0, sparse1x0Data("x")), "tree.unsupported_entry"],
    ["1.0 with a map entry", sparse(SPARSE_1_0, sparse1x0Data("x", "1\n0\n1\n")), "tree.unsupported_entry"],
    ["0.1 map", sparse(v01("1", "0,1"), "xy"), "tree.unsupported_entry"],
    ["0.0 offset and numbytes records", sparse({ "GNU.sparse.numblocks": "1", "GNU.sparse.offset": "0", "GNU.sparse.numbytes": "1" }, "x"), "tree.unsupported_entry"],
    ["unknown version: not sparse, records still unsupported", sparse({ "GNU.sparse.major": "2", "GNU.sparse.minor": "0" }, "x"), "tree.unsupported_entry"],
    ["size record wins over realsize", sparse({ ...SPARSE_1_0, "GNU.sparse.size": "1", "GNU.sparse.realsize": String(64 << 20) }, sparse1x0Data("x")), "tree.unsupported_entry"],
    ["0.1 map with too few fields", sparse(v01("2", "0,1"), "xy"), "tree.read_failed"],
    ["0.1 entry beyond the logical size", sparse(v01("1", "0,5"), "xy"), "tree.read_failed"],
    ["0.1 overlapping entries", sparse(v01("2", "0,2,1,1"), "xyz"), "tree.read_failed"],
    ["0.1 negative offset", sparse(v01("1", "-1,1"), "xy"), "tree.read_failed"],
    ["0.1 missing entry count", sparse({ "GNU.sparse.major": "0", "GNU.sparse.minor": "1", "GNU.sparse.map": "0,1" }, "xy"), "tree.read_failed"],
    ["numbytes before offset", sparse({ "GNU.sparse.numblocks": "1", "GNU.sparse.numbytes": "1", "GNU.sparse.offset": "0" }, "x"), "tree.read_failed"],
    ["1.0 map that is not decimal", sparse(SPARSE_1_0, sparse1x0Data("x", "1\nzero\n1\n")), "tree.read_failed"],
    ["1.0 map past the data section", sparse(SPARSE_1_0, "1\n"), "tree.read_failed"],
    ["invalid GNU.sparse.size", sparse({ ...SPARSE_1_0, "GNU.sparse.size": "x" }, sparse1x0Data("x")), "tree.read_failed"],
    ["negative GNU.sparse.size", sparse({ ...SPARSE_1_0, "GNU.sparse.size": "-1" }, sparse1x0Data("x")), "tree.read_failed"],
  ] as const)("%s", async (_name, spec, want) => {
    expect(await tarCode([skill, spec])).toBe(want);
  });

  it("applies GNU.sparse.name before the noise rules", async () => {
    const got = await readTarTree(tarStream([skill, sparse({ ...SPARSE_1_0, "GNU.sparse.name": ".DS_Store" }, sparse1x0Data("x"))]));
    expect(got.digest).toBe((await readTarTree(tarStream([skill]))).digest);
  });

  it("counts the logical size toward the limits", async () => {
    expect(await tarCode([skill, sparse({ ...SPARSE_1_0, "GNU.sparse.realsize": String(64 << 20) }, sparse1x0Data("x"))])).toBe("tree.limit_exceeded");
  });

  describe("old GNU sparse headers", () => {
    const data = enc.encode("xy");
    const gnu: Array<[number, string | number[]]> = [[257, "ustar  \0"], [483, "00000000002\0"]];
    const code = (...parts: Uint8Array[]) => errorCodeOf(async () => readTarTree(concat([await skillBytes(), ...parts, END])));

    it("are rejected outside the GNU format", async () => {
      expect(await code(rawEntry("data.bin", "S", data))).toBe("tree.read_failed");
    });

    it("are unsupported with a valid map", async () => {
      expect(await code(rawEntry("data.bin", "S", data, [...gnu, [386, "00000000000\0"], [398, "00000000001\0"]]))).toBe("tree.unsupported_entry");
    });

    it("fail with a map beyond the real size", async () => {
      expect(await code(rawEntry("data.bin", "S", data, [...gnu, [386, "00000000000\0"], [398, "00000000005\0"]]))).toBe("tree.read_failed");
    });

    it("read extension blocks before the data", async () => {
      const ext = new Uint8Array(512);
      ext.set(enc.encode("00000000001\0"), 0);
      ext.set(enc.encode("00000000001\0"), 12);
      const header = patchHeader(tarHeader(enc.encode("data.bin"), "S", 0o644, data.length), [...gnu, [482, [1]]]);
      expect(await code(concat([header, ext, data, pad(data.length)]), rawEntry("refs/a.md", "0", enc.encode("x\n")))).toBe("tree.unsupported_entry");
      ext.set(enc.encode("00000000009\0"), 12);
      expect(await code(concat([header, ext, data, pad(data.length)]))).toBe("tree.read_failed");
    });
  });
});
