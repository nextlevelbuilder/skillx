/**
 * `skillx.kit-proposal-policy/v1`: the forbidden-key rules of a
 * `skillx.kit-proposal/v1` envelope and the secret-key names of the content
 * rules, shared with AgentKit, which refuses the same keys locally before it
 * uploads a proposal. The single source is `fixtures/kit-proposal-policy-v1.json`;
 * both sides test against `fixtures/kit-proposal-policy-vectors-v1.json`. This
 * module only applies the JSON rules, so a list change is a JSON change.
 */
import policy from "../fixtures/kit-proposal-policy-v1.json";

export const KIT_PROPOSAL_POLICY_SCHEMA = "skillx.kit-proposal-policy/v1";
export const KIT_PROPOSAL_POLICY = policy;

const EXACT = new Set(policy.forbiddenKeys.exact);
const CONTAINS = policy.forbiddenKeys.contains;
const CONTENT_FIELDS = new Set(policy.forbiddenKeys.contentFields);
const MAX_KEY_LENGTH = policy.forbiddenKeys.maxKeyLength;
const ROUNDS = policy.forbiddenKeys.percentDecodeRounds;
const ESCAPE = /%[0-9a-f]{2}/i;

/** Decodes `%XX` escapes (each to the code unit of its byte) until nothing changes; null when escapes remain after the last round. */
function percentDecode(key: string): string | null {
  let out = key;
  for (let i = 0; i < ROUNDS && ESCAPE.test(out); i++) out = out.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
  return ESCAPE.test(out) ? null : out;
}

/**
 * The comparable form of a key (`[a-z0-9]*`), or null when the key cannot be
 * checked: longer than the limit, still percent-encoded after the last round,
 * or holding a character other than printable ASCII and its fullwidth forms
 * (zero-width characters, homoglyphs, any other script). Only fullwidth
 * forms reach NFKC, so the result does not depend on the Unicode version.
 */
export function normalizeProposalKey(key: string): string | null {
  if ([...key].length > MAX_KEY_LENGTH) return null;
  const decoded = percentDecode(key);
  if (decoded === null || !/^[\x20-\x7e！-～]*$/.test(decoded)) return null;
  const folded = decoded.normalize("NFKC");
  if (!/^[\x20-\x7e]*$/.test(folded)) return null;
  return folded.replace(/[A-Z]/g, (c) => c.toLowerCase()).replace(/[^a-z0-9]/g, "");
}

/** True when a key is refused whatever its (non-numeric) value. */
export function isForbiddenProposalKey(key: string): boolean {
  const normal = normalizeProposalKey(key);
  return normal === null || EXACT.has(normal) || CONTAINS.some((stem) => normal.includes(stem));
}

const SECRET_KEYS = policy.content.secretKeys;
const endsWithAny = (key: string, stems: string[]) => stems.some((stem) => key.endsWith(stem));

/**
 * What a key in file content (`key: value`, `key = value`, `"key": value`)
 * names: `"password"` or `"secret"` when its normalized form ends with one of
 * the policy stems, `null` otherwise. `dotenv` (a `KEY=value` line) matches a
 * stem anywhere in the key. A key that cannot be normalized names a secret.
 */
export function secretKeyKind(key: string, dotenv = false): "password" | "secret" | null {
  const normal = normalizeProposalKey(key);
  if (normal === null) return "secret";
  const has = dotenv ? (stems: string[]) => stems.some((s) => normal.includes(s)) : (stems: string[]) => endsWithAny(normal, stems);
  if (has(SECRET_KEYS.password)) return "password";
  return has(SECRET_KEYS.secret) ? "secret" : null;
}

export type ProposalKeyFinding = { reason: "forbidden"; path: string } | { reason: "too_deep"; path: string };

/** Parses a string that holds a JSON object or array (also through JSON string layers), or returns undefined. */
function embeddedJson(text: string): unknown {
  let t = text.trimStart();
  for (let layer = 0; layer < ROUNDS + 1; layer++) {
    if (!t.startsWith("{") && !t.startsWith("[") && !t.startsWith('"')) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(t) as unknown;
    } catch {
      return undefined;
    }
    if (typeof parsed !== "string") return parsed;
    t = parsed.trimStart();
  }
  return undefined;
}

/**
 * One key of a path: `.key` for `[A-Za-z0-9_$-]+`, otherwise `["key"]` (a
 * JSON string), and `[…]` for a key longer than the limit, which is never echoed.
 */
function keySegment(key: string): string {
  if (/^[A-Za-z0-9_$-]+$/.test(key) && key.length <= MAX_KEY_LENGTH) return `.${key}`;
  return [...key].length > MAX_KEY_LENGTH ? "[…]" : `[${JSON.stringify(key)}]`;
}

/**
 * The first refused key of `value` in document order (its path, never its
 * value), or the first place it nests deeper than `maxDepth`; null when the
 * document passes. A key with a number value is exempt. A string outside the
 * file-content fields that holds a JSON object or array is checked as a
 * nested document at `<path>#json`. Paths use `.key`, `["key"]` and `[index]`.
 */
export function findForbiddenProposalKey(value: unknown, maxDepth: number, at = "proposal", depth = 0): ProposalKeyFinding | null {
  if (typeof value === "object" && value !== null && depth >= maxDepth) return { reason: "too_deep", path: at };
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) {
      const found = findForbiddenProposalKey(value[i], maxDepth, `${at}[${i}]`, depth + 1);
      if (found !== null) return found;
    }
    return null;
  }
  if (typeof value !== "object" || value === null) return null;
  for (const [key, child] of Object.entries(value)) {
    const path = at + keySegment(key);
    if (typeof child === "number") continue;
    if (isForbiddenProposalKey(key)) return { reason: "forbidden", path };
    const nested = typeof child === "string" && !CONTENT_FIELDS.has(key) ? embeddedJson(child) : undefined;
    const found = nested === undefined ? findForbiddenProposalKey(child, maxDepth, path, depth + 1) : findForbiddenProposalKey(nested, maxDepth, `${path}#json`, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
