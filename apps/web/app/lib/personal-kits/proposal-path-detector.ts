/**
 * Absolute local path detector for session-derived content. Every absolute
 * local path is refused, in plain, JSON-escaped (`\/`, `\\`) and
 * percent-encoded (`%2F`, `%5C`, `%3A`) form, case-insensitively: a
 * drive-letter path, a UNC share (`\\host\share` or `//host/share`), a
 * `file:` or `smb:` URL, an editor link to a file (`vscode://file/...`), a
 * bare user, temp, mount or volume root (`/home`, `/Users`, `/tmp`, ...),
 * a path glued to a compiler flag (`-I/opt/x`) and any POSIX path of two or
 * more segments, in any script (`/Usuários/...`). Only well-known system
 * paths stay allowed: `/bin/`, `/sbin/`, `/etc/`, `/proc/`, the system
 * directories of `/usr/` and `/usr/local/` (not `/usr/home` or
 * `/usr/local/<org>`), and `/dev/null`, `/dev/stdin`, `/dev/stdout`,
 * `/dev/stderr`. URLs of network schemes (`https://host/path`) are not paths.
 *
 * Every pattern runs in time linear in the text: separator runs are
 * collapsed first, scheme names are bounded and each path run is read once,
 * so a long run of `/`, `\` or `a-a-a-...` cannot exhaust the Worker CPU.
 */
import { KIT_PROPOSAL_POLICY } from "@skillx/contracts";

/** Not part of a path or word: what may precede an absolute path. */
const START = String.raw`(?<![\p{L}\p{N}._~+-])`;
/** Any run of path separators, including JSON-escaped ones (`\\`, `\/`). */
const SEP = String.raw`[\\/]+`;
/** A run of forward slashes, each optionally JSON-escaped (`/`, `\/`). */
const SLASHES = String.raw`(?:\\*/)+`;
/** Characters of a POSIX path segment, in any script. */
const SEG_CHARS = String.raw`\p{L}\p{N}._~+@$%\-`;
/** One POSIX path segment; it starts with a letter (or `.`, `_`, `~`, `$`, `@`) so dates and ratios are not paths. */
const SEGMENT = String.raw`[\p{L}._~$@][${SEG_CHARS}]*`;
const HOST = String.raw`[\p{L}\p{N}._$-]`;

const LOCAL_PATHS: ReadonlyArray<RegExp> = [
  // Drive letter: C:\, C:/, C:\\ (JSON-escaped), with or without a following segment.
  new RegExp(String.raw`${START}[A-Za-z]:${SEP}`, "u"),
  // UNC share (\\host\share), also escaped (\\\\host\\share).
  new RegExp(String.raw`(?<![\p{L}\p{N}._-])\\{2,}${HOST}{2,}\\+${HOST}`, "u"),
  // Any file: or smb: URL (file:///home/..., file://host/share, smb://host/share).
  /\b(?:file|smb):[\\/]/i,
  // An editor or IDE link to a file: vscode://file/..., cursor://file/...
  /\b[a-z][a-z0-9+.-]{0,31}:(?:\\*\/){2}file[\\/:]/i,
  // A bare user, temp, mount or volume root, after any non-path character (also `\/home`).
  new RegExp(String.raw`${START}${SEP}(?:home|Users|root|mnt|media|Volumes|var${SEP}folders|tmp|private|run${SEP}user)(?![\p{L}\p{N}_-])`, "iu"),
];

/** A POSIX path of two or more segments (also `//host/share`). */
const POSIX_PATH = new RegExp(String.raw`${START}${SLASHES}${SEGMENT}${SLASHES}(?:${SEGMENT})?`, "giu");
/** The first three raw segments of a path, read from its start. */
const SEGMENTS = new RegExp(String.raw`${SLASHES}([${SEG_CHARS}]*)(?:${SLASHES}([${SEG_CHARS}]*))?(?:${SLASHES}([${SEG_CHARS}]*))?`, "uy");
/** The rest of the path run a match starts. */
const PATH_RUN = new RegExp(String.raw`[${SEG_CHARS}\\/]*`, "uy");
const DOT_DOT = /(?:^|[\\/])\.\.(?=[\\/]|$)/g;

/** The shared system allowlist of `skillx.kit-proposal-policy/v1`. */
const ALLOW = KIT_PROPOSAL_POLICY.content.localPathSystemAllowlist;
const SYSTEM = {
  roots: new Set(ALLOW.roots),
  usr: new Set(ALLOW.usr),
  usrLocal: new Set(ALLOW.usrLocal),
  dev: new Set(ALLOW.dev),
};

/** A URL of a network scheme; its path is not a local path. Other schemes (`vscode:`, `chrome-extension:`) keep theirs. */
const WEB_URL =
  /(?<![A-Za-z0-9+.-])(?:https?|wss?|ftps?|sftp|ssh|git(?:\+(?:ssh|https?))?|svn(?:\+ssh)?|s3|gs|postgres(?:ql)?|mysql|mongodb(?:\+srv)?|rediss?|amqps?):(?:\\*\/){2,}[^\s"'<>`]*/gi;
/** A short flag glued to a path (`-I/opt/x`, `-isystem/opt/x`), after a word boundary of a command line. */
const GLUED_FLAG = /(?<![^\s"'`=(,;[{])(-{1,2}[A-Za-z][A-Za-z0-9-]*)(?=[\\/])/g;

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

/** Shortens every run of more than 8 separators to its first and last 4, which every pattern reads the same way. */
const collapseSeparators = (text: string) => text.replace(/[\\/]{9,}/g, (run) => run.slice(0, 4) + run.slice(-4));

function allowedSystemPath(segments: Array<string | undefined>): boolean {
  const [root, second, third] = segments.map((s) => s?.toLowerCase());
  if (SYSTEM.roots.has(root!)) return true;
  if (root === "usr") {
    if (second === undefined || second === "") return true;
    if (second !== "local") return SYSTEM.usr.has(second);
    return third === undefined || third === "" || SYSTEM.usrLocal.has(third);
  }
  // `/dev/null` and the standard streams, but not a path below them.
  return root === "dev" && second !== undefined && SYSTEM.dev.has(second) && third === undefined;
}

/** True when `text` names an absolute local path. */
export function hasLocalPath(text: string): boolean {
  const decoded = collapseSeparators(decodeSeparators(text)).replace(GLUED_FLAG, "$1 ");
  if (LOCAL_PATHS.some((re) => re.test(decoded))) return true;
  const plain = decoded.replace(WEB_URL, " ");
  let runEnd = -1;
  let lastDotDot = -1;
  for (const m of plain.matchAll(POSIX_PATH)) {
    const start = m.index!;
    if (start >= runEnd) {
      // A new path run: read it once and remember its last `..` segment.
      PATH_RUN.lastIndex = start;
      PATH_RUN.exec(plain);
      runEnd = PATH_RUN.lastIndex;
      lastDotDot = -1;
      for (const d of plain.slice(start, runEnd).matchAll(DOT_DOT)) lastDotDot = start + d.index!;
    }
    // `/usr/bin/../../home/...` climbs out of the system root.
    if (lastDotDot >= start) return true;
    SEGMENTS.lastIndex = start;
    const segments = SEGMENTS.exec(plain)!;
    if (!allowedSystemPath([segments[1], segments[2], segments[3]])) return true;
  }
  return false;
}
