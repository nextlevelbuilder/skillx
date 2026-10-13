/**
 * `skillx.release/v1` signed release manifest contract.
 *
 * A release manifest pins one immutable package version to the canonical
 * `agentkit.skill-tree/v1` tree of its files. `releaseDigest` is the tree
 * digest and the release identity; `artifactDigest` covers only the bytes of
 * the transport archive. The manifest is signed once per `releaseDigest` and
 * never changes; the mutable release state lives in the separately signed
 * `skillx.release-status/v1` document (`release-status.ts`). Signature rules
 * are in `release-signature.ts`: Ed25519 over the canonical JSON of every
 * member except `signature`. `releaseDigest` must equal the tree digest of
 * `files`; signing and verification both enforce it.
 *
 * Validators and verifiers never throw, whatever the input.
 */

import {
  ERROR_CODES,
  SkillTreeError,
  checkCollisions,
  checkPublisher,
  compareUtf8,
  isNoisePath,
  serializeTree,
  validatePath,
} from "@skillx/skill-tree/rules";
import { canonicalJsonBytes } from "./canonical-json";
import { PACKAGE_NAME_PATTERN, RELEASE_CHANNELS, isPackageKind, PACKAGE_KINDS } from "./package-manifest";
import type { PackageKind, ReleaseChannel } from "./package-manifest";
import {
  RELEASE_SIGNATURE_ALGORITHM,
  ReleaseManifestError,
  checkCanonicalValue,
  checkFields as checkSchemaFields,
  checkSignatureMembers,
  isReleaseTimestamp,
  parseReceivedDocument,
  sha256Digest,
  signPayload,
  verifyPayload,
} from "./release-signature";
import type { ReleasePublicKeys } from "./release-signature";
import { isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

export {
  RELEASE_KEY_ID_PATTERN,
  RELEASE_SIGNATURE_ALGORITHM,
  RELEASE_SIGNATURE_CODES,
  RELEASE_SIGNATURE_PATTERN,
  RELEASE_TIMESTAMP_PATTERN,
  ReleaseManifestError,
} from "./release-signature";
export type { ReleasePublicKeys } from "./release-signature";
export { compareUtf8 } from "@skillx/skill-tree/rules";

export const SKILLX_RELEASE_SCHEMA_VERSION = "skillx.release/v1";

/** Verification failure codes of the release manifest itself. */
export const RELEASE_MANIFEST_CODES = {
  /** The received bytes are not exactly the canonical JSON of the document. */
  nonCanonical: "release.non_canonical",
  /** `releaseDigest` is not the `agentkit.skill-tree/v1` digest of `files`. */
  treeDigestMismatch: "release.tree_digest_mismatch",
} as const;

/**
 * SemVer 2.0 version of a release: no build metadata (`+...` has no
 * precedence, so two releases could not be ordered) and no leading zeros in
 * numeric identifiers. Stricter than the package-wide `SEMVER_PATTERN`.
 */
export const RELEASE_VERSION_PATTERN =
  /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*)(?:\.(?:0|[1-9]\d*|\d*[A-Za-z-][0-9A-Za-z-]*))*)?$/;
const MAX_RELEASE_VERSION_LENGTH = 128;

/** Mode classes of `agentkit.skill-tree/v1`. */
export const RELEASE_FILE_MODES = ["100644", "100755"] as const;
export type ReleaseFileMode = (typeof RELEASE_FILE_MODES)[number];

/**
 * How SkillX verified that the publisher owns its handle. The signature is a
 * registry key, never a publisher key, so consumers MUST NOT map these
 * releases to trust `publisher-signed`. AgentKit will expose a verified
 * registry signature as `registry-signed` once its skill-lifecycle contract
 * adds that value; until then its trust mapping is defined there.
 */
export const PUBLISHER_VERIFICATIONS = ["none", "github", "admin"] as const;
export type PublisherVerification = (typeof PUBLISHER_VERIFICATIONS)[number];

/** Per-file content hash: bare lowercase hex SHA-256. */
export const FILE_SHA256_PATTERN = /^[a-f0-9]{64}$/;
/** A full SHA-1 or SHA-256 git object name in lowercase hex. */
export const SOURCE_COMMIT_PATTERN = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
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
  publisher: ReleasePublisher;
  /**
   * `null` when the release was not packed from a recorded git commit.
   * Consumers MUST label such a release "provenance unknown".
   */
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

const isSize = (value: unknown): value is number => Number.isSafeInteger(value) && (value as number) >= 0;

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === "string" && (values as readonly string[]).includes(value);
}

