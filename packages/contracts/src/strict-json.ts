/**
 * Strict parsing for human-authored JSON documents such as the exec manifest.
 *
 * `JSON.parse` silently keeps the last of two duplicate object members, and
 * parsers in other languages disagree on which one wins. A document whose
 * meaning depends on the parser is rejected instead: any duplicate member,
 * a BOM or invalid UTF-8 fails. Whitespace and member order stay free.
 */

export type StrictJsonResult = { ok: true; value: unknown } | { ok: false; reason: string };

interface Frame {
  object: boolean;
  keys: Set<string>;
  expectKey: boolean;
}

/** Returns the dot path of the first duplicate member, or null. `text` must already be valid JSON. */
function findDuplicateMember(text: string): string | null {
  const stack: Frame[] = [];
  const path: string[] = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      let end = i + 1;
      while (text[end] !== '"') end += text[end] === "\\" ? 2 : 1;
      const top = stack[stack.length - 1];
      if (top?.object && top.expectKey) {
        const key = JSON.parse(text.slice(i, end + 1)) as string;
        if (top.keys.has(key)) return [...path.slice(0, stack.length - 1), key].join(".");
        top.keys.add(key);
        top.expectKey = false;
        path[stack.length - 1] = key;
      }
      i = end;
    } else if (ch === "{" || ch === "[") {
      stack.push({ object: ch === "{", keys: new Set(), expectKey: ch === "{" });
      path[stack.length - 1] = ch === "[" ? "[]" : "";
    } else if (ch === "}" || ch === "]") {
      stack.pop();
      path.length = stack.length;
    } else if (ch === ",") {
      const top = stack[stack.length - 1];
      if (top?.object) top.expectKey = true;
    }
  }
  return null;
}

/** Parses UTF-8 (or string) JSON, rejecting a BOM, invalid UTF-8 and duplicate members. Never throws. */
export function parseStrictJson(input: string | Uint8Array): StrictJsonResult {
  let text: string;
  if (typeof input === "string") {
    text = input;
  } else {
    try {
      text = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(input);
    } catch {
      return { ok: false, reason: "is not valid UTF-8" };
    }
  }
  if (text.charCodeAt(0) === 0xfeff) return { ok: false, reason: "starts with a byte order mark" };
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return { ok: false, reason: "is not JSON" };
  }
  const duplicate = findDuplicateMember(text);
  if (duplicate !== null) return { ok: false, reason: `repeats the member ${duplicate}` };
  return { ok: true, value };
}
