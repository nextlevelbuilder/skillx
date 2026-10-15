/**
 * Text detectors for session-derived content. Absolute local paths are
 * refused by `proposal-path-detector`. Generic credentials complement the
 * vendor token rules of the release scanner:
 * - a `key: value`, `key = value` or `"key": "value"` assignment (YAML, JSON,
 *   code, `.env`) whose key names a password or a secret (`dbPassword`,
 *   `client_secret`, `apiKey`, `GITHUB_TOKEN`), compared through the shared
 *   key normalization of `@skillx/contracts`, so content rules and envelope
 *   keys agree; a YAML password key whose value sits on the following lines;
 * - Bearer tokens, URLs with `user:pass@`, JWTs and private key blocks.
 * Detectors return rule names only, never the matched text. Every pattern
 * runs in time linear in the text (bounded keys and scheme names, one start
 * per token or line), so hostile input cannot exhaust the Worker CPU. The
 * shared vectors are in `@skillx/contracts` (`kit-proposal-policy-vectors-v1.json`).
 */
import { secretKeyKind } from "@skillx/contracts";

export { hasLocalPath } from "./proposal-path-detector";

/**
 * An obvious placeholder value: `<...>`, `%VAR%`, `{...}`, `***`, `${...}` or
 * a whole `$VAR`. Any other value, also one that starts with `$`, is real.
 */
const PLACEHOLDER = String.raw`(?:[<%{*]|\$\{|\$[A-Z_][A-Z0-9_]*(?![^\s"'<>]))`;
/** Up to two YAML anchors or tags before the value (`&a`, `!secret`, `&a !s`). */
const ANCHOR = String.raw`(?:[&!][^\s"'<>]{0,64}[ \t]+){0,2}`;
/** The same before a block value, where an anchor or tag may end the key line. */
const BLOCK_ANCHOR = String.raw`(?:[&!][^\s"'<>]{0,64}[ \t]*){0,2}`;
/**
 * `key <sep> value` on one line (`:`, `=`, `:=`, `=>`): a key of at most 128
 * characters, optionally quoted or in brackets (`cfg["password"]`), at a key
 * boundary (also after `--` of a flag); group 1 is the key, 2 the separator,
 * 3 the value. The value (at most 256 characters) is read in a lookahead, so
 * the scan resumes right after the separator and finds a key inside a value
 * (`Server=db;Password=...`, `?user=a&password=...`), and each start reads a
 * bounded window. A key past the 64-character policy limit counts as a secret key.
 */