function checkFields(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  checkSchemaFields(value, allowed, path, SKILLX_RELEASE_SCHEMA_VERSION, issues);
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

function collectIssues(input: unknown, requireSignature: boolean): ValidationIssue[] {
  if (!isPlainObject(input)) return [issue("", "type", "release manifest must be an object")];
  const issues: ValidationIssue[] = [];
  if (!checkCanonicalValue(input, issues)) return issues;
  checkFields(input, requireSignature ? [...MANIFEST_FIELDS, "signature"] : MANIFEST_FIELDS, "", issues);

  if (input.schemaVersion !== SKILLX_RELEASE_SCHEMA_VERSION) {
    issues.push(issue("schemaVersion", "unsupported_value", `must equal '${SKILLX_RELEASE_SCHEMA_VERSION}'`));
  }
  const handle = validateIdentityField(input.identity, issues);
  if (
    typeof input.version !== "string" ||
    input.version.length > MAX_RELEASE_VERSION_LENGTH ||
    !RELEASE_VERSION_PATTERN.test(input.version)
  ) {
    issues.push(
      issue(
        "version",
        "pattern",
        `must be a SemVer 2.0 version without build metadata or leading zeros, at most ${MAX_RELEASE_VERSION_LENGTH} characters, such as '0.1.0'`,
      ),
    );
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

  validatePublisher(input.publisher, handle, issues);
  validateProvenance(input.sourceProvenance, issues);
  validateDeclaredScripts(input.declaredScripts, files, issues);
  if (!isReleaseTimestamp(input.createdAt)) {
    issues.push(issue("createdAt", "format", "must be an RFC 3339 UTC timestamp with whole seconds, e.g. 2026-10-13T04:30:00Z"));
  }
  checkSignatureMembers(input, requireSignature, issues);
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

/**
 * The manifest digest that binds a `skillx.release-status/v1` document to one
 * release: `sha256:<64 lowercase hex>` of `releaseSigningPayload(manifest)`,
 * the exact bytes the manifest signature covers (so it includes `keyId` and
 * `signatureAlgorithm` but not `signature`). Two releases of the same tree
 * under different identities or versions have different manifest digests.
 */
export async function releaseManifestDigest(manifest: UnsignedReleaseManifest | SkillxReleaseManifest): Promise<string> {
  return sha256Digest(releaseSigningPayload(manifest));
}

/**
 * The `agentkit.skill-tree/v1` digest of `files`, computed with WebCrypto over
 * the pure serialization of `@skillx/skill-tree/rules`. Equal to `treeDigest`
 * of `@skillx/skill-tree` for the same files.
 */
export async function releaseTreeDigest(files: readonly ReleaseFile[]): Promise<string> {
  return sha256Digest(new TextEncoder().encode(serializeTree(files)));
}

async function treeDigestIssue(manifest: UnsignedReleaseManifest): Promise<ValidationIssue | null> {
  const digest = await releaseTreeDigest(manifest.files);
  return digest === manifest.releaseDigest
    ? null
    : issue("releaseDigest", RELEASE_MANIFEST_CODES.treeDigestMismatch, `is not the tree digest of files (${digest})`);
}

/**
 * Signs a valid unsigned manifest with an Ed25519 private key. The key ID and
 * algorithm are part of the signed payload. Throws `ReleaseManifestError` when
 * the manifest is invalid, its `releaseDigest` is not the tree digest of its
 * `files`, or the key cannot sign with Ed25519.
 */
export async function signReleaseManifest(
  manifest: UnsignedReleaseManifest,
  privateKey: CryptoKey,
): Promise<SkillxReleaseManifest> {
  const result = validateUnsignedReleaseManifest(manifest);
  if (!result.valid) throw new ReleaseManifestError("invalid release manifest", result.issues);
  const mismatch = await treeDigestIssue(manifest);
  if (mismatch !== null) throw new ReleaseManifestError("invalid release manifest", [mismatch]);
  return { ...manifest, signature: await signPayload(releaseSigningPayload(manifest), privateKey) };
}

/**
 * Verifies a received manifest document against `publicKeys`, in this order:
 * the bytes are exactly its canonical JSON (`release.non_canonical`), the
 * structure is valid, `releaseDigest` is the tree digest of `files`
 * (`release.tree_digest_mismatch`), and the signature verifies. Fails closed:
 * every failure is an invalid result, never an exception. The verified
 * manifest is the parsed `document`.
 */
export async function verifyReleaseManifest(
  document: string | Uint8Array,
  publicKeys: ReleasePublicKeys,
): Promise<ValidationResult> {
  const parsed = parseReceivedDocument(document, RELEASE_MANIFEST_CODES.nonCanonical);
  if (!("value" in parsed)) return parsed;
  const structure = validateReleaseManifest(parsed.value);
  if (!structure.valid) return structure;
  const manifest = parsed.value as SkillxReleaseManifest;
  const mismatch = await treeDigestIssue(manifest);
  if (mismatch !== null) return validationFail([mismatch]);
  const failure = await verifyPayload(releaseSigningPayload(manifest), manifest.signature, manifest.keyId, publicKeys);
  return failure === null ? validationOk() : validationFail([failure]);
}
