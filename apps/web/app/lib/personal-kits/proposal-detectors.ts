/**
 * Text detectors for session-derived content. Absolute local paths are
 * refused by `proposal-path-detector`. Generic credentials (password
 * assignments, also a YAML `password:` key, list item or quoted key whose
 * value sits on the next lines, Bearer tokens, URLs with `user:pass@`, JWTs,
 * private key blocks and dotenv-style secret keys) complement the vendor
 * token rules of the release scanner. Detectors return rule names only,
 * never the matched text. Every pattern runs in time linear in the text
 * (bounded scheme names, one start per token or line), so hostile input
 * cannot exhaust the Worker CPU. The shared vectors are in
 * `@skillx/contracts` (`kit-proposal-policy-vectors-v1.json`).
 */
export { hasLocalPath } from "./proposal-path-detector";

const SECRET_KEY = /SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CLIENT_?SECRET|CREDENTIALS?/;
/** A value that is not an obvious placeholder (`<...>`, `${...}`, `$VAR`, `%VAR%`, `***`). */
const VALUE = String.raw`["']?(?![<$%{*])[^\s"'<>]`;
/** `KEY=value` at the start of a line; the key is tested against `SECRET_KEY` on its own. */
const DOTENV_LINE = new RegExp(String.raw`(?:^|\n)[ \t]*(?:export[ \t]+)?([A-Za-z0-9_]+)[ \t]*=[ \t]*${VALUE}{8,}`, "g");

const LINE_RULES: ReadonlyArray<[rule: string, re: RegExp]> = [
  ["secret-password", new RegExp(String.raw`(?<![A-Za-z0-9])(?:password|passwd|passphrase|pwd)["']?\s*[:=]\s*${VALUE}{4,}`, "i")],
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

function hasDotenvSecret(text: string): boolean {
  for (const m of text.matchAll(DOTENV_LINE)) if (SECRET_KEY.test(m[1]!)) return true;
  return false;
}

/** Generic credential rules matched by `text`, sorted. */
export function genericSecrets(text: string): string[] {
  const rules = LINE_RULES.filter(([, re]) => re.test(text)).map(([rule]) => rule);
  if (hasJwt(text)) rules.push("secret-jwt");
  if (hasDotenvSecret(text)) rules.push("secret-dotenv");
  return rules.sort();
}

/**
 * A YAML password key (also a list item `- password:` or a quoted key
 * `"password":`) whose value sits on the following, more indented lines (a
 * plain indented block or a `|` / `>` block scalar). Group 2 is the block.
 */
const YAML_PASSWORD_BLOCK = new RegExp(
  String.raw`(?:^|\n)([ \t]*)(?:-[ \t]+)*["']?[A-Za-z0-9_-]*(?:password|passwd|passphrase|pwd)["']?[ \t]*:[ \t]*(?:[|>][-+0-9]*[ \t]*)?(?:#[^\n]*)?\n((?:[ \t]*\n)*\1[ \t]+\S[^\n]*(?:\n\1[ \t]+[^\n]*|\n[ \t]*(?=\n))*)`,
  "gi",
);
/** An obvious placeholder value (`<...>`, `${...}`, `$VAR`, `%VAR%`, `***`), optionally quoted. */
const PLACEHOLDER = /^["']?[<$%{*]/;

/** The password blocks of `text` that hold a real value. */
function passwordBlocks(text: string): string[] {
  const blocks: string[] = [];
  for (const m of text.matchAll(YAML_PASSWORD_BLOCK)) {
    const value = m[2]!.trim();
    if (value.length >= 4 && !PLACEHOLDER.test(value)) blocks.push(m[0].replace(/^\n/, ""));
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
