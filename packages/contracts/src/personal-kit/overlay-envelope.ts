/**
 * `agentkit.skill-overlay/v1` envelope (AgentKit skill lifecycle schemas
 * section 6), validated strictly: unknown fields are refused, `ops` are
 * sorted by the raw UTF-8 bytes of `path` with one op per path, every path
 * passes the tree path rules, content is canonical padded base64.
 *
 * - `add`: path absent from the base; `contentBase64`, optional `mode` (default `100644`).
 * - `replace`: `expectSha256` of the base file, `contentBase64`, optional
 *   `mode` (default: the base file's mode).
 * - `delete`: `expectSha256`.
 * - `patch`: `expectSha256` and an exact unified diff in `patch` (text files only).
 */
import { compareUtf8, validatePath } from "@skillx/skill-tree/rules";
import { KIT_CODES, OVERLAY_SCHEMA, kitError } from "./codes";
import { decodeBase64 } from "./bytes";

export const OVERLAY_OPS = ["add", "replace", "delete", "patch"] as const;
export type OverlayOpKind = (typeof OVERLAY_OPS)[number];
export type OverlayMode = "100644" | "100755";

export interface OverlayOp {
  op: OverlayOpKind;
  path: string;
  contentBase64?: string;
  mode?: OverlayMode;
  expectSha256?: string;
  patch?: string;
}

export interface SkillOverlay {
  schema: typeof OVERLAY_SCHEMA;
  /** `treeDigest` of the base tree the ops apply to. */
  baseTreeDigest: string;
  ops: OverlayOp[];
}

export const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
export const SHA256_HEX_PATTERN = /^[0-9a-f]{64}$/;

/** Bounds of one envelope; equal to the tree contract file limits. */
export const OVERLAY_LIMITS = { maxOps: 4_096, maxPatchBytes: 1024 * 1024, maxContentBytes: 32 * 1024 * 1024 } as const;

const FIELDS: Readonly<Record<OverlayOpKind, { required: string[]; optional: string[] }>> = {
  add: { required: ["contentBase64"], optional: ["mode"] },
  replace: { required: ["expectSha256", "contentBase64"], optional: ["mode"] },
  delete: { required: ["expectSha256"], optional: [] },
  patch: { required: ["expectSha256", "patch"], optional: [] },
};

const invalid = (path: string, detail: string) => kitError(KIT_CODES.overlayInvalid, path, detail);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function checkOp(raw: unknown, at: string): OverlayOp {
  if (!isRecord(raw)) throw invalid(at, "op must be an object");
  const kind = raw.op;
  if (typeof kind !== "string" || !(OVERLAY_OPS as readonly string[]).includes(kind)) {
    throw invalid(`${at}.op`, `must be one of: ${OVERLAY_OPS.join(", ")}`);
  }
  const rule = FIELDS[kind as OverlayOpKind];
  const allowed = new Set(["op", "path", ...rule.required, ...rule.optional]);
  for (const key of Object.keys(raw)) if (!allowed.has(key)) throw invalid(`${at}.${key}`, `is not a field of a ${kind} op`);
  for (const key of rule.required) if (raw[key] === undefined) throw invalid(`${at}.${key}`, `is required for a ${kind} op`);
  if (typeof raw.path !== "string") throw invalid(`${at}.path`, "must be a string");
  const pathError = validatePath(raw.path);
  if (pathError !== null) throw kitError(pathError.code, `${at}.path`, pathError.detail);
  if (raw.mode !== undefined && raw.mode !== "100644" && raw.mode !== "100755") throw invalid(`${at}.mode`, "must be 100644 or 100755");
  if (raw.expectSha256 !== undefined && (typeof raw.expectSha256 !== "string" || !SHA256_HEX_PATTERN.test(raw.expectSha256))) {
    throw invalid(`${at}.expectSha256`, "must be 64 lowercase hex characters");
  }
  if (raw.contentBase64 !== undefined) {
    if (typeof raw.contentBase64 !== "string" || raw.contentBase64.length > (OVERLAY_LIMITS.maxContentBytes / 3) * 4 + 4) {
      throw invalid(`${at}.contentBase64`, "must be base64 of at most 32 MiB");
    }
    if (decodeBase64(raw.contentBase64) === null) throw invalid(`${at}.contentBase64`, "must be canonical padded standard base64");
  }
  if (raw.patch !== undefined) {
    if (typeof raw.patch !== "string" || raw.patch === "") throw invalid(`${at}.patch`, "must be a non-empty unified diff");
    if (new TextEncoder().encode(raw.patch).length > OVERLAY_LIMITS.maxPatchBytes) throw invalid(`${at}.patch`, "exceeds 1 MiB");
  }
  return raw as unknown as OverlayOp;
}

/** Validates an envelope and returns it typed. Throws `PersonalKitError`. */
export function validateOverlay(input: unknown, at = "overlay"): SkillOverlay {
  if (!isRecord(input)) throw invalid(at, "overlay must be an object");
  if (typeof input.schema === "string" && input.schema.startsWith("agentkit.skill-overlay/") && input.schema !== OVERLAY_SCHEMA) {
    throw kitError(KIT_CODES.unsupportedVersion, `${at}.schema`, `unsupported overlay schema ${input.schema}`);
  }
  if (input.schema !== OVERLAY_SCHEMA) throw invalid(`${at}.schema`, `must be ${OVERLAY_SCHEMA}`);
  for (const key of Object.keys(input)) if (!["schema", "baseTreeDigest", "ops"].includes(key)) throw invalid(`${at}.${key}`, "is not an overlay field");
  if (typeof input.baseTreeDigest !== "string" || !DIGEST_PATTERN.test(input.baseTreeDigest)) {
    throw invalid(`${at}.baseTreeDigest`, "must be sha256:<64 lowercase hex>");
  }
  if (!Array.isArray(input.ops) || input.ops.length > OVERLAY_LIMITS.maxOps) throw invalid(`${at}.ops`, `must be an array of at most ${OVERLAY_LIMITS.maxOps} ops`);
  const ops = input.ops.map((op, i) => checkOp(op, `${at}.ops[${i}]`));
  for (let i = 1; i < ops.length; i++) {
    const order = compareUtf8(ops[i - 1]!.path, ops[i]!.path);
    if (order === 0) throw invalid(`${at}.ops[${i}].path`, "duplicates the path of the previous op");
    if (order > 0) throw invalid(`${at}.ops[${i}].path`, "ops must be sorted by the UTF-8 bytes of path");
  }
  return { schema: OVERLAY_SCHEMA, baseTreeDigest: input.baseTreeDigest, ops };
}

/** An overlay with no ops: the composition equals the base tree. */
export const emptyOverlay = (baseTreeDigest: string): SkillOverlay => ({ schema: OVERLAY_SCHEMA, baseTreeDigest, ops: [] });

/** Sorts ops into envelope order (used when building a candidate). */
export const sortOps = (ops: OverlayOp[]): OverlayOp[] => [...ops].sort((a, b) => compareUtf8(a.path, b.path));
