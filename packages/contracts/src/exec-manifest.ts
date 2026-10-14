/**
 * `agentkit.skill-exec/v1`: the optional exec manifest a package carries at
 * its tree root as `agentkit-exec.json`. It names the scripts AgentKit's
 * broker may run and the capabilities each one requests. The file is part of
 * the tree, so the release digest covers it; SkillX rejects a malformed one
 * at publish and stores a parsed summary.
 *
 * The shape follows AgentKit's EX-0/EX-1 draft (decision D1). Align with the
 * AgentKit conformance vectors once they are published. Newer schema majors
 * are accepted unvalidated (see `validateExecManifest`).
 */
import { canonicalJsonBytes } from "./canonical-json";
import { checkNameList, EXEC_NAME_PATTERN, unknownFields, validateExecCapabilities } from "./exec-capabilities";
import type { ExecCapabilities } from "./exec-capabilities";
import { sha256Digest } from "./release-signature";
import { satisfiesRange } from "./semver-range";
import { parseStrictJson } from "./strict-json";
import { issue, isPlainObject } from "./validation";
import type { ValidationIssue } from "./validation";

export const EXEC_MANIFEST_PATH = "agentkit-exec.json";
export const SKILL_EXEC_SCHEMA_VERSION = "agentkit.skill-exec/v1";
export const EXEC_MANIFEST_MAX_BYTES = 64 * 1024;
export const EXEC_MAX_ENTRYPOINTS = 32;
export const EXEC_INTERPRETERS = ["python3", "node", "sh"] as const;
export const EXEC_ARG_CEILINGS = { maxCount: 64, maxBytes: 65536 } as const;
export const EXEC_DEPENDENCY_KINDS = ["none", "python-lock", "node-lock"] as const;
export const EXEC_MANIFEST_CODES = {
  invalid: "exec.manifest_invalid",
  undeclared: "exec.entrypoint_undeclared",
} as const;

export interface ExecInterpreter {
  name: (typeof EXEC_INTERPRETERS)[number];
  version?: string;
}

export interface ExecEntrypoint {
  name: string;
  path: string;
  interpreter: ExecInterpreter;
  args?: { maxCount: number; maxBytes: number };
  inputs?: string[];
  capabilities: ExecCapabilities;
}

export interface ExecDependencies {
  kind: (typeof EXEC_DEPENDENCY_KINDS)[number];
  lockfile?: string;
}

export interface ExecManifest {
  schemaVersion: typeof SKILL_EXEC_SCHEMA_VERSION;
  entrypoints: ExecEntrypoint[];
  dependencies?: ExecDependencies;
}

export interface ExecManifestTree {
  /** Every regular file path of the verified tree. */
  files: ReadonlySet<string>;
  /** The release's `declaredScripts`; every entrypoint must be one of them. */
  declaredScripts: readonly string[];
}

/** A schema `agentkit.skill-exec/vN` with N > 1: newer than this validator, accepted without validation. */
export const EXEC_FUTURE_SCHEMA_PATTERN = /^agentkit\.skill-exec\/v([1-9][0-9]*)$/;

export type ExecManifestResult =
  | { ok: true; manifest: ExecManifest }
  | { ok: true; manifest: null; schemaVersion: string }
  | { ok: false; code: (typeof EXEC_MANIFEST_CODES)[keyof typeof EXEC_MANIFEST_CODES]; issues: ValidationIssue[] };

const ENTRYPOINT_FIELDS = ["name", "path", "interpreter", "args", "inputs", "capabilities"];

function nested(prefix: string, found: ValidationIssue[]): ValidationIssue[] {
  return found.map((i) => ({ ...i, path: i.path === "" ? prefix : `${prefix}.${i.path}` }));
}

function checkInterpreter(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "type", "must be an object with a name"));
    return;
  }
  unknownFields(value, ["name", "version"], path, issues);
  if (!(EXEC_INTERPRETERS as readonly unknown[]).includes(value.name)) {
    issues.push(issue(`${path}.name`, "unsupported_value", `must be one of ${EXEC_INTERPRETERS.join(", ")}`));
  }
  if (value.version !== undefined && (typeof value.version !== "string" || value.version.trim() === "" || satisfiesRange("0.0.0", value.version) === null)) {
    issues.push(issue(`${path}.version`, "pattern", "must be a version range"));
  }
}

function checkArgs(value: unknown, path: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "type", "must be an object"));
    return;
  }
  unknownFields(value, Object.keys(EXEC_ARG_CEILINGS), path, issues);
  for (const [name, ceiling] of Object.entries(EXEC_ARG_CEILINGS)) {
    const n = value[name];
    if (!Number.isSafeInteger(n) || (n as number) < 0 || (n as number) > ceiling) {
      issues.push(issue(`${path}.${name}`, "range", `must be an integer from 0 to ${ceiling}`));
    }
  }
}

