/**
 * Content scanner for SKILL.md files.
 * Detects prompt injection, invisible chars, and suspicious patterns.
 * Pure function, no async, no dependencies — fast and testable.
 */

export type RiskLabel = "safe" | "caution" | "danger" | "unknown";

export interface ScanResult {
  label: RiskLabel;
  findings: string[];
}

// DANGER patterns — any single match = "danger"
const INVISIBLE_UNICODE = /[\u200B-\u200D\u202A-\u202E\uFEFF\u2060-\u2064\u2066-\u206F]/g;
const ANSI_ESCAPE = /\x1B\[[0-9;]*[A-Za-z]/g;
const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts|rules)/i,
  /you\s+are\s+now\s+(?:a|an|the|my)\s+/i,
  /(?:reveal|show|print|output|leak)\s+(?:the\s+)?system\s+prompt/i,
  /(?:override|replace|rewrite)\s+(?:the\s+)?system\s+prompt/i,
];
const JS_PROTOCOL = /javascript\s*:/i;
const DATA_HTML = /data\s*:\s*text\/html/i;
const SHELL_INJECTION = /(?:\$\([^)]+\)|eval\s*\(|exec\s*\()/;

// CAUTION patterns — 2+ matches = "caution"
const CAUTION_PATTERNS: Array<{ regex: RegExp; label: string }> = [
  { regex: /<script/i, label: "html-script-tag" },
  { regex: /<iframe/i, label: "html-iframe-tag" },
  { regex: /<object/i, label: "html-object-tag" },
  { regex: /<embed/i, label: "html-embed-tag" },
  { regex: /<form/i, label: "html-form-tag" },
  { regex: /(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl)\//i, label: "url-shortener" },
  { regex: /[A-Za-z0-9+/]{200,}={0,2}/, label: "base64-block" },
  { regex: /<!--[\s\S]{500,}?-->/, label: "hidden-html-comment" },
  { regex: /process\.env/i, label: "env-access" },
  { regex: /fs\.readFile/i, label: "fs-read" },
  { regex: /child_process/i, label: "child-process" },
  // XML-style tags commonly used in prompt injection (moved from DANGER)
  { regex: /^\s*<system/im, label: "xml-system-tag" },
  { regex: /^\s*<assistant/im, label: "xml-assistant-tag" },
  { regex: /^\s*<human/im, label: "xml-human-tag" },
];

export function scanContent(content: string): ScanResult {
  const findings: string[] = [];

  // DANGER checks
  const zwChars = content.match(INVISIBLE_UNICODE);
  if (zwChars) {
    findings.push(`danger:invisible-chars:${zwChars.length} zero-width characters`);
  }

  const ansi = content.match(ANSI_ESCAPE);
  if (ansi) {
    findings.push(`danger:ansi-escape:${ansi.length} terminal escape codes`);
  }

  for (const pattern of PROMPT_INJECTION_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(`danger:prompt-injection:${pattern.source}`);
    }
  }

  if (JS_PROTOCOL.test(content)) {
    findings.push("danger:js-protocol:javascript: URL detected");
  }

  if (DATA_HTML.test(content)) {
    findings.push("danger:data-html:data:text/html URL detected");
  }

  if (SHELL_INJECTION.test(content)) {
    findings.push("danger:shell-injection:shell command pattern detected");
  }

  // CAUTION checks
  let cautionCount = 0;
  for (const { regex, label } of CAUTION_PATTERNS) {
    if (regex.test(content)) {
      findings.push(`caution:${label}`);
      cautionCount++;
    }
  }

  // Derive label
  const hasDanger = findings.some((f) => f.startsWith("danger:"));
  let label: RiskLabel;
  if (hasDanger) {
    label = "danger";
  } else if (cautionCount >= 2) {
    label = "caution";
  } else {
    label = "safe";
  }

  return { label, findings };
}

/** Strip zero-width Unicode chars and ANSI escape codes from content */
export function sanitizeContent(content: string): string {
  return content
    .replace(INVISIBLE_UNICODE, "")
    .replace(ANSI_ESCAPE, "");
}
