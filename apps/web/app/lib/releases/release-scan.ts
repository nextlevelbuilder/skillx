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

const strictUtf8 = new TextDecoder("utf-8", { fatal: true });
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

/** Prose an agent reads as instructions; scripts are not, so shell syntax in them is expected. */
const isInstructionDocument = (path: string) => /\.(?:md|markdown|mdx|txt)$/i.test(path);

/** Scripts and text configuration. */
const TEXT_EXTENSIONS =
  /\.(?:sh|bash|zsh|fish|ps1|psm1|bat|cmd|py|js|mjs|cjs|ts|mts|cts|rb|pl|php|lua|json|jsonc|ya?ml|toml|ini|cfg|conf|env|xml|html?|css|csv)$/i;

/** Files that must be clean UTF-8 text: instruction documents, scripts and config (by extension, directory or shebang). */
function mustBeText(path: string, bytes: Uint8Array): boolean {
  return (
    isInstructionDocument(path) ||
    TEXT_EXTENSIONS.test(path) ||
    /(?:^|\/)\.env(?:\.[^/]*)?$/.test(path) ||
    /(?:^|\/)scripts\//.test(path) ||
    (bytes[0] === 0x23 && bytes[1] === 0x21) // "#!"
  );
}

function strictText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null;
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

/**
 * Every file is searched for secrets over its raw bytes. Instruction
 * documents and scripts must be NUL-free UTF-8 (anything else would hide
 * content from the scan while agents still read it lossily) and instruction
 * documents also go through the SKILL.md scanner (prompt injection,
 * invisible characters, terminal escapes, shell injection). Any `danger`
 * finding quarantines the release.
 */
export function scanRelease(files: ReadonlyArray<{ path: string; bytes: Uint8Array }>): ReleaseScanResult {
  const findings: string[] = [];
  for (const { path, bytes } of files) {
    if (mustBeText(path, bytes)) {
      const text = strictText(bytes);
      if (text === null) {
        findings.push(`danger:non-utf8-text:${path}`);
      } else if (isInstructionDocument(path)) {
        for (const finding of scanContent(text).findings) {
          if (finding.startsWith("danger:")) findings.push(`${finding.split(":").slice(0, 2).join(":")}:${path}`);
        }
      }
    }
    const raw = byteText(bytes);
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(raw)) findings.push(`danger:secret-${name}:${path}`);
    }
  }
  return { state: findings.length === 0 ? "published" : "quarantined", findings };
}
