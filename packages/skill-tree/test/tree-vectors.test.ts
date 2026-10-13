import { describe, expect, it } from "vitest";
import { SkillTreeError, buildTree, readTarTree, readZipTree, serializeTree } from "../src/index";
import type { TreeManifest } from "../src/index";
import { concat, tarStream } from "./tar-writer";
import type { TarSpec } from "./tar-writer";
import { zipBytes } from "./zip-writer";
import type { ZipSpec } from "./zip-writer";
import { fileBytes, loadTreeVectors, rawName, synthPath, vectorEntries } from "./vector-helpers";
import type { TreeVector, VectorFile } from "./vector-helpers";

const doc = loadTreeVectors();
const vectors = doc.vectors;

/** Vectors each archive harness presents today; lower them only with a reason. */
const MIN_TAR_VECTORS = 133;
const MIN_ZIP_VECTORS = 113;
const ran = { tar: 0, zip: 0 };

const VECTOR_KEYS = new Set(["id", "description", "files", "synthesize", "archiveOnly", "expect"]);
const FILE_KEYS = new Set(["path", "rawPathBase64", "mode", "headerMode", "type", "paxRecords", "content", "contentBase64"]);
const SYNTH_KEYS = new Set(["pathPattern", "count", "size", "fill", "mode", "type"]);

async function outcome(run: () => TreeManifest | Promise<TreeManifest>): Promise<{ digest?: string; error?: string; manifest?: TreeManifest }> {
  try {
    const manifest = await run();
    return { digest: manifest.digest, manifest };
  } catch (err) {
    if (err instanceof SkillTreeError) return { error: err.code };
    throw err;
  }
}

function expectOutcome(got: { digest?: string; error?: string }, v: TreeVector): void {
  if (v.expect.error !== undefined) expect(got.error, v.id).toBe(v.expect.error);
  else expect(got, v.id).toMatchObject({ digest: v.expect.digest });
}

/** Archive mode of a vector entry: header modes as given, mode classes as octal, "" as an invalid mode. */
function archiveMode(f: { mode?: string; headerMode?: string }): number {
  if (f.headerMode !== undefined) return parseInt(f.headerMode, 8);
  return f.mode === undefined || f.mode === "" ? 0o777 : parseInt(f.mode, 8);
}

const TAR_TYPES: Record<string, string> = {
  "": "0", file: "0", directory: "5", symlink: "2", "archive-hardlink": "1",
  "pax-global": "g", "tar-nul": "\0", cont: "7", fifo: "6", device: "3",
};
const HEADER_ONLY = new Set(["1", "2", "3", "4", "5", "6"]);

/** An empty GNU 1.0 sparse map ("0\n" in one block), which Go reads from the start of the data section. */
const EMPTY_SPARSE_1_0_MAP = (() => {
  const block = new Uint8Array(512);
  block.set(new TextEncoder().encode("0\n"));
  return block;
})();

const isSparse1x0 = (pax?: Record<string, string>) => pax?.["GNU.sparse.major"] === "1" && pax["GNU.sparse.minor"] === "0";

/** The vector as a tar stream, or undefined when tar cannot present it (walker-only types, NUL names). */
function tarSpecs(v: TreeVector): TarSpec[] | undefined {
  const specs: TarSpec[] = [];
  for (const f of v.files ?? []) {
    const typeflag = TAR_TYPES[f.type ?? ""];
    const name = rawName(f);
    if (typeflag === undefined || name.includes(0) || (typeflag !== "g" && f.paxRecords?.path !== undefined)) return undefined;
    const pax = f.paxRecords;
    // Header-only types (links, devices, directories, FIFOs) carry no data, as Go's tar writer enforces.
    // Type NUL with a name ending in "/" is a directory to Go's reader, so it is header-only too.
    const nulDir = typeflag === "\0" && name[name.length - 1] === 0x2f;
    let data = typeflag === "g" || nulDir || HEADER_ONLY.has(typeflag) ? undefined : fileBytes(f);
    // A GNU 1.0 sparse file's data section starts with its map; without one Go's reader fails.
    if (data !== undefined && typeflag !== "g" && isSparse1x0(pax)) data = concat([EMPTY_SPARSE_1_0_MAP, data]);
    specs.push({ name, typeflag, mode: archiveMode(f), data, ...(pax ? { pax } : {}) } as TarSpec);
  }
  for (const s of v.synthesize ?? []) {
    const typeflag = TAR_TYPES[s.type ?? ""];
    if (typeflag === undefined) return undefined;
    for (let n = 0; n < s.count; n++) {
      specs.push({ name: new TextEncoder().encode(synthPath(s, n)), typeflag, mode: archiveMode({ mode: s.mode ?? "100644" }), fill: { size: s.size, byte: s.fill } });
    }
  }
  return specs;
}

