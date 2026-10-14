/**
 * Conflict-safe foundation rebase of one overlay: user overlay `U0` on old
 * base `B0` is carried onto new base `B1`. Deterministic; it never picks a
 * side. Each op is classified with an AgentKit rebase category; any
 * non-`clean.*` finding makes the result `needs-review` with no candidate.
 * A clean result carries the candidate overlay (ops re-anchored on `B1`) and
 * its `compositionDigest`. An empty overlay is always clean and follows
 * upstream (composition == `B1`).
 */
import { KIT_CODES, PersonalKitError, isCleanCategory, kitError } from "./codes";
import { decodeBase64, encodeBase64, sha256Hex, textOf } from "./bytes";
import { applyOverlay } from "./apply-overlay";
import type { KitTree, KitTreeFile } from "./kit-tree";
import { emptyOverlay, sortOps } from "./overlay-envelope";
import type { OverlayOp, SkillOverlay } from "./overlay-envelope";
import { semanticFindings, sortFindings } from "./rebase-semantics";
import type { RebaseFinding } from "./rebase-semantics";
import { mergeThreeWay } from "./three-way-merge";
import { applyPatch, formatPatch } from "./unified-patch";

export type { RebaseFinding } from "./rebase-semantics";

export type RebaseResult =
  | { status: "clean"; findings: RebaseFinding[]; overlay: SkillOverlay; compositionDigest: string; tree: KitTree }
  | { status: "needs-review"; findings: RebaseFinding[] };

interface OpOutcome {
  op: OverlayOp | null;
  finding: RebaseFinding;
}

const keep = (op: OverlayOp, category: RebaseFinding["category"], detail: string): OpOutcome => ({ op, finding: { category, path: op.path, detail } });
const drop = (path: string, detail: string): OpOutcome => ({ op: null, finding: { category: "clean.disjoint", path, detail } });
const stop = (path: string, category: RebaseFinding["category"], detail: string): OpOutcome => ({ op: null, finding: { category, path, detail } });

async function rebasePatch(op: OverlayOp, b0: KitTree, b1: KitTree, f1: KitTreeFile): Promise<OpOutcome> {
  const base = textOf(await b0.read(op.path))!;
  const theirs = textOf(await b1.read(op.path));
  if (theirs === null) return stop(op.path, "conflict.same_hunk", "the new base made this file binary");
  const merged = mergeThreeWay(base, applyPatch(base, op.patch!, op.path), theirs);
  if (!merged.clean) return stop(op.path, "conflict.same_hunk", `${merged.conflicts.length} overlapping hunk(s)`);
  const patch = formatPatch(theirs, merged.text);
  if (patch === null) return drop(op.path, "upstream already contains the change");
  return keep({ op: "patch", path: op.path, expectSha256: f1.sha256, patch }, "clean.disjoint", "patch merged with upstream changes");
}

async function rebaseOp(op: OverlayOp, b0: KitTree, b1: KitTree, f0: KitTreeFile | undefined, f1: KitTreeFile | undefined): Promise<OpOutcome> {
  if (op.op === "add") {
    if (f1 === undefined) return keep(op, "clean.untouched", "path still absent upstream");
    const sha = await sha256Hex(decodeBase64(op.contentBase64!)!);
    if (sha === f1.sha256 && (op.mode ?? "100644") === f1.mode) return drop(op.path, "upstream added the same file");
    return stop(op.path, "conflict.added_both", "upstream added a different file at this path");
  }
  if (f1 === undefined) return stop(op.path, "conflict.renamed_or_deleted", "upstream removed or renamed this file");
  if (f0!.sha256 === f1.sha256) return keep(op, "clean.untouched", "upstream left this file unchanged");
  if (op.op === "delete") return stop(op.path, "conflict.same_hunk", "deleted here, modified upstream");
  if (op.op === "replace") {
    const sha = await sha256Hex(decodeBase64(op.contentBase64!)!);
    if (sha === f1.sha256 && (op.mode === undefined || op.mode === f1.mode)) return drop(op.path, "upstream now has the replacement");
    return stop(op.path, "conflict.same_hunk", "replaced here, modified upstream");
  }
  return rebasePatch(op, b0, b1, f1);
}

/** Rebases `u0` (anchored on `b0`) onto `b1`. */
export async function rebaseOverlay(b0: KitTree, b1: KitTree, u0: SkillOverlay): Promise<RebaseResult> {
  if (u0.baseTreeDigest !== b0.digest) throw kitError(KIT_CODES.overlayConflict, "", "base_mismatch: the overlay is not anchored on the old base");
  if (u0.ops.length === 0) {
    return { status: "clean", findings: [], overlay: emptyOverlay(b1.digest), compositionDigest: b1.digest, tree: b1 };
  }
  const old = new Map(b0.files.map((f) => [f.path, f]));
  const next = new Map(b1.files.map((f) => [f.path, f]));
  const outcomes: OpOutcome[] = [];
  for (const op of u0.ops) outcomes.push(await rebaseOp(op, b0, b1, old.get(op.path), next.get(op.path)));
  const findings = outcomes.map((o) => o.finding);
  if (findings.some((f) => !isCleanCategory(f.category))) return { status: "needs-review", findings: sortFindings(findings) };

  const overlay: SkillOverlay = { ...emptyOverlay(b1.digest), ops: sortOps(outcomes.flatMap((o) => (o.op === null ? [] : [o.op]))) };
  let tree: KitTree;
  try {
    tree = await applyOverlay(b1, overlay);
  } catch (error) {
    if (!(error instanceof PersonalKitError)) throw error;
    return { status: "needs-review", findings: sortFindings([...findings, { category: "conflict.added_both", path: error.path, detail: `candidate violates the tree contract (${error.code})` }]) };
  }
  const semantic = await semanticFindings(await applyOverlay(b0, u0), tree);
  const all = sortFindings([...findings, ...semantic]);
  if (semantic.length > 0) return { status: "needs-review", findings: all };
  return { status: "clean", findings: all, overlay, compositionDigest: tree.digest, tree };
}

/** Builds an overlay that turns `base` into exactly `target` (text files as patches, others replaced). */
export async function overlayBetween(base: KitTree, target: KitTree): Promise<SkillOverlay> {
  const old = new Map(base.files.map((f) => [f.path, f]));
  const ops: OverlayOp[] = [];
  for (const f of target.files) {
    const o = old.get(f.path);
    old.delete(f.path);
    if (o !== undefined && o.sha256 === f.sha256 && o.mode === f.mode) continue;
    const bytes = await target.read(f.path);
    if (o === undefined) {
      ops.push({ op: "add", path: f.path, contentBase64: encodeBase64(bytes), ...(f.mode === "100755" ? { mode: f.mode } : {}) });
      continue;
    }
    const before = textOf(await base.read(f.path));
    const after = textOf(bytes);
    const patch = before !== null && after !== null && o.mode === f.mode ? formatPatch(before, after) : null;
    if (patch !== null) ops.push({ op: "patch", path: f.path, expectSha256: o.sha256, patch });
    else ops.push({ op: "replace", path: f.path, expectSha256: o.sha256, contentBase64: encodeBase64(bytes), ...(f.mode !== o.mode ? { mode: f.mode } : {}) });
  }
  for (const o of old.values()) ops.push({ op: "delete", path: o.path, expectSha256: o.sha256 });
  return { ...emptyOverlay(base.digest), ops: sortOps(ops) };
}

