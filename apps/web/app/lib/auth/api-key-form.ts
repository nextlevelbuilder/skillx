import { MAX_KEY_SCOPES, releasePublishHandle, releasePublishScope } from "./api-key-scopes";

/**
 * Client-side helpers for the Settings key form. The server re-validates
 * everything (`normalizeRequestedScopes` plus publisher ownership); these only
 * shape the request and the labels.
 */

export interface CreateKeyRequest {
  name: string;
  scopes?: string[];
}

/** Adds or removes a publisher handle from the selection, never exceeding the per-key scope limit. */
export function toggleScopeHandle(selected: readonly string[], handle: string): string[] {
  if (selected.includes(handle)) return selected.filter((h) => h !== handle);
  if (selected.length >= MAX_KEY_SCOPES) return [...selected];
  return [...selected, handle];
}

/**
 * The POST body for a new key. No selected publisher means an account key
 * (no `scopes` field); any selection means a release-publishing key that holds
 * only those scopes.
 */
export function buildCreateKeyRequest(name: string, handles: readonly string[]): CreateKeyRequest {
  const trimmed = name.trim();
  if (handles.length === 0) return { name: trimmed };
  return { name: trimmed, scopes: [...new Set(handles)].sort().map(releasePublishScope) };
}

/** Human label for one stored scope. */
export function describeScope(scope: string): string {
  const handle = releasePublishHandle(scope);
  return handle === null ? scope : `Publish releases for @${handle}`;
}

/** One-line summary of what a key (or a pending selection) can do. */
export function describeKeyAccess(scopes: readonly string[] | null): string {
  if (scopes === null) return "Account key: CLI search, installs, skill registration and usage reports. Cannot publish releases.";
  if (scopes.length === 0) return "No access.";
  const handles = scopes.map((s) => releasePublishHandle(s)).filter((h): h is string => h !== null);
  return `Release publishing key: can only publish releases for ${handles.map((h) => `@${h}`).join(", ")}. Rejected by every other API.`;
}
