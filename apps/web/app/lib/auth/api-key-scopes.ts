/**
 * Scoped API keys. A key with `scopes` NULL is a legacy full-account key and
 * works on every legacy endpoint but never publishes releases. A scoped key
 * holds a JSON array of scopes, works only where a scope grants access, and
 * is rejected by every legacy endpoint.
 *
 * The only scope today is `releases:publish:@<handle>`: publish releases of
 * packages under one publisher handle the key owner controls (CI publishing).
 */

const RELEASE_PUBLISH_PREFIX = "releases:publish:@";
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_KEY_SCOPES = 8;

export function releasePublishScope(handle: string): string {
  return `${RELEASE_PUBLISH_PREFIX}${handle}`;
}

/** The publisher handle a scope grants release publishing for, or null when it is not such a scope. */
export function releasePublishHandle(scope: string): string | null {
  if (!scope.startsWith(RELEASE_PUBLISH_PREFIX)) return null;
  const handle = scope.slice(RELEASE_PUBLISH_PREFIX.length);
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

/**
 * Parses a stored `scopes` column. NULL means a legacy unscoped key. A value
 * that is not a JSON array of strings grants nothing (fail closed).
 */
export function parseStoredScopes(raw: string | null | undefined): string[] | null {
  if (raw === null || raw === undefined) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((s) => typeof s === "string") ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

/**
 * Validates requested scopes for a new key. Returns the sorted unique scopes
 * and the handles they name; throws a message for any unknown scope.
 */
export function normalizeRequestedScopes(input: unknown): { scopes: string[]; handles: string[] } {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_KEY_SCOPES) {
    throw new Error(`scopes must be a non-empty array of at most ${MAX_KEY_SCOPES} entries`);
  }
  const scopes = [...new Set(input.map((s) => (typeof s === "string" ? s.trim() : "")))].sort();
  const handles = scopes.map((scope) => {
    const handle = releasePublishHandle(scope);
    if (handle === null) throw new Error(`unsupported scope ${JSON.stringify(scope)}; expected releases:publish:@<handle>`);
    return handle;
  });
  return { scopes, handles };
}
