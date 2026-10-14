/**
 * Deterministic three-way line merge (diff3) of base `O`, ours `A` (the
 * user's composition) and theirs `B` (the new upstream). Changes of one side
 * only are taken. Changes of both sides that touch the same base region are
 * a conflict unless they are identical; regions that merely touch (one ends
 * where the other starts, or two insertions at one point) also conflict, so
 * adjacency fails closed.
 */
import { diffLines, splitLines } from "./line-diff";
import type { DiffHunk } from "./line-diff";

export interface MergeConflictHunk {
  /** Base lines [baseStart, baseEnd), 0-based. */
  baseStart: number;
  baseEnd: number;
  base: string[];
  ours: string[];
  theirs: string[];
}

export type MergeResult = { clean: true; text: string } | { clean: false; conflicts: MergeConflictHunk[] };

interface SidedHunk extends DiffHunk {
  side: "ours" | "theirs";
}

const sameChange = (x: SidedHunk[], y: SidedHunk[], a: string[], b: string[]) =>
  x.length === y.length &&
  x.every((h, i) => {
    const o = y[i]!;
    return h.oldStart === o.oldStart && h.oldEnd === o.oldEnd && a.slice(h.newStart, h.newEnd).join("") === b.slice(o.newStart, o.newEnd).join("");
  });

/** New-side lines that replace base [start, end) when one side's hunks are applied inside it. */
function sideText(hunks: SidedHunk[], lines: string[], base: string[], start: number, end: number): string[] {
  const out: string[] = [];
  let x = start;
  for (const h of hunks) {
    out.push(...base.slice(x, h.oldStart), ...lines.slice(h.newStart, h.newEnd));
    x = h.oldEnd;
  }
  out.push(...base.slice(x, end));
  return out;
}

export function mergeThreeWay(baseText: string, oursText: string, theirsText: string): MergeResult {
  const o = splitLines(baseText);
  const a = splitLines(oursText);
  const b = splitLines(theirsText);
  const hunks: SidedHunk[] = [
    ...diffLines(o, a).map((h) => ({ ...h, side: "ours" as const })),
    ...diffLines(o, b).map((h) => ({ ...h, side: "theirs" as const })),
  ].sort((x, y) => x.oldStart - y.oldStart || x.oldEnd - y.oldEnd || (x.side === y.side ? 0 : x.side === "ours" ? -1 : 1));

  const out: string[] = [];
  const conflicts: MergeConflictHunk[] = [];
  let cursor = 0;
  let i = 0;
  while (i < hunks.length) {
    const group = [hunks[i]!];
    let end = hunks[i]!.oldEnd;
    // Grouping uses `<=`: touching regions join one group (fail closed on adjacency).
    while (i + 1 < hunks.length && hunks[i + 1]!.oldStart <= end) {
      group.push(hunks[++i]!);
      end = Math.max(end, hunks[i]!.oldEnd);
    }
    i++;
    const start = group[0]!.oldStart;
    const ours = group.filter((h) => h.side === "ours");
    const theirs = group.filter((h) => h.side === "theirs");
    out.push(...o.slice(cursor, start));
    cursor = end;
    if (theirs.length === 0) out.push(...sideText(ours, a, o, start, end));
    else if (ours.length === 0) out.push(...sideText(theirs, b, o, start, end));
    else if (sameChange(ours, theirs, a, b)) out.push(...sideText(ours, a, o, start, end));
    else {
      conflicts.push({
        baseStart: start,
        baseEnd: end,
        base: o.slice(start, end),
        ours: sideText(ours, a, o, start, end),
        theirs: sideText(theirs, b, o, start, end),
      });
    }
  }
  out.push(...o.slice(cursor));
  return conflicts.length === 0 ? { clean: true, text: out.join("") } : { clean: false, conflicts };
}
