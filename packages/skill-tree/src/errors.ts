/**
 * Contract error codes of `agentkit.skill-tree/v1` and package identity
 * (AgentKit skill lifecycle contract, section 11). Callers branch on `code`,
 * never on the message text.
 */
export const ERROR_CODES = {
  identityInvalid: "identity.invalid",
  identityReservedPublisher: "identity.reserved_publisher",
  identityReservedAlias: "identity.reserved_alias",
  unsafePath: "tree.unsafe_path",
  nonNfcPath: "tree.non_nfc_path",
  caseCollision: "tree.case_collision",
  unsupportedEntry: "tree.unsupported_entry",
  limitExceeded: "tree.limit_exceeded",
  empty: "tree.empty",
  readFailed: "tree.read_failed",
} as const;

export type SkillTreeErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

/** A classified contract failure. `path` names the offending tree path when one exists. */
export class SkillTreeError extends Error {
  readonly code: SkillTreeErrorCode;
  readonly path: string;
  readonly detail: string;

  constructor(code: SkillTreeErrorCode, path: string, detail: string, options?: { cause?: unknown }) {
    super(path === "" ? `${code}: ${detail}` : `${code}: ${JSON.stringify(path)}: ${detail}`, options);
    this.name = "SkillTreeError";
    this.code = code;
    this.path = path;
    this.detail = detail;
  }
}

export function treeError(code: SkillTreeErrorCode, path: string, detail: string): SkillTreeError {
  return new SkillTreeError(code, path, detail);
}

export function isSkillTreeError(value: unknown): value is SkillTreeError {
  return value instanceof SkillTreeError;
}
