/**
 * Text detectors for session-derived content. Every absolute local path is
 * refused, in plain, JSON-escaped (`\/`, `\\`) and percent-encoded (`%2F`,
 * `%5C`, `%3A`) form, case-insensitively: a drive-letter path, a UNC share
 * (`\\host\share` or `//host/share`), a `file:` or `smb:` URL, a bare user,
 * temp, mount or volume root (`/home`, `/Users`, `/tmp`, ...) and any POSIX
 * path of two or more segments. Only well-known system paths stay allowed:
 * `/usr/`, `/bin/`, `/sbin/`, `/etc/`, `/proc/` and `/dev/null`, `/dev/stdin`,
 * `/dev/stdout`, `/dev/stderr`. Web URLs (`https://host/path`) are not paths.
 * Generic credentials (password assignments, also a YAML `password:` key
 * whose value sits on the next lines, Bearer tokens, URLs with `user:pass@`,
 * JWTs, private key blocks and dotenv-style secret keys) complement the
 * vendor token rules of the release scanner. Detectors return rule names
 * only, never the matched text.
 */

/** Not part of a path or word: what may precede an absolute path. */
const START = String.raw`(?<![A-Za-z0-9._~+-])`;
/** Any run of path separators, including JSON-escaped ones (`\\`, `\/`). */
const SEP = String.raw`[\\/]+`;
/** A run of forward slashes, each optionally JSON-escaped (`/`, `\/`). */
const SLASHES = String.raw`(?:\\*/)+`;
/** One POSIX path segment; it starts with a letter (or `.`, `_`, `~`, `$`, `@`) so dates and ratios are not paths. */
const SEGMENT = String.raw`[A-Za-z._~$@][A-Za-z0-9._~+@$%-]*`;

const LOCAL_PATHS: ReadonlyArray<RegExp> = [
  // Drive letter: C:\, C:/, C:\\ (JSON-escaped), with or without a following segment.
  new RegExp(String.raw`${START}[A-Za-z]:${SEP}`),
  // UNC share (\\host\share), also escaped (\\\\host\\share).
  new RegExp(String.raw`(?<![A-Za-z0-9._-])\\{2,}[A-Za-z0-9._$-]{2,}\\+[A-Za-z0-9._$-]`),
  // Any file: or smb: URL (file:///home/..., file://host/share, smb://host/share).
  /\b(?:file|smb):[\\/]/i,
  // A bare user, temp, mount or volume root, after any non-path character (also `\/home`).
  new RegExp(String.raw`${START}${SEP}(?:home|Users|root|mnt|media|Volumes|var${SEP}folders|tmp|private|run${SEP}user)(?![A-Za-z0-9_-])`, "i"),
];

/** A POSIX path of two or more segments (also `//host/share`); groups: first segment, second segment. */
const POSIX_PATH = new RegExp(String.raw`${START}${SLASHES}(${SEGMENT})${SLASHES}(${SEGMENT})?`, "gi");
const SYSTEM_ROOTS = new Set(["usr", "bin", "sbin", "etc", "proc"]);
const SYSTEM_DEVICES = new Set(["null", "stdin", "stdout", "stderr"]);
/** A web URL (`scheme://...`); its path is not a local path. `file:` and `smb:` are refused before this runs. */
const WEB_URL = /\b[a-z][a-z0-9+.-]*:(?:\\*\/){2,}[^\s"'<>`]*/gi;

/** Decodes percent-encoded separators and colons (also double-encoded, `%252F`). */
function decodeSeparators(text: string): string {
  let out = text;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/%25(2f|5c|3a)/gi, "%$1").replace(/%2f/gi, "/").replace(/%5c/gi, "\\").replace(/%3a/gi, ":");
    if (next === out) break;
    out = next;
  }
  return out;
}

