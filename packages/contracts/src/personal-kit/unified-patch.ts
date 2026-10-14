/**
 * Exact unified diffs (AgentKit skill lifecycle contract 8): context and
 * removed lines must match the base byte for byte at the stated position,
 * with no fuzz and no offset search; line endings are part of a line.
 *
 * Accepted text: an optional `--- `/`+++ ` header pair, then hunks
 * `@@ -a[,b] +c[,d] @@[ text]` whose bodies hold exactly the counted
 * ` `, `-` and `+` lines. `\ No newline at end of file` after a body line
 * means that line has no trailing `\n`. Hunks are ascending and disjoint,
 * and both start positions must agree with the lines before them.
 * `formatPatch` writes this form with 3 context lines and no header.
 */
import { KIT_CODES, kitError } from "./codes";
import { diffLines, splitLines } from "./line-diff";
import type { DiffHunk } from "./line-diff";

interface PatchHunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: Array<{ kind: " " | "-" | "+"; text: string }>;
}

const HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: [^\n]*)?\n$/;
const NO_NEWLINE = "\\ No newline at end of file";

const malformed = (path: string, detail: string) => kitError(KIT_CODES.overlayInvalid, path, `patch: ${detail}`);
const mismatch = (path: string, detail: string) => kitError(KIT_CODES.overlayConflict, path, `base_mismatch: ${detail}`);

function parsePatch(patch: string, path: string): PatchHunk[] {
  const lines = splitLines(patch);
  let i = 0;
  if (lines[0]?.startsWith("--- ")) {
    if (!lines[1]?.startsWith("+++ ")) throw malformed(path, "a --- header line must be followed by a +++ line");
    i = 2;
  }
  const hunks: PatchHunk[] = [];
  while (i < lines.length) {
    const head = HEADER.exec(lines[i]!);
    if (head === null) throw malformed(path, `line ${i + 1} is not a hunk header`);
    const hunk: PatchHunk = {
      oldStart: Number(head[1]),
      oldCount: head[2] === undefined ? 1 : Number(head[2]),
      newStart: Number(head[3]),
      newCount: head[4] === undefined ? 1 : Number(head[4]),
      lines: [],
    };
    i++;
    let oldSeen = 0;
    let newSeen = 0;
    while (oldSeen < hunk.oldCount || newSeen < hunk.newCount) {
      const line = lines[i];
      if (line === undefined) throw malformed(path, "a hunk ends before its counted lines");
      const kind = line[0];
      if (kind !== " " && kind !== "-" && kind !== "+") throw malformed(path, `line ${i + 1} is not a context, removed or added line`);
      if (kind !== "+") oldSeen++;
      if (kind !== "-") newSeen++;
      if (oldSeen > hunk.oldCount || newSeen > hunk.newCount) throw malformed(path, "a hunk holds more lines than its header counts");
      let text = line.slice(1);
      i++;
      if (lines[i] !== undefined && lines[i]!.replace(/\n$/, "") === NO_NEWLINE) {
        if (!text.endsWith("\n")) throw malformed(path, "a no-newline marker follows a line without a newline");
        text = text.slice(0, -1);
        i++;
      } else if (!text.endsWith("\n")) {
        throw malformed(path, "a body line has no newline and no no-newline marker");
      }
      hunk.lines.push({ kind, text });
    }
    hunks.push(hunk);
  }
  if (hunks.length === 0) throw malformed(path, "holds no hunk");
  return hunks;
}

/** Applies `patch` to `text` exactly. Throws `overlay.invalid` (malformed) or `overlay.conflict` (does not apply). */
export function applyPatch(text: string, patch: string, path = ""): string {
  const base = splitLines(text);
  const out: string[] = [];
  let cursor = 0;
  for (const hunk of parsePatch(patch, path)) {
    const start = hunk.oldCount === 0 ? hunk.oldStart : hunk.oldStart - 1;
    if (start < cursor || start > base.length) throw mismatch(path, `hunk at line ${hunk.oldStart} overlaps or is out of range`);
    const expectedNew = out.length + (start - cursor) + (hunk.newCount === 0 ? 0 : 1);
    if (hunk.newStart !== expectedNew) throw mismatch(path, `hunk new start ${hunk.newStart} disagrees with ${expectedNew}`);
    out.push(...base.slice(cursor, start));
    cursor = start;
    for (const line of hunk.lines) {
      if (line.kind !== "+") {
        if (base[cursor] !== line.text) throw mismatch(path, `line ${cursor + 1} differs from the patch`);
        cursor++;
      }
      if (line.kind !== "-") out.push(line.text);
    }
  }
  out.push(...base.slice(cursor));
  const result = out.join("");
  // A line without a newline may only end the file.
  out.slice(0, -1).forEach((line) => {
    if (!line.endsWith("\n")) throw mismatch(path, "the patch leaves a line without a newline before the end");
  });
  return result;
}

const CONTEXT = 3;

function bodyLine(prefix: string, text: string): string {
  return text.endsWith("\n") ? `${prefix}${text}` : `${prefix}${text}\n${NO_NEWLINE}\n`;
}

function header(oldStart: number, oldCount: number, newStart: number, newCount: number): string {
  const range = (start: number, count: number) => `${count === 0 ? start : start + 1},${count}`;
  return `@@ -${range(oldStart, oldCount)} +${range(newStart, newCount)} @@\n`;
}

/** The unified diff from `oldText` to `newText` (3 context lines), or null when they are equal. */
export function formatPatch(oldText: string, newText: string): string | null {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const hunks = diffLines(a, b);
  if (hunks.length === 0) return null;
  const groups: DiffHunk[][] = [];
  for (const h of hunks) {
    const last = groups[groups.length - 1];
    if (last !== undefined && h.oldStart - last[last.length - 1]!.oldEnd <= 2 * CONTEXT) last.push(h);
    else groups.push([h]);
  }
  let out = "";
  for (const group of groups) {
    const first = group[0]!;
    const final = group[group.length - 1]!;
    const oldStart = Math.max(0, first.oldStart - CONTEXT);
    const oldEnd = Math.min(a.length, final.oldEnd + CONTEXT);
    const newStart = first.newStart - (first.oldStart - oldStart);
    let body = "";
    let x = oldStart;
    for (const h of group) {
      for (; x < h.oldStart; x++) body += bodyLine(" ", a[x]!);
      for (let k = h.oldStart; k < h.oldEnd; k++) body += bodyLine("-", a[k]!);
      for (let k = h.newStart; k < h.newEnd; k++) body += bodyLine("+", b[k]!);
      x = h.oldEnd;
    }
    for (; x < oldEnd; x++) body += bodyLine(" ", a[x]!);
    const oldCount = oldEnd - oldStart;
    const newCount = oldCount + group.reduce((n, h) => n + (h.newEnd - h.newStart) - (h.oldEnd - h.oldStart), 0);
    out += header(oldStart, oldCount, newStart, newCount) + body;
  }
  return out;
}
