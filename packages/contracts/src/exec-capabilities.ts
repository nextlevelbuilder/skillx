/**
 * The capability block of one `agentkit.skill-exec/v1` entrypoint. A block
 * only declares what a script asks for; AgentKit's broker denies by default
 * and decides what to grant. SkillX checks the shape at publish so a
 * malformed request never ships, and records it in the release summary.
 */
import { issue, isPlainObject } from "./validation";
import type { ValidationIssue } from "./validation";

export const EXEC_FILESYSTEM_READ_ROOTS = ["$PACKAGE"] as const;
export const EXEC_FILESYSTEM_WRITE_ROOTS = ["$OUTPUT", "$TMP"] as const;
/** Hard ceilings; a manifest asking for more is malformed, not merely refused. */
export const EXEC_LIMIT_CEILINGS = {
  wallSeconds: 3600,
  cpuSeconds: 3600,
  memoryMiB: 8192,
  processes: 256,
  outputBytes: 64 * 1024 * 1024,
} as const;
export const EXEC_MAX_LIST_ITEMS = 32;
export const EXEC_NAME_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const EXEC_ENV_NAME_PATTERN = /^[A-Z_][A-Z0-9_]{0,63}$/;
const HOST_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
/** Lowercase DNS names with at least two labels; no IP literal, port or wildcard. */
export const EXEC_HOST_PATTERN = new RegExp(`^(?=.{1,253}$)${HOST_LABEL}(?:\\.${HOST_LABEL})+$`);

export type ExecLimits = { [K in keyof typeof EXEC_LIMIT_CEILINGS]: number };

export interface ExecCapabilities {
  filesystem: { read: string[]; write: string[] };
  network: { hosts: string[] };
  subprocess: boolean;
  env: string[];
  secrets: string[];
  limits: ExecLimits;
}

const CAPABILITY_FIELDS = ["filesystem", "network", "subprocess", "env", "secrets", "limits"];

export function unknownFields(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(path === "" ? key : `${path}.${key}`, "unknown_field", "is not part of the schema"));
  }
}

/** Checks a list of unique strings each matching `test`; returns true when it is well formed. */
export function checkNameList(
  value: unknown,
  path: string,
  test: (item: string) => boolean,
  rule: string,
  issues: ValidationIssue[],
): value is string[] {
  if (!Array.isArray(value)) {
    issues.push(issue(path, "type", "must be an array of strings"));
    return false;
  }
  if (value.length > EXEC_MAX_LIST_ITEMS) issues.push(issue(path, "max_items", `must hold at most ${EXEC_MAX_LIST_ITEMS} items`));
  const seen = new Set<string>();
  let ok = value.length <= EXEC_MAX_LIST_ITEMS;
  value.forEach((item, i) => {
    if (typeof item !== "string" || !test(item)) {
      issues.push(issue(`${path}[${i}]`, "pattern", `must be ${rule}`));
      ok = false;
    } else if (seen.has(item)) {
      issues.push(issue(`${path}[${i}]`, "duplicate", "is listed twice"));
      ok = false;
    } else {
      seen.add(item);
    }
  });
  return ok;
}

function checkFilesystem(value: unknown, inputs: ReadonlySet<string>, issues: ValidationIssue[]): void {
  const path = "filesystem";
  if (!isPlainObject(value)) {
    issues.push(issue(path, "type", "must be an object with read and write lists"));
    return;
  }
  unknownFields(value, ["read", "write"], path, issues);
  const readable = (root: string) =>
    (EXEC_FILESYSTEM_READ_ROOTS as readonly string[]).includes(root) ||
    (root.startsWith("$INPUT:") && inputs.has(root.slice("$INPUT:".length)));
  checkNameList(value.read, `${path}.read`, readable, "$PACKAGE or $INPUT:<declared input>", issues);
  const writable = (root: string) => (EXEC_FILESYSTEM_WRITE_ROOTS as readonly string[]).includes(root);
  checkNameList(value.write, `${path}.write`, writable, "$OUTPUT or $TMP", issues);
}

function checkLimits(value: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push(issue("limits", "type", "must be an object"));
    return;
  }
  const names = Object.keys(EXEC_LIMIT_CEILINGS) as (keyof ExecLimits)[];
  unknownFields(value, names, "limits", issues);
  for (const name of names) {
    const limit = value[name];
    const ceiling = EXEC_LIMIT_CEILINGS[name];
    if (limit === undefined) issues.push(issue(`limits.${name}`, "required", "is required"));
    else if (!Number.isSafeInteger(limit) || (limit as number) < 1) issues.push(issue(`limits.${name}`, "type", "must be a positive integer"));
    else if ((limit as number) > ceiling) issues.push(issue(`limits.${name}`, "maximum", `must be at most ${ceiling}`));
  }
}

/** Validates one capability block; issue paths are relative to the block. */
export function validateExecCapabilities(value: unknown, inputs: ReadonlySet<string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!isPlainObject(value)) return [issue("", "type", "must be an object")];
  unknownFields(value, CAPABILITY_FIELDS, "", issues);
  for (const field of CAPABILITY_FIELDS) {
    if (value[field] === undefined) issues.push(issue(field, "required", "is required"));
  }
  if (value.filesystem !== undefined) checkFilesystem(value.filesystem, inputs, issues);
  if (value.network !== undefined) {
    if (!isPlainObject(value.network)) issues.push(issue("network", "type", "must be an object with a hosts list"));
    else {
      unknownFields(value.network, ["hosts"], "network", issues);
      checkNameList(value.network.hosts, "network.hosts", (h) => EXEC_HOST_PATTERN.test(h), "a lowercase DNS host name", issues);
    }
  }
  if (value.subprocess !== undefined && typeof value.subprocess !== "boolean") issues.push(issue("subprocess", "type", "must be a boolean"));
  const envName = (n: string) => EXEC_ENV_NAME_PATTERN.test(n);
  if (value.env !== undefined) checkNameList(value.env, "env", envName, "an upper-case environment name", issues);
  if (value.secrets !== undefined) checkNameList(value.secrets, "secrets", envName, "an upper-case secret name", issues);
  if (value.limits !== undefined) checkLimits(value.limits, issues);
  return issues;
}
