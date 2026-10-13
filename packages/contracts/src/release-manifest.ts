/**
 * `skillx.release/v1` signed release manifest contract.
 *
 * A release manifest pins one immutable package version to the canonical
 * `agentkit.skill-tree/v1` tree of its files. `releaseDigest` is the tree
 * digest and the release identity; `artifactDigest` covers only the bytes of
 * the transport archive. The registry signs the manifest with Ed25519 over
 * `releaseSigningPayload`: the canonical JSON (see `canonical-json.ts`) of
 * every member except `signature`, so `keyId` and `signatureAlgorithm` are
 * signed too. The signature is the standard (padded) base64 of the 64-byte
 * Ed25519 signature, as in AgentKit's remote registry manifests.
 *
 * Validators never throw on malformed input. Signing and verification use the
 * WebCrypto `Ed25519` algorithm, available in Workers, browsers and Node.js.
 */

import { ERROR_CODES, SkillTreeError, checkCollisions, checkPublisher, isNoisePath, validatePath } from "@skillx/skill-tree/rules";
import { canonicalJsonBytes } from "./canonical-json";
import {
  PACKAGE_NAME_PATTERN,
  RELEASE_CHANNELS,
  SEMVER_PATTERN,
  isPackageKind,
  isReleaseState,
  PACKAGE_KINDS,
  RELEASE_STATES,
} from "./package-manifest";
import type { PackageKind, ReleaseChannel, ReleaseState } from "./package-manifest";
import { isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

export const SKILLX_RELEASE_SCHEMA_VERSION = "skillx.release/v1";
export const RELEASE_SIGNATURE_ALGORITHM = "ed25519";

/** Mode classes of `agentkit.skill-tree/v1`. */
export const RELEASE_FILE_MODES = ["100644", "100755"] as const;
export type ReleaseFileMode = (typeof RELEASE_FILE_MODES)[number];

/**
 * How SkillX verified that the publisher owns its handle. `none` means the
 * release is not publisher-verified, so AgentKit trusts it as `local-unverified`.
 */
export const PUBLISHER_VERIFICATIONS = ["none", "github", "admin"] as const;
export type PublisherVerification = (typeof PUBLISHER_VERIFICATIONS)[number];

/** Same key ID rule as AgentKit remote registry manifests. */
export const RELEASE_KEY_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{1,63}$/;
/** Per-file content hash: bare lowercase hex SHA-256. */
export const FILE_SHA256_PATTERN = /^[a-f0-9]{64}$/;
/** A full SHA-1 or SHA-256 git object name in lowercase hex. */
export const SOURCE_COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
/** RFC 3339 UTC timestamp with whole seconds, e.g. `2026-10-13T04:30:00Z`. */
export const RELEASE_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
/** Padded standard base64 of a 64-byte Ed25519 signature. */
export const RELEASE_SIGNATURE_PATTERN = /^[A-Za-z0-9+/]{86}==$/;
const MAX_SOURCE_REPO_LENGTH = 512;

/** Tree limits of `agentkit.skill-tree/v1`; equal to `LIMITS` of `@skillx/skill-tree` (guarded by a test). */
export const RELEASE_TREE_LIMITS = {
  maxFiles: 4_096,
  maxFileSize: 32 * 1024 * 1024,
  maxTreeSize: 256 * 1024 * 1024,
} as const;

export interface ReleaseFile {
  path: string;
  mode: ReleaseFileMode;
  /** Lowercase hex SHA-256 of the file content. */
  sha256: string;
  size: number;
}

export interface ReleasePublisher {
  /** The publisher segment of `identity`. */
  handle: string;
  verifiedBy: PublisherVerification;
}

export interface ReleaseSourceProvenance {
  /** HTTPS URL of the source repository. */
  repo: string;
  commit: string;
  /** Package root inside the repository; `""` for the repository root. */
  path: string;
}

export interface UnsignedReleaseManifest {
  schemaVersion: typeof SKILLX_RELEASE_SCHEMA_VERSION;
  identity: string;
  version: string;
  channel: ReleaseChannel;
  kind: PackageKind;
  /** `treeDigest` of `files`: `sha256:<64 lowercase hex>`. */
  releaseDigest: string;
  /** Transport archive digest; never an identity. */
  artifactDigest: string;
  artifactSize: number;
  /** Sorted by the raw UTF-8 bytes of `path`. */
  files: ReleaseFile[];
  fileCount: number;
  treeSize: number;
  /** Release state at signing time; a state change is a newly signed manifest for the same digest. */
  state: ReleaseState;
  publisher: ReleasePublisher;
  /** `null` when the release was not packed from a recorded git commit. */
  sourceProvenance: ReleaseSourceProvenance | null;
  /** Paths of `files` the package declares as scripts, sorted like `files`. Never executed by SkillX. */
  declaredScripts: string[];
  createdAt: string;
  keyId: string;
  signatureAlgorithm: typeof RELEASE_SIGNATURE_ALGORITHM;
}

export interface SkillxReleaseManifest extends UnsignedReleaseManifest {
  signature: string;
}

const MANIFEST_FIELDS = [
  "schemaVersion",
  "identity",
  "version",
  "channel",
  "kind",
  "releaseDigest",
  "artifactDigest",
  "artifactSize",
  "files",
  "fileCount",
  "treeSize",
  "state",
  "publisher",
  "sourceProvenance",
  "declaredScripts",
  "createdAt",
  "keyId",
  "signatureAlgorithm",
] as const;
const FILE_FIELDS = ["path", "mode", "sha256", "size"] as const;
const PUBLISHER_FIELDS = ["handle", "verifiedBy"] as const;
const PROVENANCE_FIELDS = ["repo", "commit", "path"] as const;

/** Signature verification failure codes. */
export const RELEASE_SIGNATURE_CODES = {
  unknownKey: "signature.unknown_key",
  invalidKey: "signature.invalid_key",
  mismatch: "signature.mismatch",
} as const;

/** Thrown by `signReleaseManifest` for an invalid manifest or key. */
export class ReleaseManifestError extends Error {
  readonly issues: ValidationIssue[];
  constructor(message: string, issues: ValidationIssue[] = []) {
    super(issues.length === 0 ? message : `${message}: ${issues.map((i) => `${i.path} ${i.code}`).join(", ")}`);
    this.name = "ReleaseManifestError";
    this.issues = issues;
  }
}

/** Compares well-formed strings by UTF-8 bytes, which is code point order. */
export function compareUtf8(a: string, b: string): number {
  const ia = a[Symbol.iterator]();
  const ib = b[Symbol.iterator]();
  for (;;) {
    const ca = ia.next();
    const cb = ib.next();
    if (ca.done || cb.done) return ca.done && cb.done ? 0 : ca.done ? -1 : 1;
    const diff = ca.value.codePointAt(0)! - cb.value.codePointAt(0)!;
    if (diff !== 0) return diff < 0 ? -1 : 1;
  }
}

const isSize = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function checkFields(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  const prefix = path === "" ? "" : `${path}.`;
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(`${prefix}${key}`, "unknown_field", "is not a skillx.release/v1 field"));
  }
  for (const key of allowed) {
    if (!(key in value)) issues.push(issue(`${prefix}${key}`, "required", "is required"));
  }
}