function allowedSystemPath(path: string, first: string, second: string | undefined, after: string): boolean {
  const root = first.toLowerCase();
  // `/usr/bin/../../home/...` climbs out of the system root.
  const whole = path + /^[A-Za-z0-9._~+@$%\\/-]*/.exec(after)![0];
  if (/(?:^|[\\/])\.\.(?:[\\/]|$)/.test(whole)) return false;
  if (SYSTEM_ROOTS.has(root)) return true;
  // `/dev/null` and the standard streams, but not a path below them.
  return root === "dev" && second !== undefined && SYSTEM_DEVICES.has(second.toLowerCase()) && !/^\\*\//.test(after);
}

/** True when `text` names an absolute local path. */
export function hasLocalPath(text: string): boolean {
  const decoded = decodeSeparators(text);
  if (LOCAL_PATHS.some((re) => re.test(decoded))) return true;
  const withoutUrls = decoded.replace(WEB_URL, " ");
  for (const m of withoutUrls.matchAll(POSIX_PATH)) {
    if (!allowedSystemPath(m[0], m[1]!, m[2], withoutUrls.slice(m.index! + m[0].length))) return true;
  }
  return false;
}

const SECRET_KEY = "[A-Za-z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|PWD|API_?KEY|ACCESS_?KEY|PRIVATE_?KEY|CLIENT_?SECRET|CREDENTIALS?)[A-Za-z0-9_]*";
/** A value that is not an obvious placeholder (`<...>`, `${...}`, `$VAR`, `%VAR%`, `***`). */
const VALUE = String.raw`["']?(?![<$%{*])[^\s"'<>]`;

const GENERIC_SECRETS: ReadonlyArray<[rule: string, re: RegExp]> = [
  ["secret-password", new RegExp(String.raw`(?<![A-Za-z0-9])(?:password|passwd|passphrase|pwd)["']?\s*[:=]\s*${VALUE}{4,}`, "i")],
  ["secret-bearer", /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/i],
  ["secret-url-credentials", /\b[a-z][a-z0-9+.-]*:\/\/[^\s/?#:@]+:[^\s/?#@]+@/i],
  ["secret-jwt", /\beyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/],
  ["secret-private-key", /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/],
  ["secret-dotenv", new RegExp(String.raw`(?:^|\n)[ \t]*(?:export[ \t]+)?${SECRET_KEY}[ \t]*=[ \t]*${VALUE}{8,}`)],
];

/** Generic credential rules matched by `text`, sorted. */
export function genericSecrets(text: string): string[] {
  return GENERIC_SECRETS.filter(([, re]) => re.test(text)).map(([rule]) => rule).sort();
}

/**
 * A YAML password key whose value sits on the following, more indented lines
 * (a plain indented block or a `|` / `>` block scalar). Group 2 is the block.
 */
const YAML_PASSWORD_BLOCK = new RegExp(
  String.raw`(?:^|\n)([ \t]*)[A-Za-z0-9_-]*(?:password|passwd|passphrase|pwd)["']?[ \t]*:[ \t]*(?:[|>][-+0-9]*[ \t]*)?(?:#[^\n]*)?\n((?:[ \t]*\n)*\1[ \t]+\S[^\n]*(?:\n\1[ \t]+[^\n]*|\n[ \t]*(?=\n))*)`,
  "gi",
);
/** An obvious placeholder value (`<...>`, `${...}`, `$VAR`, `%VAR%`, `***`), optionally quoted. */
const PLACEHOLDER = /^["']?[<$%{*]/;

/**
 * True when `after` holds a YAML password block that `before` does not: the
 * line-based diff alone would miss a new value under a key the base already has.
 */
export function hasMultilinePassword(before: string | null, after: string): boolean {
  for (const m of after.matchAll(YAML_PASSWORD_BLOCK)) {
    const value = m[2]!.trim();
    if (value.length < 4 || PLACEHOLDER.test(value)) continue;
    if (before === null || !before.includes(m[0].replace(/^\n/, ""))) return true;
  }
  return false;
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
