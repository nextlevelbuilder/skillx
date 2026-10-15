/**
 * `skillx.kit-proposal-policy/v1`: the forbidden-key rules of a
 * `skillx.kit-proposal/v1` envelope, shared with AgentKit, which refuses the
 * same keys locally before it uploads a proposal. The single source is
 * `fixtures/kit-proposal-policy-v1.json`; both sides test against
 * `fixtures/kit-proposal-policy-vectors-v1.json`. This module only applies
 * the JSON rules, so a list change is a JSON change.
 */
import policy from "../fixtures/kit-proposal-policy-v1.json";

export const KIT_PROPOSAL_POLICY_SCHEMA = "skillx.kit-proposal-policy/v1";
export const KIT_PROPOSAL_POLICY = policy;

const EXACT = new Set(policy.forbiddenKeys.exact);
const CONTAINS = policy.forbiddenKeys.contains;
const CONTENT_FIELDS = new Set(policy.forbiddenKeys.contentFields);
const MAX_KEY_LENGTH = policy.forbiddenKeys.maxKeyLength;

/** Decodes `%XX` escapes (each to the code unit of its byte) until nothing changes, at most 3 rounds. */
function percentDecode(key: string): string {
  let out = key;
  for (let i = 0; i < 3; i++) {
    const next = out.replace(/%([0-9a-f]{2})/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * The comparable form of a key (`[a-z0-9]*`), or null when the key cannot be
 * checked: longer than the limit, or not printable ASCII once decoded and
 * NFKC-folded (zero-width characters, homoglyphs, any other script).
 */
export function normalizeProposalKey(key: string): string | null {
  if ([...key].length > MAX_KEY_LENGTH) return null;
  const folded = percentDecode(key).normalize("NFKC").toLowerCase();
  if (!/^[\x20-\x7e]*$/.test(folded)) return null;
  return folded.replace(/[^a-z0-9]/g, "");
}

/** True when a key is refused whatever its (non-numeric) value. */
export function isForbiddenProposalKey(key: string): boolean {
  const normal = normalizeProposalKey(key);
  return normal === null || EXACT.has(normal) || CONTAINS.some((stem) => normal.includes(stem));
}

export type ProposalKeyFinding = { reason: "forbidden"; path: string } | { reason: "too_deep"; path: string };

/** Parses a string that holds a JSON object or array, or returns undefined. */
function embeddedJson(text: string): unknown {
  const t = text.trimStart();
  if (!t.startsWith("{") && !t.startsWith("[")) return undefined;
  try {
    return JSON.parse(t) as unknown;
  } catch {
    return undefined;
  }
}

/**
 * The first refused key of `value` in document order (its path, never its
 * value), or the first place it nests deeper than `maxDepth`; null when the
 * document passes. A key with a number value is exempt. A string outside the
 * file-content fields that holds a JSON object or array is checked as a
 * nested document at `<path>#json`.
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
    const path = `${at}.${key}`;
    if (typeof child === "number") continue;
    if (isForbiddenProposalKey(key)) return { reason: "forbidden", path };
    const nested = typeof child === "string" && !CONTENT_FIELDS.has(key) ? embeddedJson(child) : undefined;
    const found = nested === undefined ? findForbiddenProposalKey(child, maxDepth, path, depth + 1) : findForbiddenProposalKey(nested, maxDepth, `${path}#json`, depth + 1);
    if (found !== null) return found;
  }
  return null;
}
