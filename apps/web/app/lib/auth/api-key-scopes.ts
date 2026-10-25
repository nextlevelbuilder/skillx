/**
 * Scoped API keys. A key with `scopes` NULL is a legacy full-account key and
 * works on every legacy endpoint but never publishes releases. A scoped key
 * holds a JSON array of scopes, works only where a scope grants access, and
 * is rejected by every legacy endpoint.
 *
 * Scopes:
 * - `releases:publish:@<handle>`: publish releases of packages under one
 *   publisher handle the key owner controls (CI publishing).
 * - `library:read`: read what the key owner's session can read on the
 *   release read API and the personal kit API (private releases the owner
 *   owns or is entitled to, the owner's kits). Never a write.
 * - `kits:write:@<handle>`: read and write the owner's personal kits named
 *   `@<handle>/...` (store revisions, rebase, resolve conflicts, activate,
 *   roll back, lock). Interactive review and public activation still need a
 *   web session.
 *
 * A scope never grants more than the key owner holds: every scoped request
 * still runs as the owner, through the same ownership and access rules.
 */

const RELEASE_PUBLISH_PREFIX = "releases:publish:@";
const KITS_WRITE_PREFIX = "kits:write:@";
export const LIBRARY_READ_SCOPE = "library:read";
const HANDLE_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/;
export const MAX_KEY_SCOPES = 8;

function handleAfter(prefix: string, scope: string): string | null {
  if (!scope.startsWith(prefix)) return null;
  const handle = scope.slice(prefix.length);
  return HANDLE_PATTERN.test(handle) ? handle : null;
}

export function releasePublishScope(handle: string): string {
  return `${RELEASE_PUBLISH_PREFIX}${handle}`;
}

/** The publisher handle a scope grants release publishing for, or null when it is not such a scope. */
export function releasePublishHandle(scope: string): string | null {
  return handleAfter(RELEASE_PUBLISH_PREFIX, scope);
}

export function kitsWriteScope(handle: string): string {
  return `${KITS_WRITE_PREFIX}${handle}`;
}

/** The publisher handle a scope grants personal kit writes for, or null when it is not such a scope. */
export function kitsWriteHandle(scope: string): string | null {
  return handleAfter(KITS_WRITE_PREFIX, scope);
}

/** The scopes accepted by the release read API. */
export const grantsLibraryRead = (scopes: readonly string[]): boolean => scopes.includes(LIBRARY_READ_SCOPE);

/** True when a key holds any scope the personal kit API accepts for reads (the kit handle is checked later). */
export const grantsAnyKitRead = (scopes: readonly string[]): boolean => grantsLibraryRead(scopes) || grantsAnyKitWrite(scopes);

/** True when a key holds any `kits:write:@<handle>` scope (the kit handle is checked later). */
export const grantsAnyKitWrite = (scopes: readonly string[]): boolean => scopes.some((scope) => kitsWriteHandle(scope) !== null);

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
 * and the sorted unique publisher handles they name (each must be an active
 * publisher the key owner owns); throws a message for any unknown scope.
 */
export function normalizeRequestedScopes(input: unknown): { scopes: string[]; handles: string[] } {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_KEY_SCOPES) {
    throw new Error(`scopes must be a non-empty array of at most ${MAX_KEY_SCOPES} entries`);
  }
  const scopes = [...new Set(input.map((s) => (typeof s === "string" ? s.trim() : "")))].sort();
  const handles = new Set<string>();
  for (const scope of scopes) {
    if (scope === LIBRARY_READ_SCOPE) continue;
    const handle = releasePublishHandle(scope) ?? kitsWriteHandle(scope);
    if (handle === null) {
      throw new Error(`unsupported scope ${JSON.stringify(scope)}; expected releases:publish:@<handle>, kits:write:@<handle> or ${LIBRARY_READ_SCOPE}`);
    }
    handles.add(handle);
  }
  return { scopes, handles: [...handles].sort() };
}
