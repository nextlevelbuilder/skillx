/**
 * Canonical skill identity + slug rules (issue #25).
 *
 * A skill's identity is its source: repository + full path inside it. Display names are not
 * identity — two skills called `ui-ux-pro-max` living at different paths of the same repo are
 * two different skills. Slugs are derived from that identity so the seed pipeline and runtime
 * registration can never disagree.
 *
 * Zero dependencies and no Node built-ins: this module runs in Node, in the Cloudflare Worker,
 * and in plain scripts.
 */

const INVALID_SLUG_CHARS = /[^a-z0-9-]/g;
const GITHUB_TREE_URL = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/tree\/[^/]+\/(.+)$/;

/** Lowercase, collapse anything that is not `[a-z0-9-]` into single dashes, trim dashes. */
export function slugify(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(INVALID_SLUG_CHARS, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Parse a GitHub tree URL into `{ owner, repo, path }`.
 *
 * Only the `/{owner}/{repo}/tree/{branch}/{path}` shape is understood; a branch name that
 * itself contains a slash is not supported (every source in the current dataset uses a single
 * segment branch such as `main`).
 */
export function parseSourceUrl(url) {
  if (typeof url !== "string") return null;

  const match = GITHUB_TREE_URL.exec(url.trim());
  if (!match) return null;

  const [, owner, repo, rawPath] = match;
  const path = rawPath.replace(/\/+$/, "");
  if (!owner || !repo || !path) return null;

  return { owner, repo, path };
}

/** Last path segment, or the repo name when the skill sits at the repository root. */
export function leafName(path, repo) {
  const segments = String(path ?? "")
    .split("/")
    .filter(Boolean);
  return segments.length > 0 ? segments.at(-1) : repo;
}

/**
 * Identity key for `(repo, path)`. Lowercased because GitHub repo slugs are
 * case-insensitive; the path is kept as-is because paths are case-sensitive.
 */
export function identityKey(repo, path) {
  return `${String(repo).toLowerCase()}/${path ?? ""}`;
}

/** The readable slug a skill gets when nothing else already claims it. */
export function baseSlug(owner, path, repo) {
  return slugify(`${owner}-${leafName(path, repo)}`);
}

/**
 * Deterministic 16-char hex fragment for a value: FNV-1a (first 8) followed by djb2
 * (next 8). `width` selects 8 or 16 characters. Not used for security, only to keep
 * slugs of clashing display names apart.
 */
export function hashFragment(value, width = 8) {
  const text = String(value);

  let fnv = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    fnv ^= text.charCodeAt(i);
    fnv = Math.imul(fnv, 0x01000193) >>> 0;
  }

  let djb = 5381;
  for (let i = 0; i < text.length; i += 1) {
    djb = (Math.imul(djb, 33) + text.charCodeAt(i)) >>> 0;
  }

  const hex = fnv.toString(16).padStart(8, "0") + djb.toString(16).padStart(8, "0");
  return hex.slice(0, width);
}

/**
 * Pick the slug for one identity: the readable base when it is free, otherwise the base
 * plus a fragment of the identity. Deterministic for a given `taken` set.
 */
export function pickSlug(base, identity, taken) {
  if (!taken.has(base)) return base;

  for (const width of [8, 16]) {
    const candidate = `${base}-${hashFragment(identity, width)}`;
    if (!taken.has(candidate)) return candidate;
  }

  throw new Error(`skill-identity: cannot derive a unique slug for ${identity}`);
}

/**
 * Slug for one source identity. Pass `base` to override the readable base slug
 * (used for sources that have no parseable repository URL).
 */
export function canonicalSlug({ owner, repo, path = "", identity, base, taken }) {
  const key = identity ?? identityKey(repo, path);
  const readableBase = base ?? baseSlug(owner, path, repo);
  return pickSlug(readableBase, key, taken);
}

/**
 * Source identity of a stored skill or seed record.
 *
 * A record whose source URL is missing or not a GitHub tree URL cannot be attributed to a
 * repository: it gets a `nosrc:` identity and keeps its current slug as the base slug.
 */
export function sourceIdentity({ sourceUrl, author, name, slug }) {
  const parsed = parseSourceUrl(sourceUrl);

  if (parsed) {
    // Owner and repo are case-insensitive on GitHub while the path is not, so the repo label is
    // stored lowercased: identity lookups then match however the caller spells the repo.
    const repoLabel = `${parsed.owner}/${parsed.repo}`.toLowerCase();
    return {
      sourced: true,
      owner: parsed.owner,
      repo: parsed.repo,
      path: parsed.path,
      identity: identityKey(repoLabel, parsed.path),
      repoLabel,
    };
  }

  return {
    sourced: false,
    owner: author || "unknown",
    repo: "",
    path: "",
    identity: `nosrc:${slugify(author || "unknown")}/${slugify(name || slug)}`,
    base: slugify(slug),
    repoLabel: null,
  };
}

/**
 * Locale-independent string comparison. `localeCompare` can order the same two keys differently
 * in different runtimes (Node vs workerd), which would hand different slugs to the same collision
 * group. Code-point order is stable everywhere.
 */
export function compareCodepoints(a, b) {
  const left = String(a);
  const right = String(b);
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

/**
 * Assign a slug to every item in a batch, independent of input order.
 *
 * Items are `{ owner, repo, path, identity?, base? }`. Items are processed in lexical identity
 * order, so the same set always yields the same slugs no matter how the caller ordered it.
 * Callers must collapse duplicate identities first — one identity, one skill.
 *
 * @returns {Map<string, string>} identity → slug
 */
export function assignCanonicalSlugs(items) {
  const slugs = new Map();
  const taken = new Set();

  const ordered = [...items].sort((a, b) => {
    const keyA = a.identity ?? identityKey(a.repo, a.path);
    const keyB = b.identity ?? identityKey(b.repo, b.path);
    return compareCodepoints(keyA, keyB);
  });

  for (const item of ordered) {
    const key = item.identity ?? identityKey(item.repo, item.path);
    const slug = canonicalSlug({ ...item, identity: key, taken });
    taken.add(slug);
    slugs.set(key, slug);
  }

  return slugs;
}
