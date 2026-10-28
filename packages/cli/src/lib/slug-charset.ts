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
