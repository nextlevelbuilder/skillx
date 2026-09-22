export interface SourceRef {
  owner: string;
  repo: string;
  path: string;
}

export interface IdentityItem {
  owner: string;
  repo: string;
  path?: string | null;
  identity?: string;
  base?: string;
}

/** Lowercase, collapse anything that is not `[a-z0-9-]` into single dashes, trim dashes. */
export function slugify(value: unknown): string;

/**
 * Parse a GitHub tree URL into `{ owner, repo, path }`, or null when the URL is not a
 * recognizable `/{owner}/{repo}/tree/{branch}/{path}` link.
 */
export function parseSourceUrl(url: unknown): SourceRef | null;

/** Last path segment, or the repo name when the skill sits at the repository root. */
export function leafName(path: string | null | undefined, repo: string): string;

/** Identity key for `(repo, path)` — repo lowercased, path as-is. */
export function identityKey(repo: string, path?: string | null): string;

/** The readable slug a skill gets when nothing else already claims it. */
export function baseSlug(owner: string, path: string | null | undefined, repo: string): string;

/** Deterministic 16-char hex fragment (FNV-1a + djb2); `width` is 8 or 16. */
export function hashFragment(value: unknown, width?: number): string;

/** Locale-independent ordering, so slug assignment is identical in Node and workerd. */
export function compareCodepoints(a: unknown, b: unknown): number;

/** Base slug when free, otherwise base + identity fragment. Deterministic for a `taken` set. */
export function pickSlug(base: string, identity: string, taken: Set<string>): string;

/** Slug for one source identity. `base` overrides the readable base slug. */
export function canonicalSlug(input: IdentityItem & { taken: Set<string> }): string;

/**
 * Source identity of a stored skill or seed record. Records without a GitHub tree URL get a
 * `nosrc:` identity and keep their current slug as the base slug.
 */
export function sourceIdentity(input: {
  sourceUrl?: string | null;
  author?: string | null;
  name?: string | null;
  slug?: string | null;
}): {
  sourced: boolean;
  owner: string;
  repo: string;
  path: string;
  identity: string;
  repoLabel: string | null;
  base?: string;
};

/**
 * Assign slugs to a batch independent of input order. Duplicate identities must be
 * collapsed by the caller first.
 */
export function assignCanonicalSlugs(items: IdentityItem[]): Map<string, string>;
