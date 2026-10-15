/**
 * `skillx.kit-proposal/v1`: a reviewed-overlay proposal derived locally from
 * session learnings (AgentKit proposes, the owner reviews). It carries one
 * skill's new overlay against the same pinned base as `fromRevisionId`, the
 * permissions the author declares the change needs, an optional redacted
 * evidence summary (at most 2 KiB) with numeric signals, and is private.
 *
 * Raw session data is never accepted: a key that names a transcript,
 * prompt, message list, environment, secret, working directory or history
 * anywhere in the proposal (in any case, separator or encoding, also inside
 * a string that holds JSON) is refused with `proposal.forbidden_field`
 * naming the key path, never its value; so is a key that cannot be checked
 * (non-ASCII or overlong). The rules are the shared, versioned
 * `skillx.kit-proposal-policy/v1` that AgentKit applies before upload.
 * Unknown fields are refused too.
 */
import { findForbiddenProposalKey, validateOverlay } from "@skillx/contracts";
import type { KitSkillEntry, SkillOverlay } from "@skillx/contracts";
import { releaseError } from "~/lib/releases/release-http";
import { MAX_JSON_DEPTH, requireId } from "./kit-http";

export const PROPOSAL_SCHEMA = "skillx.kit-proposal/v1";
export const PROPOSAL_LIMITS = { maxPermissions: 64, maxSummaryBytes: 2048, maxSignals: 16 } as const;

export interface KitProposal {
  fromRevisionId: string;
  skill: { identity: string; base: KitSkillEntry["base"]; overlay: SkillOverlay; compositionDigest: string };
  declaredPermissions: string[];
  evidence: { summary: string; signals: Record<string, number> } | null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
export const proposalError = (code: string, message: string) => releaseError(422, code, message);
const invalid = (message: string) => proposalError("proposal.invalid", message);

/**
 * Refuses raw session data by key name at any depth, with the shared
 * `skillx.kit-proposal-policy/v1` rules (see `@skillx/contracts`); reports
 * the key path only.
 */
export function assertNoForbiddenKeys(value: unknown): void {
  const found = findForbiddenProposalKey(value, MAX_JSON_DEPTH);
  if (found === null) return;
  if (found.reason === "too_deep") throw invalid(`${found.path} nests deeper than ${MAX_JSON_DEPTH} levels`);
  throw proposalError("proposal.forbidden_field", `${found.path} is not accepted: proposals carry reviewed overlays only, never raw session data`);
}

function only(raw: Record<string, unknown>, at: string, fields: string[]): void {
  for (const key of Object.keys(raw)) if (!fields.includes(key)) throw invalid(`${at}.${key} is not a known field`);
}

const TOOL = /^[A-Za-z0-9_.:()*-]{1,128}$/;
const PERMISSION_PATH = /^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[^\s\\]{1,512}$/;

/** `allowed-tools:<tool>`, `allowed-tools:*`, `hooks`, `script:<path>`, `executable:<path>` (binary content is refused, so it needs no permission). */
export function isPermission(value: string): boolean {
  if (value === "hooks") return true;
  if (value.startsWith("allowed-tools:")) return TOOL.test(value.slice("allowed-tools:".length));
  const match = /^(script|executable):(.*)$/.exec(value);
  return match !== null && PERMISSION_PATH.test(match[2]!);
}

function readPermissions(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length > PROPOSAL_LIMITS.maxPermissions) throw invalid(`declaredPermissions must be an array of at most ${PROPOSAL_LIMITS.maxPermissions} entries`);
  for (const p of raw) if (typeof p !== "string" || !isPermission(p)) throw invalid("declaredPermissions has an entry that is not a known permission");
  if (new Set(raw).size !== raw.length) throw invalid("declaredPermissions repeats an entry");
  return [...(raw as string[])].sort();
}

function readEvidence(raw: unknown): KitProposal["evidence"] {
  if (raw === undefined) return null;
  if (!isRecord(raw)) throw invalid("evidence must be an object");
  only(raw, "evidence", ["summary", "signals"]);
  if (typeof raw.summary !== "string" || raw.summary.trim() === "") throw invalid("evidence.summary must be a non-empty string");
  if (new TextEncoder().encode(raw.summary).length > PROPOSAL_LIMITS.maxSummaryBytes) {
    throw proposalError("proposal.evidence_too_large", `evidence.summary must be at most ${PROPOSAL_LIMITS.maxSummaryBytes} bytes`);
  }
  const signals = raw.signals ?? {};
  if (!isRecord(signals) || Object.keys(signals).length > PROPOSAL_LIMITS.maxSignals) throw invalid(`evidence.signals must be an object of at most ${PROPOSAL_LIMITS.maxSignals} numbers`);
  for (const [k, v] of Object.entries(signals)) {
    if (!/^[a-z][a-z0-9_.-]{0,63}$/.test(k) || typeof v !== "number" || !Number.isFinite(v)) throw invalid("evidence.signals must map short lowercase names to finite numbers");
  }
  return { summary: raw.summary, signals: signals as Record<string, number> };
}

/** Validates the envelope strictly. Content checks (scan, permissions, base) happen against the stored lineage. */
export function readProposal(raw: unknown): KitProposal {
  if (!isRecord(raw)) throw invalid("proposal must be an object");
  assertNoForbiddenKeys(raw);
  only(raw, "proposal", ["schema", "fromRevisionId", "skill", "declaredPermissions", "evidence", "visibility"]);
  if (raw.schema !== PROPOSAL_SCHEMA) throw proposalError("schema.unsupported_version", `proposal.schema must be ${PROPOSAL_SCHEMA}`);
  if (raw.visibility !== "private") throw proposalError("proposal.private_only", "a session-derived proposal is private; visibility must be \"private\"");
  const skill = raw.skill;
  if (!isRecord(skill)) throw invalid("proposal.skill must be an object");
  only(skill, "proposal.skill", ["identity", "base", "overlay", "compositionDigest"]);
  if (typeof skill.identity !== "string" || typeof skill.compositionDigest !== "string" || !isRecord(skill.base)) {
    throw invalid("proposal.skill needs identity, base and compositionDigest");
  }
  const base = skill.base;
  only(base, "proposal.skill.base", ["package", "version", "releaseDigest"]);
  if (typeof base.package !== "string" || typeof base.version !== "string" || typeof base.releaseDigest !== "string") {
    throw invalid("proposal.skill.base needs package, version and releaseDigest");
  }
  return {
    fromRevisionId: requireId(raw.fromRevisionId, "fromRevisionId"),
    skill: {
      identity: skill.identity,
      base: { package: base.package, version: base.version, releaseDigest: base.releaseDigest },
      overlay: validateOverlay(skill.overlay, "proposal.skill.overlay"),
      compositionDigest: skill.compositionDigest,
    },
    declaredPermissions: readPermissions(raw.declaredPermissions),
    evidence: readEvidence(raw.evidence),
  };
}
