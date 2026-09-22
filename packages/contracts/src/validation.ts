/**
 * Shared validation result shape used by every SkillX contract validator.
 *
 * Validators never throw on malformed input; they return issues so that every
 * surface (web, CLI, MCP) can render the same machine-readable explanation.
 */

export interface ValidationIssue {
  /** Dot-delimited path to the offending field, e.g. `compatible.claude-code.versions`. */
  path: string;
  /** Machine-readable code, e.g. `required`, `pattern`, `unsupported_value`. */
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export function validationOk(): ValidationResult {
  return { valid: true, issues: [] };
}

export function validationFail(issues: ValidationIssue[]): ValidationResult {
  return { valid: false, issues };
}

export function issue(path: string, code: string, message: string): ValidationIssue {
  return { path, code, message };
}

export function mergeIssues(...results: ValidationResult[]): ValidationResult {
  const issues = results.flatMap((result) => result.issues);
  return issues.length === 0 ? validationOk() : validationFail(issues);
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}