function checkEntrypoint(value: unknown, path: string, tree: ExecManifestTree, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push(issue(path, "type", "must be an object"));
    return;
  }
  unknownFields(value, ENTRYPOINT_FIELDS, path, issues);
  if (typeof value.name !== "string" || !EXEC_NAME_PATTERN.test(value.name)) {
    issues.push(issue(`${path}.name`, "pattern", `must match ${EXEC_NAME_PATTERN.source}`));
  }
  if (typeof value.path !== "string" || !tree.files.has(value.path)) {
    issues.push(issue(`${path}.path`, "not_in_tree", "must name a regular file of the package tree"));
  } else if (!tree.declaredScripts.includes(value.path)) {
    issues.push(issue(`${path}.path`, EXEC_MANIFEST_CODES.undeclared, "must be listed in declaredScripts"));
  }
  checkInterpreter(value.interpreter, `${path}.interpreter`, issues);
  if (value.args !== undefined) checkArgs(value.args, `${path}.args`, issues);
  const inputs = new Set<string>();
  if (value.inputs !== undefined && checkNameList(value.inputs, `${path}.inputs`, (n) => EXEC_NAME_PATTERN.test(n), "an input name", issues)) {
    for (const name of value.inputs) inputs.add(name);
  }
  issues.push(...nested(`${path}.capabilities`, validateExecCapabilities(value.capabilities, inputs)));
}

function checkDependencies(value: unknown, tree: ExecManifestTree, issues: ValidationIssue[]): void {
  if (!isPlainObject(value)) {
    issues.push(issue("dependencies", "type", "must be an object with a kind"));
    return;
  }
  unknownFields(value, ["kind", "lockfile"], "dependencies", issues);
  if (!(EXEC_DEPENDENCY_KINDS as readonly unknown[]).includes(value.kind)) {
    issues.push(issue("dependencies.kind", "unsupported_value", `must be one of ${EXEC_DEPENDENCY_KINDS.join(", ")}`));
  } else if (value.kind === "none") {
    if (value.lockfile !== undefined) issues.push(issue("dependencies.lockfile", "unexpected", "must be absent when kind is none"));
  } else if (typeof value.lockfile !== "string" || !tree.files.has(value.lockfile)) {
    issues.push(issue("dependencies.lockfile", "not_in_tree", "must name a regular file of the package tree"));
  }
}

function fail(issues: ValidationIssue[]): ExecManifestResult {
  const onlyUndeclared = issues.every((i) => i.code === EXEC_MANIFEST_CODES.undeclared);
  return { ok: false, code: onlyUndeclared ? EXEC_MANIFEST_CODES.undeclared : EXEC_MANIFEST_CODES.invalid, issues };
}

/**
 * Parses and validates `agentkit-exec.json` bytes against the package tree.
 * v1 is validated strictly. A newer `agentkit.skill-exec/vN` is returned
 * with `manifest: null` so a publish is not blocked on this validator
 * lagging AgentKit; the caller stores it as unvalidated. Never throws.
 */
export function validateExecManifest(bytes: Uint8Array, tree: ExecManifestTree): ExecManifestResult {
  if (bytes.byteLength > EXEC_MANIFEST_MAX_BYTES) {
    return fail([issue("", "max_bytes", `must be at most ${EXEC_MANIFEST_MAX_BYTES} bytes`)]);
  }
  const parsed = parseStrictJson(bytes);
  if (!parsed.ok) return fail([issue("", "syntax", `document ${parsed.reason}`)]);
  const doc = parsed.value;
  if (!isPlainObject(doc)) return fail([issue("", "type", "must be a JSON object")]);
  const issues: ValidationIssue[] = [];
  if (typeof doc.schemaVersion === "string" && doc.schemaVersion !== SKILL_EXEC_SCHEMA_VERSION && EXEC_FUTURE_SCHEMA_PATTERN.test(doc.schemaVersion)) {
    return { ok: true, manifest: null, schemaVersion: doc.schemaVersion };
  }
  if (doc.schemaVersion !== SKILL_EXEC_SCHEMA_VERSION) {
    const code = typeof doc.schemaVersion === "string" && doc.schemaVersion.startsWith("agentkit.skill-exec/") ? "unsupported_version" : "unsupported_value";
    return fail([issue("schemaVersion", code, `must be ${SKILL_EXEC_SCHEMA_VERSION}`)]);
  }
  unknownFields(doc, ["schemaVersion", "entrypoints", "dependencies"], "", issues);
  const entrypoints = doc.entrypoints;
  if (!Array.isArray(entrypoints) || entrypoints.length === 0 || entrypoints.length > EXEC_MAX_ENTRYPOINTS) {
    issues.push(issue("entrypoints", "type", `must be an array of 1 to ${EXEC_MAX_ENTRYPOINTS} entrypoints`));
  } else {
    const names = new Set<unknown>();
    entrypoints.forEach((entry, i) => {
      checkEntrypoint(entry, `entrypoints[${i}]`, tree, issues);
      const name = isPlainObject(entry) ? entry.name : undefined;
      if (names.has(name)) issues.push(issue(`entrypoints[${i}].name`, "duplicate", "is used by another entrypoint"));
      names.add(name);
    });
  }
  if (doc.dependencies !== undefined) checkDependencies(doc.dependencies, tree, issues);
  return issues.length === 0 ? { ok: true, manifest: doc as unknown as ExecManifest } : fail(issues);
}

/** sha256 of the canonical JSON of one entrypoint's capability block and interpreter. */
export function execCapabilityDigest(entrypoint: ExecEntrypoint): Promise<string> {
  return sha256Digest(canonicalJsonBytes({ capabilities: entrypoint.capabilities, interpreter: entrypoint.interpreter }));
}
