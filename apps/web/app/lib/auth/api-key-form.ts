import { LIBRARY_READ_SCOPE, MAX_KEY_SCOPES, kitsWriteHandle, kitsWriteScope, releasePublishHandle, releasePublishScope } from "./api-key-scopes";

/**
 * Client-side helpers for the Settings key form. The server re-validates
 * everything (`normalizeRequestedScopes` plus publisher ownership); these only
 * shape the request and the labels.
 */

export interface CreateKeyRequest {
  name: string;
  scopes?: string[];
}

/** Library sync scopes picked next to the publishing handles. */
export interface LibrarySyncSelection {
  libraryRead?: boolean;
  /** Publisher handles whose personal kits the key may write. */
  kitWriteHandles?: readonly string[];
}

/** Adds or removes a publisher handle from the selection, never exceeding `limit` (the per-key scope limit by default). */
export function toggleScopeHandle(selected: readonly string[], handle: string, limit = MAX_KEY_SCOPES): string[] {
  if (selected.includes(handle)) return selected.filter((h) => h !== handle);
  if (selected.length >= limit) return [...selected];
  return [...selected, handle];
}

/**
 * The POST body for a new key. Nothing selected means an account key (no
 * `scopes` field); any selection means a scoped key that holds only those
 * scopes, sorted and de-duplicated.
 */
export function buildCreateKeyRequest(name: string, handles: readonly string[], sync: LibrarySyncSelection = {}): CreateKeyRequest {
  const trimmed = name.trim();
  const scopes = new Set([...handles.map(releasePublishScope), ...(sync.kitWriteHandles ?? []).map(kitsWriteScope)]);
  if (sync.libraryRead === true) scopes.add(LIBRARY_READ_SCOPE);
  if (scopes.size === 0) return { name: trimmed };
  return { name: trimmed, scopes: [...scopes].sort() };
}

/** Human label for one stored scope. */
export function describeScope(scope: string): string {
  if (scope === LIBRARY_READ_SCOPE) return "Read your library";
  const publish = releasePublishHandle(scope);
  if (publish !== null) return `Publish releases for @${publish}`;
  const kits = kitsWriteHandle(scope);
  return kits === null ? scope : `Write kits for @${kits}`;
}

const handlesOf = (scopes: readonly string[], parse: (scope: string) => string | null) =>
  scopes
    .map(parse)
    .filter((h): h is string => h !== null)
    .map((h) => `@${h}`)
    .join(", ");

/** One-line summary of what a key (or a pending selection) can do. */
export function describeKeyAccess(scopes: readonly string[] | null): string {
  if (scopes === null) return "Account key: CLI search, installs, skill registration and usage reports. Cannot publish releases.";
  if (scopes.length === 0) return "No access.";
  const publish = handlesOf(scopes, releasePublishHandle);
  const kits = handlesOf(scopes, kitsWriteHandle);
  const read = scopes.includes(LIBRARY_READ_SCOPE);
  if (!read && kits === "") return `Release publishing key: can only publish releases for ${publish}. Rejected by every other API.`;
  const parts = [
    ...(publish === "" ? [] : [`publish releases for ${publish}`]),
    ...(read ? ["read your private releases and kits"] : []),
    ...(kits === "" ? [] : [`write kits for ${kits}`]),
  ];
  return `Scoped key: can only ${parts.join("; ")}. Rejected by every other API.`;
}
