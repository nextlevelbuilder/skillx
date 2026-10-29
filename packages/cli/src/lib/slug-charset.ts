/**
 * The catalog slug charset. Canonical slugs are `[a-z0-9-]` (see
 * `@skillx/skill-identity` `slugify`); `.` and `_` are tolerated for older rows.
 * A leading letter or digit rules out `.`, `..` and a leading dash.
 */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9._-]*$/;

/** True when `value` is a well-formed catalog slug. */
export function isCatalogSlug(value: string): boolean {
  return SLUG_PATTERN.test(value);
}

/**
 * A server-supplied slug reduced to the slug charset, every other character
 * replaced with `?`, so it cannot break out of a one-line marker.
 */
export function sanitizeSlug(value: unknown): string {
  return String(value ?? '').replace(/[^a-z0-9._-]/g, '?');
}

const RISK_LABELS = new Set(['safe', 'caution', 'danger', 'unknown']);

/** A server-supplied risk label, or `unknown` when it is not one of the four labels. */
export function sanitizeRiskLabel(value: unknown): string {
  return typeof value === 'string' && RISK_LABELS.has(value) ? value : 'unknown';
}
