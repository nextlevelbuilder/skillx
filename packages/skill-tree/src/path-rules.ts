/**
 * Path and segment rules of `agentkit.skill-tree/v1` (contract 4.4) and the
 * excluded noise (contract 4.5). Rules are ordered tables: the first failing
 * rule wins, matching the AgentKit reference implementation.
 */
import { ERROR_CODES, SkillTreeError, treeError } from "./errors";
import { isAssigned, isFormat, isNfc } from "./unicode-15";

export const MAX_PATH_BYTES = 512;
export const MAX_SEGMENT_BYTES = 255;
export const MAX_SEGMENTS = 32;

/** Reserved prefix of AgentKit temporary files; matched exactly and case-sensitively. */
export const TEMP_PREFIX = ".ak-tmp.";

const NOISE_DIRS = new Set([".git", ".hg", ".svn", "__pycache__", ".pytest_cache"]);
const NOISE_FILES = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

const WINDOWS_RESERVED = new Set([
  "CON", "PRN", "AUX", "NUL", "CONIN$", "CONOUT$",
  ...Array.from({ length: 10 }, (_, i) => `COM${i}`),
  ...Array.from({ length: 10 }, (_, i) => `LPT${i}`),
  "COM¹", "COM²", "COM³", "LPT¹", "LPT²", "LPT³",
]);

const MAX_SHORT_NAME_STEM = 8;
const FORBIDDEN_ASCII = new Set(Array.from('\\:<>"|?*'));

/** UTF-8 byte length of a well-formed string. */
export function utf8Length(s: string): number {
  let n = 0;
  for (const ch of s) {
    const cp = ch.codePointAt(0)!;
    n += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4;
  }
  return n;
}

/** True when the string holds no unpaired surrogate, so it encodes to valid UTF-8. */
export function isWellFormed(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = s.charCodeAt(i + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return false;
      i++;
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      return false;
    }
  }
  return true;
}

export function asciiUpper(s: string): string {
  return s.replace(/[a-z]/g, (c) => c.toUpperCase());
}

export function asciiLower(s: string): string {
  return s.replace(/[A-Z]/g, (c) => c.toLowerCase());
}

/** Separators, Windows-forbidden characters, C0/C1 controls, Cf and unassigned (Cn). */
function forbiddenCodePoint(cp: number): boolean {
  if (cp < 0x80 && FORBIDDEN_ASCII.has(String.fromCharCode(cp))) return true;
  if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) return true;
  if (isFormat(cp)) return true;
  return !isAssigned(cp);
}

function stemOf(segment: string): string {
  const dot = segment.indexOf(".");
  return dot < 0 ? segment : segment.slice(0, dot);
}

function isWindowsReservedName(segment: string): boolean {
  return WINDOWS_RESERVED.has(asciiUpper(stemOf(segment).replace(/ +$/, "")));
}

function isShortNameShaped(segment: string): boolean {
  const stem = stemOf(segment);
  return utf8Length(stem) <= MAX_SHORT_NAME_STEM && /~[0-9]/.test(stem);
}

type Rule = readonly [reason: string, bad: (s: string) => boolean];

const PATH_RULES: readonly Rule[] = [
  ["is empty", (p) => p === ""],
  ["is not valid UTF-8", (p) => !isWellFormed(p)],
  [`exceeds ${MAX_PATH_BYTES} bytes`, (p) => utf8Length(p) > MAX_PATH_BYTES],
  [`exceeds ${MAX_SEGMENTS} segments`, (p) => p.split("/").length > MAX_SEGMENTS],
];

const SEGMENT_RULES: readonly Rule[] = [
  ["is empty (absolute path or repeated separator)", (s) => s === ""],
  ["is a relative directory reference", (s) => s === "." || s === ".."],
  [`exceeds ${MAX_SEGMENT_BYTES} bytes`, (s) => utf8Length(s) > MAX_SEGMENT_BYTES],
  [`starts with the reserved temporary-file prefix ${TEMP_PREFIX}`, (s) => s.startsWith(TEMP_PREFIX)],
  [
    "contains a forbidden, control, format or unassigned character",
    (s) => Array.from(s).some((ch) => forbiddenCodePoint(ch.codePointAt(0)!)),
  ],
  ["ends with a space or dot", (s) => s.endsWith(" ") || s.endsWith(".")],
  ["is a Windows reserved device name", isWindowsReservedName],
  ["is shaped like an 8.3 short name", isShortNameShaped],
];

/** The reason of the first segment rule `segment` fails, or "" when it passes. */
export function segmentViolation(segment: string): string {
  for (const [reason, bad] of SEGMENT_RULES) if (bad(segment)) return reason;
  return "";
}

/**
 * Structural path and segment rules, without NFC. `utf8Valid` is false when
 * the raw name bytes were not valid UTF-8 and `p` is only a lossy decoding.
 */
export function checkPathRules(p: string, utf8Valid = true): SkillTreeError | null {
  if (p === "") return treeError(ERROR_CODES.unsafePath, p, "path is empty");
  if (!utf8Valid) return treeError(ERROR_CODES.unsafePath, p, "path is not valid UTF-8");
  for (const [reason, bad] of PATH_RULES) {
    if (bad(p)) return treeError(ERROR_CODES.unsafePath, p, `path ${reason}`);
  }
  for (const segment of p.split("/")) {
    const reason = segmentViolation(segment);
    if (reason !== "") return treeError(ERROR_CODES.unsafePath, p, `segment ${JSON.stringify(segment)} ${reason}`);
  }
  return null;
}

export function checkNfc(p: string): SkillTreeError | null {
  return isNfc(p) ? null : treeError(ERROR_CODES.nonNfcPath, p, "path is not in Unicode NFC");
}

/**
 * Validates one tree path. Returns null when it is safe, otherwise a
 * `tree.unsafe_path` or `tree.non_nfc_path` error. Never throws.
 */
export function validatePath(p: string): SkillTreeError | null {
  return checkPathRules(p) ?? checkNfc(p);
}

export function isNoiseDirName(name: string): boolean {
  return NOISE_DIRS.has(name);
}

export function isNoiseFileName(name: string): boolean {
  return NOISE_FILES.has(name);
}

/** Whether a tree path is noise: a noise directory segment or a noise file base name. */
export function isNoisePath(p: string): boolean {
  const segments = p.split("/");
  const name = segments.pop() ?? "";
  return segments.some(isNoiseDirName) || isNoiseFileName(name);
}
