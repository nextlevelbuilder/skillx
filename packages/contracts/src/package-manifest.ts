/**
 * `skillx.package/v1` manifest contract.
 *
 * A package is metadata and history; installable bytes live in immutable
 * releases. This manifest declares identity, kind, and compatibility only — it
 * never carries price, which belongs to an offer, or artifact bytes, which
 * belong to a release.
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "./validation";
import type { ValidationIssue, ValidationResult } from "./validation";
import { validateCompatibilityDeclaration } from "./compatibility";
import type { CompatibilityDeclarationMap } from "./compatibility";

export const SKILLX_PACKAGE_SCHEMA_VERSION = "skillx.package/v1";

export const PACKAGE_KINDS = ["skill", "hook-pack", "bundle"] as const;
export type PackageKind = (typeof PACKAGE_KINDS)[number];

export const RELEASE_STATES = ["draft", "quarantined", "published", "yanked"] as const;
export type ReleaseState = (typeof RELEASE_STATES)[number];

export const RELEASE_CHANNELS = ["stable", "beta", "alpha"] as const;
export type ReleaseChannel = (typeof RELEASE_CHANNELS)[number];

/** Fully-qualified package identity: `@publisher/slug`. */
export const PACKAGE_NAME_PATTERN = /^@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*$/;
export const SEMVER_PATTERN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** States in which a release may be resolved for a normal new install. */
export const RESOLVABLE_RELEASE_STATES: readonly ReleaseState[] = ["published"];

export interface PackageEnvironment {
  os?: string[];
  runtimes?: Record<string, string>;
}

export interface SkillxPackageManifest {
  schemaVersion: typeof SKILLX_PACKAGE_SCHEMA_VERSION;
  name: string;
  version: string;
  kind: PackageKind;
  compatible?: CompatibilityDeclarationMap;
  environment?: PackageEnvironment;
}

export function isPackageKind(value: unknown): value is PackageKind {
  return typeof value === "string" && (PACKAGE_KINDS as readonly string[]).includes(value);
}

export function isReleaseState(value: unknown): value is ReleaseState {
  return typeof value === "string" && (RELEASE_STATES as readonly string[]).includes(value);
}

export function isResolvableReleaseState(state: ReleaseState): boolean {
  return RESOLVABLE_RELEASE_STATES.includes(state);
}

export function validatePackageManifest(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("", "type", "manifest must be an object")]);
  }

  const issues: ValidationIssue[] = [];

  if (input.schemaVersion !== SKILLX_PACKAGE_SCHEMA_VERSION) {
    issues.push(
      issue("schemaVersion", "unsupported_value", `must equal '${SKILLX_PACKAGE_SCHEMA_VERSION}'`),
    );
  }

  if (!isNonEmptyString(input.name) || !PACKAGE_NAME_PATTERN.test(input.name)) {
    issues.push(issue("name", "pattern", "must be '@publisher/slug' using lowercase slug characters"));
  }

  if (!isNonEmptyString(input.version) || !SEMVER_PATTERN.test(input.version)) {
    issues.push(issue("version", "pattern", "must be a semantic version such as '0.1.0'"));
  }

  if (!isPackageKind(input.kind)) {
    issues.push(issue("kind", "unsupported_value", `must be one of: ${PACKAGE_KINDS.join(", ")}`));
  }

  if (input.compatible !== undefined) {
    issues.push(...validateCompatibilityDeclaration(input.compatible).issues);
  }

  if (input.environment !== undefined) {
    if (!isPlainObject(input.environment)) {
      issues.push(issue("environment", "type", "environment must be an object"));
    } else {
      const { os, runtimes } = input.environment;
      if (os !== undefined && !Array.isArray(os)) {
        issues.push(issue("environment.os", "type", "os must be an array of strings"));
      }
      if (runtimes !== undefined && !isPlainObject(runtimes)) {
        issues.push(issue("environment.runtimes", "type", "runtimes must be an object of version ranges"));
      }
    }
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}