const ZIP_TYPES: Record<string, number> = { "": 0o100000, file: 0o100000, directory: 0o040000 };
const MAX_ZIP_VECTOR_BYTES = 8 << 20;

/** Zip external mode: directories always carry the directory type bits; files keep the vector mode. */
function zipMode(f: VectorFile, type: number): number {
  const mode = archiveMode(f);
  if (type === 0o040000) return type | (mode & 0o7777);
  return (mode & 0o170000) === 0 ? type | mode : mode;
}

/** The vector as a zip archive, or undefined when zip cannot present it. */
function zipSpecs(v: TreeVector): ZipSpec[] | undefined {
  const specs: ZipSpec[] = [];
  for (const f of v.files ?? []) {
    const type = ZIP_TYPES[f.type ?? ""];
    if (type === undefined || f.paxRecords !== undefined) return undefined;
    specs.push({ name: rawName(f), data: type === 0o040000 ? new Uint8Array(0) : fileBytes(f), unixMode: zipMode(f, type), method: specs.length % 2 === 0 ? 8 : 0 });
  }
  for (const s of v.synthesize ?? []) {
    const type = ZIP_TYPES[s.type ?? ""];
    if (type === undefined || s.size * s.count > MAX_ZIP_VECTOR_BYTES) return undefined;
    for (let n = 0; n < s.count; n++) {
      specs.push({ name: new TextEncoder().encode(synthPath(s, n)), data: new Uint8Array(s.size).fill(s.fill), unixMode: zipMode({ mode: s.mode ?? "100644" }, type) });
    }
  }
  return specs;
}

describe("skill-tree-v1 vectors (vendored unedited from AgentKit)", () => {
  it("is the expected vector file and the harness models every field", () => {
    expect(doc).toMatchObject({ schema: "agentkit.skill-tree-vectors/v1", contract: "agentkit.skill-tree/v1", unicode: "15.0.0" });
    expect(vectors.length).toBeGreaterThan(0);
    for (const v of vectors) {
      for (const key of Object.keys(v)) expect(VECTOR_KEYS.has(key), `${v.id}.${key}`).toBe(true);
      for (const f of v.files ?? []) for (const key of Object.keys(f)) expect(FILE_KEYS.has(key), `${v.id} file.${key}`).toBe(true);
      for (const s of v.synthesize ?? []) for (const key of Object.keys(s)) expect(SYNTH_KEYS.has(key), `${v.id} synth.${key}`).toBe(true);
      expect(Object.keys(v.expect).every((k) => ["digest", "serialization", "error"].includes(k)), v.id).toBe(true);
    }
  });

  it.each(vectors.map((v) => [v.id, v] as const))("buildTree: %s", async (_id, v) => {
    const got = await outcome(() => buildTree(vectorEntries(v)));
    expectOutcome(got, v);
    if (got.manifest !== undefined) {
      if (v.expect.serialization !== undefined) expect(serializeTree(got.manifest.files)).toBe(v.expect.serialization);
      expect(got.manifest).toMatchObject({ schema: "agentkit.skill-tree/v1", modeSource: "recorded" });
    }
  });

  it.each(vectors.map((v) => [v.id, v] as const))("tar reader agrees: %s", async (_id, v) => {
    const specs = tarSpecs(v);
    if (specs === undefined) return;
    expectOutcome(await outcome(() => readTarTree(tarStream(specs))), v);
    ran.tar++;
  }, 120_000);

  it.each(vectors.map((v) => [v.id, v] as const))("zip reader agrees: %s", async (_id, v) => {
    const specs = zipSpecs(v);
    if (specs === undefined) return;
    expectOutcome(await outcome(() => readZipTree(zipBytes(specs))), v);
    ran.zip++;
  }, 60_000);

  // Tests in a file run in order, so this sees every reader run above; it
  // stops a harness change from silently skipping most vectors.
  it("each archive reader ran most vectors", () => {
    expect(ran.tar).toBeGreaterThanOrEqual(MIN_TAR_VECTORS);
    expect(ran.zip).toBeGreaterThanOrEqual(MIN_ZIP_VECTORS);
  });
});
