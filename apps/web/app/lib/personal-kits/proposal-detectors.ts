/**
 * Text detectors for session-derived content. Every absolute machine-local
 * path is refused, in plain, JSON-escaped and URL form: a drive-letter path,
 * a UNC share, a `file:` URL, and POSIX paths under the user, temp, mount and
 * volume roots (`/home`, `/Users`, `/root`, `/mnt`, `/media`, `/Volumes`,
 * `/var/folders`, `/tmp`, `/private`, `/run/user`). System paths such as
 * `/usr/bin/env` stay allowed. Generic credentials (password assignments,
 * Bearer tokens, URLs with `user:pass@`, JWTs, private key blocks and
 * dotenv-style secret keys) complement the vendor token rules of the release
 * scanner. Detectors return rule names only, never the matched text.
 */

/** Not part of a path or word: what may precede an absolute path. */
const START = String.raw`(?<![A-Za-z0-9._~+-])`;
/** Any run of path separators, including JSON-escaped ones (`\\`, `\/`). */
const SEP = String.raw`[\\/]+`;

const LOCAL_PATHS: ReadonlyArray<RegExp> = [
  // Drive letter: C:\, C:/, C:\\ (JSON-escaped), with or without a following segment.
  new RegExp(String.raw`${START}[A-Za-z]:${SEP}`),
  // UNC share (\\host\share), also escaped (\\\\host\\share).
  new RegExp(String.raw`(?<![A-Za-z0-9._-])\\{2,}[A-Za-z0-9._$-]{2,}\\+[A-Za-z0-9._$-]`),
  // Any file: URL (file:///home/..., file://host/share, file:/C:/...).
  /\bfile:[\\/]/i,
  // POSIX user, temp, mount and volume roots, after any non-path character (also `\/home\/...`).
  new RegExp(String.raw`(?<![A-Za-z0-9._~+-])${SEP}(?:home|Users|root|mnt|media|Volumes|var${SEP}folders|tmp|private|run${SEP}user)(?![A-Za-z0-9_-])`),
];

/** True when `text` names an absolute path on someone's machine. */
export const hasLocalPath = (text: string) => LOCAL_PATHS.some((re) => re.test(text));

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
