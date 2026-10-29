import { isPlainObject, issue } from "./validation";
import type { ValidationIssue } from "./validation";
import { RELEASE_DIGEST_PATTERN } from "./verification-evidence";

/**
 * The `added` entries of `skillx.lock/v1`: skills installed by `skillx add`
 * from a git repository. Kept apart from the registry packages because they
 * have no signed release; see `InstallLockAdded`.
 */

export const ADDED_LOCK_LIMITS = { maxAdded: 256 } as const;
/** A full commit object id: SHA-1 (40 hex) or SHA-256 (64 hex). */
export const GIT_COMMIT_PATTERN = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
/** A branch or tag name git accepts that cannot read as an option or a revision expression. */
export const GIT_REF_NAME_PATTERN = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock$)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/;

/**
 * A skill installed by `skillx add` from a git repository: no registry
 * release, so it is pinned by the commit it was read at and the
 * `agentkit.skill-tree/v1` digest of its directory there. `sync --locked`
 * fetches that commit and refuses any other tree; `update` follows `ref`.
 */
export interface InstallLockAdded {
  alias: string;
  /** The https URL to fetch, never with credentials, a query or a fragment. */
  repository: string;
  /** The skill's directory in the repository, `/`-separated; '' for the root. */
  path: string;
  /** The branch or tag `update` follows; absent for the default branch, or the commit itself when the source named one. */
  ref?: string;
  commit: string;
  treeDigest: string;
}

const ADDED_FIELDS = ["alias", "repository", "path", "ref", "commit", "treeDigest"];

/** Added entries sorted by alias. */
export function sortLockAdded(added: readonly InstallLockAdded[]): InstallLockAdded[] {
  return [...added].sort((a, b) => (a.alias < b.alias ? -1 : a.alias > b.alias ? 1 : 0));
}

function checkRepository(value: unknown, at: string, issues: ValidationIssue[]): void {
  let url: URL | null = null;
  try {
    url = typeof value === "string" ? new URL(value) : null;
  } catch {
    url = null;
  }
  if (url === null || url.protocol !== "https:" || url.hostname === "" || url.href !== value) {
    issues.push(issue(at, "pattern", "must be a normalized https URL"));
  } else if (url.username !== "" || url.password !== "" || url.search !== "" || url.hash !== "") {
    issues.push(issue(at, "pattern", "must carry no credentials, query or fragment"));
  }
}

function checkAdded(entry: unknown, at: string, issues: ValidationIssue[], isAlias: (alias: string) => boolean): void {
  if (!isPlainObject(entry)) return void issues.push(issue(at, "type", "must be an object"));
  for (const key of Object.keys(entry)) if (!ADDED_FIELDS.includes(key)) issues.push(issue(`${at}.${key}`, "unknown_field", "is not a skillx.lock/v1 field"));
  if (!isAlias(String(entry.alias))) issues.push(issue(`${at}.alias`, "pattern", "must be a lowercase directory alias, not ending in '.' nor a Windows device name"));
  checkRepository(entry.repository, `${at}.repository`, issues);
  const path = entry.path;
  if (typeof path !== "string" || (path !== "" && path.split("/").some((s) => s === "" || s === "." || s === ".." || /[\\:\0-\x1f]/.test(s)))) {
    issues.push(issue(`${at}.path`, "pattern", "must be '' or relative '/'-separated segments without '.', '..', '\\' or ':'"));
  }
  if (entry.ref !== undefined && (typeof entry.ref !== "string" || !(GIT_REF_NAME_PATTERN.test(entry.ref) || GIT_COMMIT_PATTERN.test(entry.ref)))) {
    issues.push(issue(`${at}.ref`, "pattern", "must be a branch or tag name, or a full commit id"));
  }
  if (!GIT_COMMIT_PATTERN.test(String(entry.commit))) issues.push(issue(`${at}.commit`, "pattern", "must be a full lowercase commit id"));
  else if (typeof entry.ref === "string" && GIT_COMMIT_PATTERN.test(entry.ref) && entry.ref !== entry.commit) issues.push(issue(`${at}.ref`, "mismatch", "a commit ref must equal commit"));
  if (!RELEASE_DIGEST_PATTERN.test(String(entry.treeDigest))) issues.push(issue(`${at}.treeDigest`, "pattern", "must be sha256:<hex>"));
}

/** Aliases of `list` sorted without duplicates; returns them for cross-checks. */
export function checkAliasOrder(list: readonly unknown[], key: string, issues: ValidationIssue[]): string[] {
  const aliases = list.map((p) => (isPlainObject(p) ? String(p.alias) : ""));
  aliases.forEach((alias, i) => {
    if (i > 0 && aliases[i - 1]! >= alias) issues.push(issue(`${key}[${i}].alias`, "order", `${key} must be sorted by alias without duplicates`));
  });
  return aliases;
}

/** Validates `input.added` (present): entries, order, the packages scope and no alias shared with a package. */
export function checkAddedList(input: Record<string, unknown>, issues: ValidationIssue[], isAlias: (alias: string) => boolean): void {
  if (!Array.isArray(input.added) || input.added.length === 0) return void issues.push(issue("added", "type", "must be a non-empty array when present"));
  if (!isPlainObject(input.source) || input.source.kind !== "packages") issues.push(issue("added", "scope", "only a packages lock records added skills"));
  if (input.added.length > ADDED_LOCK_LIMITS.maxAdded) issues.push(issue("added", "limit", `at most ${ADDED_LOCK_LIMITS.maxAdded} added skills`));
  input.added.forEach((entry, i) => checkAdded(entry, `added[${i}]`, issues, isAlias));
  const packaged = new Set(Array.isArray(input.packages) ? input.packages.map((p) => (isPlainObject(p) ? String(p.alias) : "")) : []);
  checkAliasOrder(input.added, "added", issues).forEach((alias, i) => {
    if (packaged.has(alias)) issues.push(issue(`added[${i}].alias`, "duplicate", "an alias is either a package or an added skill"));
  });
}
