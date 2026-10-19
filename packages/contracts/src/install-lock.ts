/**
 * `skillx.lock/v1`: the lockfile (`skillx.lock.json`) of the generic SkillX
 * installer. It names what to install, never where: every package is pinned
 * by exact version, release tree digest and the digest of the composed tree
 * that lands on disk (equal to the release digest when there is no overlay).
 * It carries no clock, no machine path and no secret, so the same source
 * resolves to the same bytes on every machine and the file is safe to sync.
 *
 * `lockDigest` hashes the canonical JSON of the whole document; two machines
 * agree on a lock exactly when their digests agree.
 */
import { canonicalJsonBytes } from "./canonical-json";
import { PACKAGE_NAME_PATTERN, SEMVER_PATTERN } from "./package-manifest";
import { findSyncLeaks } from "./sync-leaks";
import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";
import { sha256Digest } from "./release-signature";

export const INSTALL_LOCK_SCHEMA = "skillx.lock/v1";
export const INSTALL_RESOLVER_VERSION = "skillx.install-resolver/1";
export const INSTALL_LOCK_FILENAME = "skillx.lock.json";
/** Installed directory name: a lowercase skill alias. */
export const INSTALL_ALIAS_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
const KIT_PATTERN = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63}$/;
const ID_PATTERN = /^[a-z]+_[0-9a-f-]{36}$/;
const RUNTIME_PATTERN = /^[a-z0-9][a-z0-9-]{0,31}$/;
export const INSTALL_LOCK_LIMITS = { maxPackages: 256 } as const;

export type InstallLockSource =
  | { kind: "kit"; kit: string; revisionId: string; revisionNumber: number; revisionDigest: string }
  | { kind: "collection"; collectionId: string; revisionNumber: number; revisionDigest: string }
  | { kind: "packages" };

export interface InstallLockPackage {
  alias: string;
  package: string;
  version: string;
  releaseDigest: string;
  /** Digest of the tree that is installed: the release tree with every overlay applied. */
  compositionDigest: string;
  /** One digest per overlay layer; empty when the release is installed as published. */
  overlayDigests: string[];
}

export interface InstallLock {
  schema: typeof INSTALL_LOCK_SCHEMA;
  resolver: typeof INSTALL_RESOLVER_VERSION;
  source: InstallLockSource;
  /** Runtime constraints declared by the source (kit `runtimes`); empty means unconstrained. */
  runtimes: Record<string, string>;
  packages: InstallLockPackage[];
}

/** The owner key a source installs under, e.g. `kit:@alpha/my-kit`. Stable across revisions. */
export function lockOwnerKey(source: InstallLockSource, packages: readonly InstallLockPackage[]): string {
  if (source.kind === "kit") return `kit:${source.kit}`;
  if (source.kind === "collection") return `collection:${source.collectionId}`;
  return `packages:${packages.map((p) => p.package).join(",")}`;
}

/** `sha256:<hex>` of the canonical JSON of the lock. */
export function lockDigest(lock: InstallLock): Promise<string> {
  return sha256Digest(canonicalJsonBytes(lock));
}

/** Packages sorted by alias (UTF-16 order is fine: aliases are ASCII). */
export function sortLockPackages(packages: readonly InstallLockPackage[]): InstallLockPackage[] {
  return [...packages].sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
}

function checkKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, issues: ValidationIssue[]): void {
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) issues.push(issue(path === "" ? key : `${path}.${key}`, "unknown_field", "is not a skillx.lock/v1 field"));
  }
}

function checkSource(source: unknown, issues: ValidationIssue[]): void {
  if (!isPlainObject(source)) return void issues.push(issue("source", "type", "must be an object"));
  const revision = (keys: string[]) => {
    checkKeys(source, ["kind", ...keys], "source", issues);
    if (!Number.isSafeInteger(source.revisionNumber) || (source.revisionNumber as number) < 1) issues.push(issue("source.revisionNumber", "type", "must be a positive integer"));
    if (!RELEASE_DIGEST_PATTERN.test(String(source.revisionDigest))) issues.push(issue("source.revisionDigest", "pattern", "must be sha256:<hex>"));
  };
  if (source.kind === "kit") {
    revision(["kit", "revisionId", "revisionNumber", "revisionDigest"]);
    if (!KIT_PATTERN.test(String(source.kit))) issues.push(issue("source.kit", "pattern", "must be @handle/name"));
    if (!ID_PATTERN.test(String(source.revisionId))) issues.push(issue("source.revisionId", "pattern", "must be a revision id"));
  } else if (source.kind === "collection") {
    revision(["collectionId", "revisionNumber", "revisionDigest"]);
    if (!ID_PATTERN.test(String(source.collectionId))) issues.push(issue("source.collectionId", "pattern", "must be a collection id"));
  } else if (source.kind === "packages") {
    checkKeys(source, ["kind"], "source", issues);
  } else {
    issues.push(issue("source.kind", "unsupported_value", "must be kit, collection or packages"));
  }
}

