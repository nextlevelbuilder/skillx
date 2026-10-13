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

/** Credentials that must never ship inside a public release. */
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

const utf8 = new TextDecoder("utf-8", { fatal: true });

function asText(bytes: Uint8Array): string | null {
  if (bytes.includes(0)) return null; // binary
  try {
    return utf8.decode(bytes);
  } catch {
    return null;
  }
}

/** Instruction documents an agent reads as prose; scripts are not, so shell syntax in them is expected. */
const isInstructionDocument = (path: string) => /\.(?:md|markdown|mdx)$/i.test(path);

/**
 * Scans every text file of the tree for secrets, and every Markdown file with
 * the SKILL.md scanner (prompt injection, invisible characters, terminal
 * escapes, shell injection). Any `danger` finding quarantines the release.
 */
export function scanRelease(files: ReadonlyArray<{ path: string; bytes: Uint8Array }>): ReleaseScanResult {
  const findings: string[] = [];
  for (const { path, bytes } of files) {
    const text = asText(bytes);
    if (text === null) continue;
    const documentFindings = isInstructionDocument(path) ? scanContent(text).findings : [];
    for (const finding of documentFindings) {
      if (finding.startsWith("danger:")) findings.push(`${finding.split(":").slice(0, 2).join(":")}:${path}`);
    }
    for (const { name, regex } of SECRET_PATTERNS) {
      if (regex.test(text)) findings.push(`danger:secret-${name}:${path}`);
    }
  }
  return { state: findings.length === 0 ? "published" : "quarantined", findings };
}