const ASSIGNMENT = new RegExp(
  String.raw`(?<![A-Za-z0-9_.])["']?([A-Za-z_][A-Za-z0-9_.-]{0,127})["']?\]?[ \t]*(:=|=>|[:=])[ \t]*${ANCHOR}["']?(?=(?!${PLACEHOLDER})([^\s"'<>]{1,256}))`,
  "g",
);
/** A `KEY=value` (or `export KEY=value`) line start before the key at the end of this window. */
const DOTENV_START = /(?:^|\n)[ \t]*(?:export[ \t]+)?["']?$/;
const MIN_PASSWORD = 4;
const MIN_SECRET = 8;

const LINE_RULES: ReadonlyArray<[rule: string, re: RegExp]> = [
  ["secret-bearer", /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/i],
  ["secret-url-credentials", /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/?#:@]+:[^\s/?#@]+@/i],
  ["secret-private-key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
];

/**
 * A JWT: `eyJ` at a word boundary, at least four base64url characters, a
 * dot, `eyJ` and four more, and another dot. Checked per token and part so
 * a long run of `eyJ-eyJ-...` is read once.
 */
function hasJwt(text: string): boolean {
  for (const [token] of text.matchAll(/[A-Za-z0-9_.-]+/g)) {
    if (!token.includes("eyJ")) continue;
    const parts = token.split(".");
    for (let i = 0; i + 2 < parts.length; i++) {
      const start = /(?:^|-)eyJ/.exec(parts[i]!);
      const head = start === null ? -1 : start.index + start[0].length;
      if (head >= 0 && parts[i]!.length - head >= 4 && parts[i + 1]!.startsWith("eyJ") && parts[i + 1]!.length >= 7) return true;
    }
  }
  return false;
}

/**
 * Rules of the assignments in `text`: `secret-password` for a password key
 * (value of 4 or more characters); for other keys, values of 8 or more
 * characters, `secret-dotenv` on a `KEY=value` line whose key holds a
 * password or secret stem anywhere, `secret-assignment` for any other
 * assignment to a secret key.
 */
function assignmentRules(text: string, rules: Set<string>): void {
  for (const m of text.matchAll(ASSIGNMENT)) {
    const [, key, sep, value] = m as unknown as [string, string, string, string];
    if (/^[0-9.]+$/.test(value)) continue;
    const kind = secretKeyKind(key);
    if (kind === "password") {
      if (value.length >= MIN_PASSWORD) rules.add("secret-password");
      continue;
    }
    if (value.length < MIN_SECRET) continue;
    const dotenv = sep === "=" && DOTENV_START.test(text.slice(Math.max(0, m.index! - 80), m.index!));
    if (dotenv && secretKeyKind(key, true) !== null) rules.add("secret-dotenv");
    else if (kind === "secret") rules.add("secret-assignment");
  }
}

/** Generic credential rules matched by `text`, sorted. */
export function genericSecrets(text: string): string[] {
  const rules = new Set(LINE_RULES.filter(([, re]) => re.test(text)).map(([rule]) => rule));
  if (hasJwt(text)) rules.add("secret-jwt");
  assignmentRules(text, rules);
  return [...rules].sort();
}

/**
 * A YAML password key (also a list item `- password:` or a quoted key
 * `"password":`) whose value sits on the following, more indented lines (a
 * plain indented block or a `|` / `>` block scalar). Group 2 is the block.
 */
const YAML_PASSWORD_BLOCK = new RegExp(
  String.raw`(?:^|\n)([ \t]*)(?:-[ \t]+)*["']?[A-Za-z0-9_-]*(?:password|passwd|passphrase|pwd)["']?[ \t]*:[ \t]*${BLOCK_ANCHOR}(?:[|>][-+0-9]*[ \t]*)?(?:#[^\n]*)?\n((?:[ \t]*\n)*\1[ \t]+\S[^\n]*(?:\n\1[ \t]+[^\n]*|\n[ \t]*(?=\n))*)`,
  "gi",
);
const BLOCK_PLACEHOLDER = new RegExp(String.raw`^["']?${PLACEHOLDER}`);

/** The password blocks of `text` that hold a real value. */
function passwordBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const m of text.matchAll(YAML_PASSWORD_BLOCK)) {
    const value = m[2]!.trim();
    if (value.length >= MIN_PASSWORD && !BLOCK_PLACEHOLDER.test(value)) blocks.push(m[0].replace(/^\n/, ""));
  }
  return blocks;
}

/**
 * True when `after` holds a YAML password block that `before` does not: the
 * line-based diff alone would miss a new value under a key the base already has.
 */
export function hasMultilinePassword(before: string | null, after: string): boolean {
  const kept = new Set(before === null ? [] : passwordBlocks(before));
  return passwordBlocks(after).some((block) => !kept.has(block));
}

/** True for bytes that open with a UTF-8, UTF-16 or UTF-32 byte order mark. */
export function hasByteOrderMark(bytes: Uint8Array): boolean {
  const [a, b, c] = bytes;
  return (a === 0xef && b === 0xbb && c === 0xbf) || (a === 0xff && b === 0xfe) || (a === 0xfe && b === 0xff) || (a === 0 && b === 0);
}

/**
 * The lines of `after` that `before` does not have (multiset difference, in
 * order): what a change introduces. Lines it keeps from the base are not
 * the proposal's content, so findings already in the base never refuse it.
 */
export function addedLines(before: string | null, after: string): string {
  if (before === null) return after;
  const kept = new Map<string, number>();
  for (const line of before.split("\n")) kept.set(line, (kept.get(line) ?? 0) + 1);
  const added: string[] = [];
  for (const line of after.split("\n")) {
    const n = kept.get(line) ?? 0;
    if (n > 0) kept.set(line, n - 1);
    else added.push(line);
  }
  return added.join("\n");
}