function checkPackage(pkg: unknown, at: string, issues: ValidationIssue[]): void {
  if (!isPlainObject(pkg)) return void issues.push(issue(at, "type", "must be an object"));
  checkKeys(pkg, ["alias", "package", "version", "releaseDigest", "compositionDigest", "overlayDigests"], at, issues);
  if (!INSTALL_ALIAS_PATTERN.test(String(pkg.alias))) issues.push(issue(`${at}.alias`, "pattern", "must be a lowercase directory alias"));
  if (!isNonEmptyString(pkg.package) || !PACKAGE_NAME_PATTERN.test(pkg.package)) issues.push(issue(`${at}.package`, "pattern", "must be @publisher/slug"));
  if (!isNonEmptyString(pkg.version) || !SEMVER_PATTERN.test(pkg.version)) issues.push(issue(`${at}.version`, "pattern", "must be an exact semantic version"));
  for (const field of ["releaseDigest", "compositionDigest"] as const) {
    if (!RELEASE_DIGEST_PATTERN.test(String(pkg[field]))) issues.push(issue(`${at}.${field}`, "pattern", "must be sha256:<hex>"));
  }
  if (!Array.isArray(pkg.overlayDigests) || pkg.overlayDigests.some((d) => !RELEASE_DIGEST_PATTERN.test(String(d)))) {
    issues.push(issue(`${at}.overlayDigests`, "type", "must be an array of sha256:<hex>"));
  } else if (pkg.overlayDigests.length === 0 && pkg.compositionDigest !== pkg.releaseDigest) {
    issues.push(issue(`${at}.compositionDigest`, "mismatch", "must equal releaseDigest when there is no overlay"));
  }
}

/** Structural validation, plus the rule that a lock never carries a secret or an absolute path. */
export function validateInstallLock(input: unknown): ValidationResult {
  if (!isPlainObject(input)) return validationFail([issue("", "type", "lock must be an object")]);
  const issues: ValidationIssue[] = [];
  checkKeys(input, ["schema", "resolver", "source", "runtimes", "packages"], "", issues);
  if (input.schema !== INSTALL_LOCK_SCHEMA) issues.push(issue("schema", "unsupported_value", `must equal '${INSTALL_LOCK_SCHEMA}'`));
  if (input.resolver !== INSTALL_RESOLVER_VERSION) issues.push(issue("resolver", "unsupported_value", `must equal '${INSTALL_RESOLVER_VERSION}'`));
  checkSource(input.source, issues);
  if (!isPlainObject(input.runtimes) || Object.entries(input.runtimes).some(([k, v]) => !RUNTIME_PATTERN.test(k) || typeof v !== "string")) {
    issues.push(issue("runtimes", "type", "must map runtime ids to version ranges"));
  }
  if (!Array.isArray(input.packages)) {
    issues.push(issue("packages", "type", "must be an array"));
  } else {
    if (input.packages.length > INSTALL_LOCK_LIMITS.maxPackages) issues.push(issue("packages", "limit", `at most ${INSTALL_LOCK_LIMITS.maxPackages} packages`));
    input.packages.forEach((pkg, i) => checkPackage(pkg, `packages[${i}]`, issues));
    const aliases = input.packages.map((p) => (isPlainObject(p) ? String(p.alias) : ""));
    aliases.forEach((alias, i) => {
      if (i > 0 && aliases[i - 1]! >= alias) issues.push(issue(`packages[${i}].alias`, "order", "packages must be sorted by alias without duplicates"));
    });
  }
  for (const leak of findSyncLeaks(input)) issues.push(issue(leak.path, `sync.${leak.rule}`, "a lock must not carry secrets or absolute local paths"));
  return issues.length === 0 ? validationOk() : validationFail(issues);
}
