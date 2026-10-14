/**
 * Exact overlay apply: `agentkit.skill-overlay/v1` ops on a base tree give
 * the composed tree and its `compositionDigest`. Pure apart from reading
 * base bytes; never mutates the base. `add` needs an absent path;
 * `replace`, `delete` and `patch` need `expectSha256` to equal the base
 * file's hash, else `overlay.conflict` (`base_mismatch`). A `patch` on a
 * binary (NUL or non-UTF-8) file is refused. The result must pass contract 4.
 */
import { compareUtf8, isNoisePath } from "@skillx/skill-tree/rules";
import { KIT_CODES, kitError } from "./codes";
import { decodeBase64, sha256Hex, textOf, utf8 } from "./bytes";
import { checkComposedFiles, kitTreeDigest } from "./kit-tree";
import type { KitTree, KitTreeFile } from "./kit-tree";
import type { OverlayOp, SkillOverlay } from "./overlay-envelope";
import { applyPatch } from "./unified-patch";

const conflict = (path: string, detail: string) => kitError(KIT_CODES.overlayConflict, path, detail);

async function nextBytes(base: KitTree, file: KitTreeFile | undefined, op: OverlayOp): Promise<Uint8Array | null> {
  const { path } = op;
  if (op.op === "add") {
    if (file !== undefined) throw conflict(path, "add_over_existing: the base already has this path");
    return decodeBase64(op.contentBase64!)!;
  }
  if (file === undefined) throw conflict(path, "base_mismatch: the base has no file at this path");
  if (file.sha256 !== op.expectSha256) throw conflict(path, "base_mismatch: expectSha256 differs from the base file");
  if (op.op === "delete") return null;
  if (op.op === "replace") return decodeBase64(op.contentBase64!)!;
  const text = textOf(await base.read(path));
  if (text === null) throw kitError(KIT_CODES.overlayInvalid, path, "binary_patch: a binary file can only be replaced");
  return utf8(applyPatch(text, op.patch!, path));
}

/** Applies `overlay` to `base`. `overlay` must already be validated (`validateOverlay`). */
export async function applyOverlay(base: KitTree, overlay: SkillOverlay): Promise<KitTree> {
  if (overlay.baseTreeDigest !== base.digest) throw conflict("", "base_mismatch: baseTreeDigest is not the digest of this base");
  if (overlay.ops.length === 0) return base;
  const files = new Map(base.files.map((f) => [f.path, f]));
  const produced = new Map<string, Uint8Array>();
  for (const op of overlay.ops) {
    if (isNoisePath(op.path)) throw kitError(KIT_CODES.overlayInvalid, op.path, "noise_path: the tree contract drops this path");
    const file = files.get(op.path);
    const bytes = await nextBytes(base, file, op);
    if (bytes === null) {
      files.delete(op.path);
      continue;
    }
    const mode = op.mode ?? (op.op === "add" ? "100644" : file!.mode);
    files.set(op.path, { path: op.path, mode, size: bytes.length, sha256: await sha256Hex(bytes) });
    produced.set(op.path, bytes);
  }
  const list = [...files.values()];
  checkComposedFiles(list);
  const digest = await kitTreeDigest(list);
  return {
    digest,
    files: list.sort((a, b) => compareUtf8(a.path, b.path)),
    read: async (path) => produced.get(path) ?? base.read(path),
    declaredScripts: base.declaredScripts,
  };
}

/** The `compositionDigest` of `overlay` on `base`. */
export async function compositionDigest(base: KitTree, overlay: SkillOverlay): Promise<string> {
  return (await applyOverlay(base, overlay)).digest;
}
