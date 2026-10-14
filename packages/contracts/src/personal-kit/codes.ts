/**
 * Schemas, error codes and rebase categories of personal kits.
 *
 * The overlay envelope `agentkit.skill-overlay/v1`, the resolution record
 * `agentkit.skill-overlay-resolution/v1` and the rebase category strings are
 * AgentKit-owned (AgentKit skill lifecycle schemas section 6 and the
 * personal-kit contract); SkillX stores and verifies them and never extends
 * them in place. `skillx.personal-kit/v1` and `skillx.personal-kit-lock/v1`
 * are the SkillX revision and lock documents that carry them.
 */

export const OVERLAY_SCHEMA = "agentkit.skill-overlay/v1";
export const RESOLUTION_SCHEMA = "agentkit.skill-overlay-resolution/v1";
export const PERSONAL_KIT_SCHEMA = "skillx.personal-kit/v1";
export const PERSONAL_KIT_LOCK_SCHEMA = "skillx.personal-kit-lock/v1";
/** Version of the deterministic resolver; a change in composition semantics bumps it. */
export const KIT_RESOLVER_VERSION = "skillx.kit-resolver/1";

/** Contract error codes (AgentKit section 11 plus SkillX `kit.*`). Callers branch on the code. */
export const KIT_CODES = {
  overlayConflict: "overlay.conflict",
  overlayInvalid: "overlay.invalid",
  unsupportedVersion: "schema.unsupported_version",
  documentInvalid: "kit.invalid",
  duplicateIdentity: "kit.duplicate_identity",
  modeViolation: "kit.mode_violation",
  aliasCollision: "kit.alias_collision",
  sharedAliasOverlay: "kit.shared_alias_overlay",
  cycle: "kit.cycle",
  multiParent: "kit.multi_parent",
  compositionMismatch: "kit.composition_digest_mismatch",
  publicDerivative: "kit.public_derivative_forbidden",
  baseUnavailable: "kit.base_unavailable",
} as const;

export type KitCode = (typeof KIT_CODES)[keyof typeof KIT_CODES];

/**
 * Rebase finding categories (AgentKit personal-kit contract). Every category
 * outside `clean.*` stops the rebase for review with `overlay.conflict`.
 */
export const REBASE_CATEGORIES = [
  "clean.untouched",
  "clean.disjoint",
  "conflict.same_hunk",
  "conflict.renamed_or_deleted",
  "conflict.added_both",
  "conflict.dependency_removed",
  "conflict.dependency_missing",
  "conflict.script_changed",
  "conflict.mode_changed",
  "conflict.capability_escalation",
  "conflict.capability_downgrade",
  "conflict.exposure_changed",
  "conflict.license_changed",
  "conflict.entitlement",
  "conflict.ambiguous_provider",
  "conflict.revoked_base",
] as const;

export type RebaseCategory = (typeof REBASE_CATEGORIES)[number];

export const isCleanCategory = (category: RebaseCategory) => category.startsWith("clean.");

/** A classified personal-kit failure. `path` names the offending field or tree path. */
export class PersonalKitError extends Error {
  readonly code: string;
  readonly path: string;
  readonly detail: string;

  constructor(code: string, path: string, detail: string) {
    super(path === "" ? `${code}: ${detail}` : `${code}: ${path}: ${detail}`);
    this.name = "PersonalKitError";
    this.code = code;
    this.path = path;
    this.detail = detail;
  }
}

export const kitError = (code: string, path: string, detail: string) => new PersonalKitError(code, path, detail);
