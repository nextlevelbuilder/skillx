/**
 * Deterministic line diff (Myers O(ND), greedy forward pass, backtracked
 * through the stored V vectors). Pinned behaviour, because a merge result
 * depends on how an ambiguous edit is aligned:
 *
 * - lines are compared as exact strings that include their line ending, so
 *   `a\n` and `a\r\n` differ ("line endings are bytes");
 * - the common prefix and suffix are matched first;
 * - on a tie the forward pass takes the deletion (move right) unless the
 *   insertion path reaches strictly further, so within one hunk deletions
 *   precede insertions;
 * - an edit distance above `MAX_EDIT_DISTANCE` is refused rather than
 *   approximated (the caller fails closed).
 */
import { KIT_CODES, kitError } from "./codes";

export interface DiffHunk {
  /** Old lines [oldStart, oldEnd) are replaced by new lines [newStart, newEnd). */
  oldStart: number;
  oldEnd: number;
  newStart: number;
  newEnd: number;
}

/** AgentKit `MaxEditDistance`; changing it changes merge results (a contract change). */
export const MAX_EDIT_DISTANCE = 1_000;

/** Splits text into lines that keep their `\n` ending; the last line may have none. */
export function splitLines(text: string): string[] {
  return text.match(/[^\n]*\n|[^\n]+$/g) ?? [];
}

type Edit = "=" | "-" | "+";

function myers(a: readonly string[], b: readonly string[]): Edit[] {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= max; d++) {
    if (d > MAX_EDIT_DISTANCE) throw kitError(KIT_CODES.overlayConflict, "", `diff_limit: the diff needs more than ${MAX_EDIT_DISTANCE} line edits`);
    trace.push(v.slice(offset - d - 1, offset + d + 2));
    for (let k = -d; k <= d; k += 2) {
      const down = k === -d || (k !== d && v[offset + k - 1]! < v[offset + k + 1]!);
      let x = down ? v[offset + k + 1]! : v[offset + k - 1]! + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[offset + k] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m);
    }
  }
  return backtrack(trace, n, m);
}

function backtrack(trace: Int32Array[], n: number, m: number): Edit[] {
  const edits: Edit[] = [];
  let x = n;
  let y = m;
  for (let d = trace.length - 1; d > 0; d--) {
    const row = trace[d]!;
    const at = (k: number) => row[k + d + 1]!;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      edits.push("=");
      x--;
      y--;
    }
    edits.push(down ? "+" : "-");
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    edits.push("=");
    x--;
    y--;
  }
  return edits.reverse();
}

/** The hunks that turn `a` into `b`, in ascending order. */
export function diffLines(a: readonly string[], b: readonly string[]): DiffHunk[] {
  let pre = 0;
  while (pre < a.length && pre < b.length && a[pre] === b[pre]) pre++;
  let suf = 0;
  while (suf < a.length - pre && suf < b.length - pre && a[a.length - 1 - suf] === b[b.length - 1 - suf]) suf++;
  const edits = myers(a.slice(pre, a.length - suf), b.slice(pre, b.length - suf));
  const hunks: DiffHunk[] = [];
  let x = pre;
  let y = pre;
  let open: DiffHunk | null = null;
  for (const edit of edits) {
    if (edit === "=") {
      if (open !== null) hunks.push(open);
      open = null;
      x++;
      y++;
      continue;
    }
    open ??= { oldStart: x, oldEnd: x, newStart: y, newEnd: y };
    if (edit === "-") open.oldEnd = ++x;
    else open.newEnd = ++y;
  }
  if (open !== null) hunks.push(open);
  return hunks;
}