function treeIssue(path: string, error: SkillTreeError): ValidationIssue {
  return issue(path, error.code, error.message);
}

function validateIdentityField(identity: unknown, issues: ValidationIssue[]): string | null {
  if (typeof identity !== "string" || !PACKAGE_NAME_PATTERN.test(identity)) {
    issues.push(issue("identity", "pattern", "must be '@publisher/slug' using lowercase slug characters"));
    return null;
  }
  try {
    // Every SkillX release comes from the `skillx` provider, so `@agentkit/*` is always reserved.
    checkPublisher(identity, "skillx");
  } catch (error) {
    if (!(error instanceof SkillTreeError)) throw error;
    issues.push(treeIssue("identity", error));
    return null;
  }
  return identity.slice(1, identity.indexOf("/"));
}

function validateFiles(files: unknown, issues: ValidationIssue[]): ReleaseFile[] | null {
  if (!Array.isArray(files)) {
    issues.push(issue("files", "type", "must be an array"));
    return null;
  }
  if (files.length === 0) issues.push(issue("files", ERROR_CODES.empty, "a release has at least one file"));
  if (files.length > RELEASE_TREE_LIMITS.maxFiles) {
    issues.push(issue("files", ERROR_CODES.limitExceeded, `has more than ${RELEASE_TREE_LIMITS.maxFiles} files`));
    return null;
  }
  const before = issues.length;
  let previous: string | null = null;
  files.forEach((file: unknown, i) => {
    const at = `files[${i}]`;
    if (!isPlainObject(file)) {
      issues.push(issue(at, "type", "must be an object"));
      return;
    }
    checkFields(file, FILE_FIELDS, at, issues);
    const { path, mode, sha256, size } = file;
    if (typeof path !== "string") {
      issues.push(issue(`${at}.path`, "type", "must be a string"));
    } else {
      const pathError = validatePath(path);
      if (pathError !== null) issues.push(treeIssue(`${at}.path`, pathError));
      else if (isNoisePath(path)) issues.push(issue(`${at}.path`, ERROR_CODES.unsafePath, "is excluded noise that no tree contains"));
      if (previous !== null) {
        const order = compareUtf8(previous, path);
        if (order === 0) issues.push(issue(`${at}.path`, "duplicate", `duplicates ${JSON.stringify(path)}`));
        else if (order > 0) issues.push(issue(`${at}.path`, "order", "files must be sorted by raw UTF-8 path bytes"));
      }
      previous = path;
    }
    if (!oneOf(RELEASE_FILE_MODES, mode)) {
      issues.push(issue(`${at}.mode`, "unsupported_value", `must be one of: ${RELEASE_FILE_MODES.join(", ")}`));
    }
    if (typeof sha256 !== "string" || !FILE_SHA256_PATTERN.test(sha256)) {
      issues.push(issue(`${at}.sha256`, "pattern", "must be 64 lowercase hex characters"));
    }
    if (!isSize(size)) issues.push(issue(`${at}.size`, "type", "must be a non-negative safe integer"));
    else if (size > RELEASE_TREE_LIMITS.maxFileSize) {
      issues.push(issue(`${at}.size`, ERROR_CODES.limitExceeded, `exceeds ${RELEASE_TREE_LIMITS.maxFileSize} bytes`));
    }
  });
  if (issues.length !== before) return null;
  const valid = files as ReleaseFile[];
  const collision = checkCollisions(valid.map((f) => f.path), []);
  if (collision !== null) {
    issues.push(treeIssue("files", collision));
    return null;
  }
  return valid;
}

