/**
 * Loads the vendored AgentKit conformance vectors and turns tree vectors into
 * presented entries the same way the AgentKit Go harness does.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { decodeName } from "../src/entry-collector";
import { SkillTreeError } from "../src/errors";
import { tarEntryKind } from "../src/tar-reader";
import { headerMode } from "../src/tree";
import type { EntryKind, TreeEntry } from "../src/tree";

export function fixtureBytes(relative: string): Buffer {
  return readFileSync(fileURLToPath(new URL(`../fixtures/${relative}`, import.meta.url)));
}

export function sha256(data: Uint8Array | string): string {
  return createHash("sha256").update(data).digest("hex");
}

/** The contract code `run` fails with, or null when it succeeds. Other errors propagate. */
export async function errorCodeOf(run: () => unknown): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (err) {
    if (err instanceof SkillTreeError) return err.code;
    throw err;
  }
}

export interface VectorFile {
  path?: string;
  rawPathBase64?: string;
  mode?: string;
  headerMode?: string;
  type?: string;
  paxRecords?: Record<string, string>;
  content?: string;
  contentBase64?: string;
}

export interface VectorSynth {
  pathPattern: string;
  count: number;
  size: number;
  fill: number;
  mode?: string;
  type?: string;
}

export interface TreeVector {
  id: string;
  description: string;
  files?: VectorFile[];
  synthesize?: VectorSynth[];
  archiveOnly?: boolean;
  expect: { digest?: string; serialization?: string; error?: string };
}

export interface TreeVectorFile {
  schema: string;
  contract: string;
  spec: string;
  unicode: string;
  notes: string[];
  vectors: TreeVector[];
}

export function loadTreeVectors(): TreeVectorFile {
  return JSON.parse(fixtureBytes("vectors/skill-tree-v1-vectors.json").toString("utf8")) as TreeVectorFile;
}

/** Entry types as the AgentKit harness maps them; walker-only types read as files or specials. */
const VECTOR_KINDS: Record<string, EntryKind> = {
  "": "regular",
  file: "regular",
  "fs-hardlink": "regular",
  "reparse-other": "regular",
  symlink: "symlink",
  "reparse-name-surrogate": "symlink",
  "archive-hardlink": "hardlink",
  "reparse-af-unix": "special",
  "reparse-wsl": "special",
  device: "special",
  fifo: "special",
  socket: "special",
  directory: "directory",
  "pax-global": "metadata",
  cont: "special",
};

export function vectorKind(type: string | undefined, path: string): EntryKind {
  if (type === "tar-nul") return tarEntryKind("\0", path);
  const kind = VECTOR_KINDS[type ?? ""];
  if (kind === undefined) throw new Error(`vector entry ${path} has unknown type ${type}`);
  return kind;
}

export function rawName(f: VectorFile): Uint8Array {
  if (f.rawPathBase64 === undefined) return new TextEncoder().encode(f.path ?? "");
  if ((f.path ?? "") !== "") throw new Error(`vector entry ${f.path} sets both path and rawPathBase64`);
  return Buffer.from(f.rawPathBase64, "base64");
}

export function fileBytes(f: VectorFile): Uint8Array {
  if (f.contentBase64 !== undefined) return Buffer.from(f.contentBase64, "base64");
  if (f.content !== undefined) return new TextEncoder().encode(f.content);
  throw new Error(`vector file ${f.path} has no content`);
}

/** The entry mode: a mode string as given, or a header mode in octal mapped to its class. */
export function vectorMode(f: VectorFile): string {
  if (f.headerMode === undefined) return f.mode ?? "";
  if ((f.mode ?? "") !== "") throw new Error(`vector entry ${f.path} sets both mode and headerMode`);
  return headerMode(parseInt(f.headerMode, 8));
}

export function synthPath(s: VectorSynth, n: number): string {
  return s.pathPattern.replaceAll("{n}", String(n).padStart(5, "0"));
}

const fillDigests = new Map<string, string>();

/** sha256 of `size` bytes of value `fill`, without holding them in memory. */
export function fillDigest(size: number, fill: number): string {
  const key = `${size}/${fill}`;
  const cached = fillDigests.get(key);
  if (cached !== undefined) return cached;
  const hash = createHash("sha256");
  const block = Buffer.alloc(64 * 1024, fill);
  for (let left = size; left > 0; left -= block.length) hash.update(block.subarray(0, Math.min(left, block.length)));
  const digest = hash.digest("hex");
  fillDigests.set(key, digest);
  return digest;
}

export function vectorEntries(v: TreeVector): TreeEntry[] {
  const entries: TreeEntry[] = [];
  for (const f of v.files ?? []) {
    const name = decodeName(rawName(f));
    const data = fileBytes(f);
    entries.push({
      path: name.path,
      utf8Valid: name.utf8Valid,
      mode: vectorMode(f),
      size: data.length,
      sha256: sha256(data),
      kind: vectorKind(f.type, name.path),
      ...(f.paxRecords === undefined ? {} : { paxRecords: f.paxRecords }),
    });
  }
  for (const s of v.synthesize ?? []) {
    const kind = vectorKind(s.type, s.pathPattern);
    const digest = fillDigest(s.size, s.fill);
    for (let n = 0; n < s.count; n++) {
      entries.push({ path: synthPath(s, n), mode: s.mode ?? "100644", size: s.size, sha256: digest, kind });
    }
  }
  return entries;
}
