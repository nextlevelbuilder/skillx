/**
 * Sync-leak scanner: secrets and absolute local paths must never leave a
 * machine inside anything SkillX uploads or syncs (collection revisions,
 * lockfiles). The scan walks a JSON value and reports `{path, rule}` pairs;
 * it never returns the matched text, so a finding can be logged safely.
 *
 * Rules:
 * - `secret-key`: an object key that names a password or secret (shared
 *   policy normalization, `secretKeyKind`) holding a non-empty string;
 * - `secret-token`: a value that looks like a credential (private key block,
 *   `Bearer` token, URL with `user:pass@`, JWT, well-known vendor prefixes,
 *   SkillX API keys);
 * - `absolute-path`: a value that is, or embeds, an absolute machine path
 *   (`/home/..`, `/Users/..`, `C:\..`, `\\host\..`, `~/..`, `file://`).
 *   Release-relative paths (`scripts/run.sh`) and URLs pass.
 */
import { secretKeyKind } from "./personal-kit/proposal-policy";

export type SyncLeakRule = "secret-key" | "secret-token" | "absolute-path";

export interface SyncLeak {
  /** JSON path of the offending member, e.g. `config.token` or `packages[2].alias`. */
  path: string;
  rule: SyncLeakRule;
}

const TOKEN_RULES: readonly RegExp[] = [
  /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----/,
  /\bbearer\s+[A-Za-z0-9._~+/-]{16,}=*/i,
  /\b[a-z][a-z0-9+.-]{0,31}:\/\/[^\s/?#:@]+:[^\s/?#@]+@/i,
  /\beyJ[A-Za-z0-9_-]{4,}\.eyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]*/,
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{30,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{20,}\b/,
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/,
  /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/,
  /\bAIza[0-9A-Za-z_-]{35}\b/,
  /\bsx_[A-Za-z0-9_-]{16,}\b/,
];

/** Whole-value or embedded absolute machine paths. */
const PATH_RULES: readonly RegExp[] = [
  /^\//,
  /^~[\\/]/,
  /^[A-Za-z]:[\\/]/,
  /^\\\\/,
  /\bfile:\/\//i,
  /(?:^|[\s"'=(,;])(?:\/(?:home|Users|root|var|tmp|private|opt|etc|mnt|Volumes)\/)/,
  /(?:^|[\s"'=(,;])[A-Za-z]:\\/,
];

/** True when `text` holds a credential-looking token. */
export function hasSecretToken(text: string): boolean {
  return TOKEN_RULES.some((re) => re.test(text));
}

/** True when `text` is or embeds an absolute local path. */
export function hasAbsolutePath(text: string): boolean {
  return PATH_RULES.some((re) => re.test(text));
}

const MAX_DEPTH = 64;

/** Every leak in `value`, in document order. Deeper than 64 levels is reported as a leak at that path. */
export function findSyncLeaks(value: unknown, path = ""): SyncLeak[] {
  const out: SyncLeak[] = [];
  walk(value, path, 0, out);
  return out;
}

function walk(value: unknown, path: string, depth: number, out: SyncLeak[]): void {
  if (depth > MAX_DEPTH) {
    out.push({ path, rule: "secret-token" });
    return;
  }
  if (typeof value === "string") {
    if (hasSecretToken(value)) out.push({ path, rule: "secret-token" });
    else if (hasAbsolutePath(value)) out.push({ path, rule: "absolute-path" });
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, depth + 1, out));
    return;
  }
  if (typeof value !== "object" || value === null) return;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path === "" ? key : `${path}.${key}`;
    if (hasAbsolutePath(key)) out.push({ path: childPath, rule: "absolute-path" });
    if (typeof child === "string" && child.length > 0 && secretKeyKind(key) !== null) {
      out.push({ path: childPath, rule: "secret-key" });
      continue;
    }
    walk(child, childPath, depth + 1, out);
  }
}
