/**
 * Publisher-declared compatibility validation.
 *
 * Declaration shape is checked here; whether a declaration can install is
 * decided by the engine in `./normalize`, never at the edge.
 */

import { isNonEmptyString, isPlainObject, issue, validationFail, validationOk } from "../validation";
import type { ValidationIssue, ValidationResult } from "../validation";
import type { CompatibilityRequirement } from "./types";

export function normalizeRequirement(input: string | CompatibilityRequirement): CompatibilityRequirement {
  return typeof input === "string" ? { capability: input } : { ...input };
}

export function validateCompatibilityDeclaration(input: unknown): ValidationResult {
  if (!isPlainObject(input)) {
    return validationFail([issue("compatible", "type", "compatible must be an object keyed by runtime")]);
  }

  const issues: ValidationIssue[] = [];
  for (const [runtime, value] of Object.entries(input)) {
    const path = `compatible.${runtime}`;
    if (!isPlainObject(value)) {
      issues.push(issue(path, "type", "runtime declaration must be an object"));
      continue;
    }
    if (value.status !== "declared" && value.status !== "unsupported") {
      issues.push(issue(`${path}.status`, "unsupported_value", "status must be 'declared' or 'unsupported'"));
    }
    if (value.versions !== undefined && !isNonEmptyString(value.versions)) {
      issues.push(issue(`${path}.versions`, "type", "versions must be a non-empty string"));
    }
    if (value.scopes !== undefined && !Array.isArray(value.scopes)) {
      issues.push(issue(`${path}.scopes`, "type", "scopes must be an array"));
    }
    if (value.requires !== undefined) {
      if (!Array.isArray(value.requires)) {
        issues.push(issue(`${path}.requires`, "type", "requires must be an array"));
      } else {
        value.requires.forEach((entry, index) => {
          const entryPath = `${path}.requires[${index}]`;
          if (typeof entry === "string") {
            if (!isNonEmptyString(entry)) {
              issues.push(issue(entryPath, "required", "capability name must not be empty"));
            }
            return;
          }
          if (!isPlainObject(entry) || !isNonEmptyString(entry.capability)) {
            issues.push(issue(entryPath, "required", "requirement must be a string or { capability } object"));
          }
        });
      }
    }
  }

  return issues.length === 0 ? validationOk() : validationFail(issues);
}
