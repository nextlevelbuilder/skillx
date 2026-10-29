/**
 * Content scan that decides a new release's initial state. It reads the
 * stored bytes and never changes them: a release with any `danger` finding
 * enters `quarantined`, otherwise `published`. Findings name a rule and a
 * path, never the matched text, so a leaked secret is not echoed back.
 */
import { scanContent } from "~/lib/security/content-scanner";

export interface ReleaseScanResult {
  state: "published" | "quarantined";
  findings: string[];
}

/** Credentials that must never ship inside a public release (ASCII-only patterns). */
const SECRET_PATTERNS: ReadonlyArray<{ name: string; regex: RegExp }> = [
  { name: "private-key", regex: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----/ },
  { name: "aws-access-key-id", regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/ },
  { name: "github-token", regex: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/ },
  { name: "slack-token", regex: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { name: "stripe-secret-key", regex: /\b[rs]k_live_[A-Za-z0-9]{20,}\b/ },
  { name: "google-api-key", regex: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { name: "openai-api-key", regex: /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/ },
  { name: "anthropic-api-key", regex: /\bsk-ant-[A-Za-z0-9_-]{32,}\b/ },
];

/** Largest instruction document decoded into a string; larger ones are quarantined rather than decoded whole. */
export const MAX_SCANNED_TEXT_BYTES = 4 * 1024 * 1024;
/** Raw-byte secret scan window; consecutive windows overlap so a token cannot straddle a boundary unseen. */
const SECRET_WINDOW = 64 * 1024;
const SECRET_OVERLAP = 512;

/**
 * One character per byte, so ASCII secret patterns match inside any file,
 * binary or invalid UTF-8 included. (Built by hand: a Worker's TextDecoder
 * need not support latin1.)
 */
function byteText(bytes: Uint8Array): string {
  const parts: string[] = [];
  for (let at = 0; at < bytes.length; at += 0x8000) {
    parts.push(String.fromCharCode(...bytes.subarray(at, at + 0x8000)));
  }
  return parts.join("");
}

/** Secret patterns found in `bytes`, scanned window by window so no file-sized string is built. */
function secretsInBytes(bytes: Uint8Array): Set<string> {
  const found = new Set<string>();
  for (let at = 0; at < bytes.length; at += SECRET_WINDOW) {
    // Start one byte early so a window never opens in the middle of a token and invents a `\b`.
    const start = Math.max(0, at - 1);
    const end = Math.min(bytes.length, at + SECRET_WINDOW + SECRET_OVERLAP);
    const window = byteText(bytes.subarray(start, end));
    for (const { name, regex } of SECRET_PATTERNS) {
      if (!found.has(name) && matchesInsideWindow(regex, window, start < at, end < bytes.length, at + SECRET_WINDOW - start)) {
        found.add(name);
      }
    }
  }
  return found;
}

/**
 * Whether `regex` matches `window` for real. The window edges are not file edges, so a match that
 * starts at the extra leading byte, or lies wholly in the overlap and ends at a non-final window's
 * end, could be an artifact of the cut (the edge acts as `\b`); the next window sees those bytes in
 * context. A longer match that began before the overlap is kept: the next window opens mid-token.
 * `overlapAt` is the window index where the overlap begins.
 */
function matchesInsideWindow(
  regex: RegExp,
  window: string,
  cutAtStart: boolean,
  cutAtEnd: boolean,
  overlapAt: number,
): boolean {
  const global = new RegExp(regex.source, "g");
  for (let m = global.exec(window); m !== null; m = global.exec(window)) {
    const artifact =
      (cutAtStart && m.index === 0) || (cutAtEnd && m.index >= overlapAt && m.index + m[0].length === window.length);
    if (!artifact) return true;
    global.lastIndex = m.index + 1;
  }
  return false;
}

function secretsInText(text: string): Set<string> {
  return new Set(SECRET_PATTERNS.filter(({ regex }) => regex.test(text)).map(({ name }) => name));
}

/** Markdown an agent reads as instructions. */
const isMarkup = (path: string) => /\.(?:md|markdown|mdx)$/i.test(path);
/**
 * Licence files by name: a bare upper-case name, optionally with an upper-case `-MIT`/`-APACHE-2.0`
 * style suffix and a `.txt`/`.md` extension. Free suffixes (`NOTICE-install`), other extensions
 * (`LICENSE.rst`, `NOTICE.pdf`) and lower-case names are not licence files.
 */
const LICENSE_NAME = /(?:^|\/)(?:LICENSE|LICENCE|COPYING|NOTICE|AUTHORS)(?:-[A-Z0-9+]+(?:\.\d+)*)*(?:\.(?:txt|md|markdown))?$/;
/**
 * Licence-like names in any spelling (`NOTICE-install`, `LICENSE_MIT`, `PATENTS`, `copying`): read as
 * documents and scanned in full, but without the exemptions the canonical names get.
 */
const LICENSE_LIKE =
  /(?:^|\/)(?:LICEN[CS]E|COPYING|NOTICE|AUTHORS|PATENTS|CONTRIBUTORS)(?:[-_][A-Za-z0-9+]+(?:\.\d+)*)*(?:\.(?:txt|md|markdown|rst))?$/i;
/** Licence text: shell and URL syntax is ordinary prose there. Other plain text keeps every rule. */
const isLicenseFile = (path: string, bytes: Uint8Array) => LICENSE_NAME.test(path) && !hasBinaryMagic(bytes);
const isInstructionDocument = (path: string, bytes: Uint8Array) =>
  isMarkup(path) || /\.txt$/i.test(path) || ((LICENSE_LIKE.test(path) || LICENSE_NAME.test(path)) && !hasBinaryMagic(bytes));
/** Finding kinds that are shell or URL syntax rather than hidden content or instruction override. */
const SYNTAX_FINDINGS = new Set(["shell-injection", "js-protocol", "data-html"]);

/** Scripts and text configuration. */
const TEXT_EXTENSIONS =
  /\.(?:sh|bash|zsh|fish|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|mts|cts|rb|pl|php|lua|json|jsonc|ya?ml|toml|ini|cfg|conf|env|xml|html?|css|csv)$/i;
/** Text that Windows tooling writes in the system codepage: valid text without being UTF-8. */
const LEGACY_CODEPAGE = /\.(?:bat|cmd|csv)$/i;

/** Magic numbers of executables, archives, images and wasm: real binaries, not text in a bad encoding. */
const BINARY_MAGIC: ReadonlyArray<readonly number[]> = [
  [0x7f, 0x45, 0x4c, 0x46], // ELF
  [0xcf, 0xfa, 0xed, 0xfe], // Mach-O
  [0xfe, 0xed, 0xfa, 0xce],
  [0xca, 0xfe, 0xba, 0xbe], // Mach-O fat
  [0x00, 0x61, 0x73, 0x6d], // wasm
  [0x50, 0x4b, 0x03, 0x04], // zip
  [0x1f, 0x8b], // gzip
  [0x89, 0x50, 0x4e, 0x47], // PNG
  [0xff, 0xd8, 0xff], // JPEG
  [0x25, 0x50, 0x44, 0x46], // PDF
];
/** "MZ" whose e_lfanew (offset 0x3c) points at "PE\0\0"; a bare "MZ" is just text. */
function isPortableExecutable(bytes: Uint8Array): boolean {
  if (bytes[0] !== 0x4d || bytes[1] !== 0x5a || bytes.length < 0x40) return false;
  const at = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0x3c, true);
  return at + 4 <= bytes.length && bytes[at] === 0x50 && bytes[at + 1] === 0x45 && bytes[at + 2] === 0 && bytes[at + 3] === 0;
}
const hasBinaryMagic = (bytes: Uint8Array) =>
  isPortableExecutable(bytes) || BINARY_MAGIC.some((magic) => magic.every((b, i) => bytes[i] === b));

function utf16Bom(bytes: Uint8Array): "le" | "be" | null {
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return "le";
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return "be";
  return null;
}

/** Strictly decodes BOM-marked UTF-16 to a string without its BOM, or null when malformed. */
function decodeUtf16(bytes: Uint8Array, order: "le" | "be"): string | null {
  if (bytes.length % 2 !== 0) return null;
  const body = bytes.slice(2);
  if (order === "be") {
    for (let i = 0; i < body.length; i += 2) [body[i], body[i + 1]] = [body[i + 1], body[i]];
  }
  try {
    const text = new TextDecoder("utf-16le", { fatal: true }).decode(body);
    // workerd does not throw on a lone surrogate even with `fatal`.
    return (text as string & { isWellFormed(): boolean }).isWellFormed() ? text : null;
  } catch {
    return null;
  }
}

/** Streaming UTF-8 validity check; never holds the decoded file. */
function isValidUtf8(bytes: Uint8Array): boolean {
  const decoder = new TextDecoder("utf-8", { fatal: true });
  try {
    for (let at = 0; at < bytes.length; at += SECRET_WINDOW) {
      decoder.decode(bytes.subarray(at, at + SECRET_WINDOW), { stream: true });
    }
    decoder.decode();
    return true;
  } catch {
    return false;
  }
}

/** Files that must be readable text: instruction documents, scripts and config (by extension, directory or shebang). */
function mustBeText(path: string, bytes: Uint8Array): boolean {
  if (
    isInstructionDocument(path, bytes) ||
    TEXT_EXTENSIONS.test(path) ||
    /(?:^|\/)\.env(?:\.[^/]*)?$/.test(path) ||
    (bytes[0] === 0x23 && bytes[1] === 0x21) // "#!"
  ) {
    return true;
  }
  // Anything else under scripts/ is text unless it is plainly a bundled binary.
  return /(?:^|\/)scripts\//.test(path) && !hasBinaryMagic(bytes);
}

interface TextRead {
  /** Decoded text, kept only when an instruction scan or a UTF-16 secret scan needs it. */
  text: string | null;
  /** Latin-1 reading of a non-UTF-8 licence file, soft hyphens removed (invisible there): a latin-1 reader sees NBSP and joined words the lossy UTF-8 text hides. */
  latin1?: string;
  /** The file is not readable as the text it must be. */
  invalid: boolean;
}

function readText(path: string, bytes: Uint8Array): TextRead {
  const order = utf16Bom(bytes);
  if (order !== null) {
    // Too large to decode whole, and its secrets cannot be matched over raw bytes: the caller quarantines it.
    if (bytes.length > MAX_SCANNED_TEXT_BYTES) return { text: null, invalid: false };
    const text = decodeUtf16(bytes, order);
    return { text, invalid: text === null };
  }
  if (bytes.includes(0)) return { text: null, invalid: true };
  if (!isValidUtf8(bytes)) {
    if (LEGACY_CODEPAGE.test(path)) return { text: null, invalid: false };
    // A latin-1 NOTICE is legitimate, but it is still scanned under both readings. Markup never gets this allowance.
    if (isLicenseFile(path, bytes) && !isMarkup(path)) {
      if (bytes.length > MAX_SCANNED_TEXT_BYTES) return { text: null, invalid: false };
      return { text: new TextDecoder("utf-8").decode(bytes), latin1: byteText(bytes).replaceAll("­", ""), invalid: false };
    }
    return { text: null, invalid: true };
  }
  const needsText = isInstructionDocument(path, bytes) && bytes.length <= MAX_SCANNED_TEXT_BYTES;
  return { text: needsText ? new TextDecoder("utf-8").decode(bytes) : null, invalid: false };
}

/** SKILL.md scanner findings for one instruction document, as `danger:<kind>:<path>`. */
function instructionFindings(path: string, text: string, skipSyntax: boolean): string[] {
  // A leading BOM is an encoding mark, not hidden content.
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const out: string[] = [];
  for (const finding of scanContent(body).findings) {
    if (!finding.startsWith("danger:")) continue;
    const kind = finding.split(":")[1];
    if (!(skipSyntax && SYNTAX_FINDINGS.has(kind))) out.push(`danger:${kind}:${path}`);
  }
  return out;
}

/**
 * Every file is searched for secrets over its raw bytes, window by window.
 * Instruction documents and scripts must be NUL-free UTF-8 (anything else
 * would hide content from the scan while agents still read it lossily). Any
 * BOM-marked UTF-16 file is decoded and scanned as text regardless of extension,
 * `.bat`/`.cmd`/`.csv` may use a legacy codepage, and recognizable binaries
 * under `scripts/` are not text. Instruction documents also go through the
 * SKILL.md scanner (prompt injection, invisible characters, terminal escapes,
 * shell injection); only licence files skip the shell/URL syntax rules, which
 * includes licence markup such as `LICENSE.md` (other `.txt` files are read by
 * agents as instructions). A latin-1 licence file is scanned under both its
 * lossy UTF-8 and its latin-1 reading; invalid UTF-8 in any markup file is
 * quarantined. Instruction documents and
 * UTF-16 text above `MAX_SCANNED_TEXT_BYTES` are quarantined instead of
 * decoded whole. Any `danger` finding quarantines the release.
 */
export function scanRelease(files: ReadonlyArray<{ path: string; bytes: Uint8Array }>): ReleaseScanResult {
  const findings: string[] = [];
  for (const { path, bytes } of files) {
    let secrets: Set<string> | null = null;
    const utf16Order = utf16Bom(bytes);
    if (mustBeText(path, bytes) || utf16Order !== null) {
      const { text, latin1, invalid } = readText(path, bytes);
      if (invalid) {
        findings.push(`danger:non-utf8-text:${path}`);
      } else if (bytes.length > MAX_SCANNED_TEXT_BYTES && (isInstructionDocument(path, bytes) || utf16Order !== null)) {
        findings.push(`danger:text-too-large:${path}`);
      } else if (text !== null && isInstructionDocument(path, bytes)) {
        const skipSyntax = isLicenseFile(path, bytes);
        const readings = latin1 === undefined ? [text] : [text, latin1];
        findings.push(...new Set(readings.flatMap((reading) => instructionFindings(path, reading, skipSyntax))));
      }
      // UTF-16 interleaves NULs, so its secrets only match in the decoded text. The raw
      // bytes are scanned too: ASCII behind a UTF-16 BOM decodes to valid CJK and would
      // otherwise hide a plain-byte secret.
      if (utf16Order !== null && text !== null) secrets = new Set([...secretsInText(text), ...secretsInBytes(bytes)]);
    }
    for (const name of secrets ?? secretsInBytes(bytes)) findings.push(`danger:secret-${name}:${path}`);
  }
  return { state: findings.length === 0 ? "published" : "quarantined", findings };
}