function validatePublisher(publisher: unknown, handle: string | null, issues: ValidationIssue[]): void {
  if (!isPlainObject(publisher)) {
    issues.push(issue("publisher", "type", "must be an object"));
    return;
  }
  checkFields(publisher, PUBLISHER_FIELDS, "publisher", issues);
  if (typeof publisher.handle !== "string") {
    issues.push(issue("publisher.handle", "type", "must be a string"));
  } else if (handle !== null && publisher.handle !== handle) {
    issues.push(issue("publisher.handle", "mismatch", `must equal the identity publisher ${JSON.stringify(handle)}`));
  }
  if (!oneOf(PUBLISHER_VERIFICATIONS, publisher.verifiedBy)) {
    issues.push(issue("publisher.verifiedBy", "unsupported_value", `must be one of: ${PUBLISHER_VERIFICATIONS.join(", ")}`));
  }
}

function isHttpsRepo(value: unknown): boolean {
  if (typeof value !== "string" || value.length > MAX_SOURCE_REPO_LENGTH || !/^https:\/\/[\x21-\x7e]+$/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.username === "" && url.password === "" && url.hostname !== "";
  } catch {
    return false;
  }
}

function validateProvenance(provenance: unknown, issues: ValidationIssue[]): void {
  if (provenance === null) return;
  if (!isPlainObject(provenance)) {
    issues.push(issue("sourceProvenance", "type", "must be an object or null"));
    return;
  }
  checkFields(provenance, PROVENANCE_FIELDS, "sourceProvenance", issues);
  if (!isHttpsRepo(provenance.repo)) {
    issues.push(issue("sourceProvenance.repo", "format", `must be an https URL without credentials, at most ${MAX_SOURCE_REPO_LENGTH} characters`));
  }
  if (typeof provenance.commit !== "string" || !SOURCE_COMMIT_PATTERN.test(provenance.commit)) {
    issues.push(issue("sourceProvenance.commit", "pattern", "must be a full lowercase hex git commit"));
  }
  if (typeof provenance.path !== "string") {
    issues.push(issue("sourceProvenance.path", "type", "must be a string"));
  } else if (provenance.path !== "") {
    const pathError = validatePath(provenance.path);
    if (pathError !== null) issues.push(treeIssue("sourceProvenance.path", pathError));
  }
}

function validateDeclaredScripts(scripts: unknown, files: ReleaseFile[] | null, issues: ValidationIssue[]): void {
  if (!Array.isArray(scripts)) {
    issues.push(issue("declaredScripts", "type", "must be an array of file paths"));
    return;
  }
  const paths = files === null ? null : new Set(files.map((f) => f.path));
  let previous: string | null = null;
  scripts.forEach((script: unknown, i) => {
    const at = `declaredScripts[${i}]`;
    if (typeof script !== "string") {
      issues.push(issue(at, "type", "must be a string"));
      return;
    }
    if (paths !== null && !paths.has(script)) issues.push(issue(at, "not_found", "must name a path in files"));
    if (previous !== null && compareUtf8(previous, script) >= 0) {
      issues.push(issue(at, "order", "must be unique and sorted by raw UTF-8 path bytes"));
    }
    previous = script;
  });
}

function isReleaseTimestamp(value: unknown): boolean {
  if (typeof value !== "string" || !RELEASE_TIMESTAMP_PATTERN.test(value)) return false;
  const ms = Date.parse(value);
  // Round-tripping rejects calendar overflow such as 2026-02-30.
  return Number.isFinite(ms) && new Date(ms).toISOString() === `${value.slice(0, -1)}.000Z`;
}

function collectIssues(input: unknown, requireSignature: boolean): ValidationIssue[] {
  if (!isPlainObject(input)) return [issue("", "type", "release manifest must be an object")];
  const issues: ValidationIssue[] = [];
  checkFields(input, requireSignature ? [...MANIFEST_FIELDS, "signature"] : MANIFEST_FIELDS, "", issues);

  if (input.schemaVersion !== SKILLX_RELEASE_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "unsupported_value", `must equal '${SKILLX_RELEASE_SCHEMA_VERSION}'`));
  }
  const handle = validateIdentityField(input.identity, issues);
  if (typeof input.version !== "string" || !SEMVER_PATTERN.test(input.version)) {
    issues.push(issue("version", "pattern", "must be a semantic version such as '0.1.0'"));
  }
  if (!oneOf(RELEASE_CHANNELS, input.channel)) {
    issues.push(issue("channel", "unsupported_value", `must be one of: ${RELEASE_CHANNELS.join(", ")}`));
  }
  if (!isPackageKind(input.kind)) {
    issues.push(issue("kind", "unsupported_value", `must be one of: ${PACKAGE_KINDS.join(", ")}`));
  }
  for (const field of ["releaseDigest", "artifactDigest"] as const) {
    const value = input[field];
    if (typeof value !== "string" || !RELEASE_DIGEST_PATTERN.test(value)) {
      issues.push(issue(field, "pattern", "must match sha256:<64 lowercase hex>"));
    }
  }
  if (!isSize(input.artifactSize) || input.artifactSize === 0) {
    issues.push(issue("artifactSize", "type", "must be a positive safe integer"));
  }

  const files = validateFiles(input.files, issues);
  if (!isSize(input.fileCount)) {
    issues.push(issue("fileCount", "type", "must be a non-negative safe integer"));
  } else if (files !== null && input.fileCount !== files.length) {
    issues.push(issue("fileCount", "mismatch", "must equal the number of files"));
  }
  if (!isSize(input.treeSize)) {
    issues.push(issue("treeSize", "type", "must be a non-negative safe integer"));
  } else if (input.treeSize > RELEASE_TREE_LIMITS.maxTreeSize) {
    issues.push(issue("treeSize", ERROR_CODES.limitExceeded, `exceeds ${RELEASE_TREE_LIMITS.maxTreeSize} bytes`));
  } else if (files !== null && input.treeSize !== files.reduce((sum, f) => sum + f.size, 0)) {
    issues.push(issue("treeSize", "mismatch", "must equal the sum of file sizes"));
  }

  if (!isReleaseState(input.state)) {
    issues.push(issue("state", "unsupported_value", `must be one of: ${RELEASE_STATES.join(", ")}`));
  }
  validatePublisher(input.publisher, handle, issues);
  validateProvenance(input.sourceProvenance, issues);
  validateDeclaredScripts(input.declaredScripts, files, issues);
  if (!isReleaseTimestamp(input.createdAt)) {
    issues.push(issue("createdAt", "format", "must be an RFC 3339 UTC timestamp with whole seconds, e.g. 2026-10-13T04:30:00Z"));
  }
  if (typeof input.keyId !== "string" || !RELEASE_KEY_ID_PATTERN.test(input.keyId)) {
    issues.push(issue("keyId", "pattern", `must match ${RELEASE_KEY_ID_PATTERN.source}`));
  }
  if (input.signatureAlgorithm !== RELEASE_SIGNATURE_ALGORITHM) {
    issues.push(issue("signatureAlgorithm", "unsupported_value", `must equal '${RELEASE_SIGNATURE_ALGORITHM}'`));
  }
  if (requireSignature && "signature" in input) {
    if (typeof input.signature !== "string" || !RELEASE_SIGNATURE_PATTERN.test(input.signature)) {
      issues.push(issue("signature", "pattern", "must be padded base64 of a 64-byte Ed25519 signature"));
    }
  }
  return issues;
}

/** Validates a signed `skillx.release/v1` manifest (structure only, not the signature). */
export function validateReleaseManifest(input: unknown): ValidationResult {
  const issues = collectIssues(input, true);
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/** Validates a manifest before it is signed: every field except `signature`, which must be absent. */
export function validateUnsignedReleaseManifest(input: unknown): ValidationResult {
  const issues = collectIssues(input, false);
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

/**
 * The exact bytes an Ed25519 release signature covers: the canonical JSON of
 * the manifest without its `signature` member, UTF-8 encoded.
 */
export function releaseSigningPayload(manifest: UnsignedReleaseManifest | SkillxReleaseManifest): Uint8Array<ArrayBuffer> {
  const { signature: _signature, ...payload } = manifest as Partial<SkillxReleaseManifest>;
  return canonicalJsonBytes(payload);
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

const ED25519 = { name: "Ed25519" } as const;
const ED25519_PUBLIC_KEY_BYTES = 32;

/**
 * Signs a valid unsigned manifest with an Ed25519 private key. The key ID and
 * algorithm are part of the signed payload. Throws `ReleaseManifestError` when
 * the manifest is invalid or the key cannot sign with Ed25519.
 */
export async function signReleaseManifest(
  manifest: UnsignedReleaseManifest,
  privateKey: CryptoKey,
): Promise<SkillxReleaseManifest> {
  const result = validateUnsignedReleaseManifest(manifest);
  if (!result.valid) throw new ReleaseManifestError("invalid release manifest", result.issues);
  let signature: ArrayBuffer;
  try {
    signature = await crypto.subtle.sign(ED25519, privateKey, releaseSigningPayload(manifest));
  } catch (cause) {
    throw new ReleaseManifestError(`cannot sign with the given key: ${cause instanceof Error ? cause.message : String(cause)}`);
  }
  return { ...manifest, signature: toBase64(new Uint8Array(signature)) };
}

/** A key set: key ID to raw 32-byte Ed25519 public key. */
export type ReleasePublicKeys = ReadonlyMap<string, Uint8Array>;

/**
 * Validates a signed manifest and verifies its signature against `publicKeys`.
 * Fails closed: an invalid manifest, unknown key ID, malformed key or bad
 * signature is an invalid result, never an exception.
 */
export async function verifyReleaseManifest(input: unknown, publicKeys: ReleasePublicKeys): Promise<ValidationResult> {
  const structure = validateReleaseManifest(input);
  if (!structure.valid) return structure;
  const manifest = input as SkillxReleaseManifest;
  const raw = publicKeys.get(manifest.keyId);
  if (raw === undefined) {
    return validationFail([issue("keyId", RELEASE_SIGNATURE_CODES.unknownKey, `no trusted key ${JSON.stringify(manifest.keyId)}`)]);
  }
  if (raw.length !== ED25519_PUBLIC_KEY_BYTES) {
    return validationFail([issue("keyId", RELEASE_SIGNATURE_CODES.invalidKey, `key ${JSON.stringify(manifest.keyId)} is not 32 bytes`)]);
  }
  let verified = false;
  try {
    const key = await crypto.subtle.importKey("raw", new Uint8Array(raw), ED25519, false, ["verify"]);
    verified = await crypto.subtle.verify(ED25519, key, fromBase64(manifest.signature), releaseSigningPayload(manifest));
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    return validationFail([issue("keyId", RELEASE_SIGNATURE_CODES.invalidKey, `key ${JSON.stringify(manifest.keyId)} is unusable: ${detail}`)]);
  }
  return verified
    ? validationOk()
    : validationFail([issue("signature", RELEASE_SIGNATURE_CODES.mismatch, "signature does not verify for the canonical payload")]);
}
