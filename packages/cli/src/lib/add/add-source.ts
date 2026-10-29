import { isAbsolute, resolve } from 'node:path';
import { usageError } from '../install/install-errors.js';

/**
 * Sources `skillx add` accepts, parsed before anything touches the network or
 * the disk:
 *
 * - `github:owner/repo[/path][@ref]`: a GitHub repository, optionally a
 *   directory in it and a branch or tag;
 * - `owner/repo[/skill]`: GitHub shorthand, optionally one skill by name;
 * - `https://github.com/owner/repo[/tree/<ref>[/<path>]]` maps to `github:`;
 * - any other `https://` git URL; every other transport (`http`, `ssh`,
 *   `git@host:`, `file://`, `ext::` and other `::` helpers) is refused, and so
 *   is anything that starts with `-`, so a source never becomes a git option;
 * - a local directory: an absolute path, or one starting with `.`/`..`.
 *
 * Credentials in a URL may be used to clone but never leave this module in a
 * label: `label` strips them, and `redactCredentials` masks them in any text.
 * A URL that holds an `@` but does not parse, or whose path holds one, is
 * refused without being echoed, since where its credentials end cannot be
 * known.
 */

export type AddSource =
  | {
      kind: 'github';
      owner: string;
      repo: string;
      path: string;
      ref?: string;
      skill?: string;
      /** Segments after `/tree/` when there are several: which ones name the ref is settled against the remote (`resolveTreeRef`). */
      tree?: string[];
      cloneUrl: string;
      label: string;
    }
  | { kind: 'git'; cloneUrl: string; label: string }
  | { kind: 'local'; dir: string; label: string };

const OWNER = '[A-Za-z0-9][A-Za-z0-9-]{0,38}';
const REPO = '[A-Za-z0-9._-]{1,100}';
const SHORTHAND = new RegExp(`^(${OWNER})/(${REPO})(?:/([A-Za-z0-9._-]{1,128}))?$`);
const GITHUB_REF = new RegExp(`^(${OWNER})/(${REPO})(/[^@]*)?(?:@(.+))?$`);
const GITHUB_URL = new RegExp(`^/(${OWNER})/(${REPO}?)(?:\\.git)?(?:/tree/([^/]+)((?:/[^/]+)*))?/?$`);
/** A branch or tag name git accepts and that cannot read as an option or a revision expression. */
const REF = /^(?!-)(?!.*\.\.)(?!.*\/\/)(?!.*@\{)(?!.*\.lock$)(?!.*\/$)[A-Za-z0-9._/-]{1,200}$/;
const USAGE = 'owner/repo[/skill], github:owner/repo[/path][@ref], an https git URL or a local directory';

/**
 * Masks the userinfo of every `scheme://user:secret@host` in `text`, up to
 * the last `@` of the URL, so a secret holding `/`, `?` or `#` is masked whole
 * (at the cost of masking a path `@` too). Whitespace and quotes end a match,
 * so the result of redacting serialized JSON is still JSON.
 */
export function redactCredentials(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s"'<>]*@/gi, '$1***@');
}

const UNSHOWN_URL =
  'refusing the source: not a valid git URL (not shown, as it may hold credentials; percent-encode `/`, `?`, `#` and `@` in a user name or password)';
/** A refusal echoes the input only when it holds no `@`, since where a credential in it ends cannot be known for sure. */
const refuse = (input: string, why: string) => usageError(input.includes('@') ? `refusing the source: ${why}` : `refusing source '${input}': ${why}`);

function checkRepo(repo: string, input: string): void {
  if (repo === '.' || repo === '..') throw refuse(input, 'the repository name is not a name');
}

/** A repository path: plain `/`-separated segments, never `.`, `..`, empty, `\` or `:`. */
export function checkRepoPath(path: string, input: string): string {
  const trimmed = path.replace(/^\/+|\/+$/g, '');
  if (trimmed === '') return '';
  for (const segment of trimmed.split('/')) {
    if (segment === '' || segment === '.' || segment === '..' || /[\\:\0-\x1f]/.test(segment)) throw refuse(input, `unsafe path '${trimmed}'`);
  }
  return trimmed;
}

function checkRef(ref: string, input: string): string {
  if (!REF.test(ref)) throw refuse(input, `'${ref}' is not a branch or tag name`);
  return ref;
}

const githubLabel = (owner: string, repo: string, path: string, ref?: string) => `github:${owner}/${repo}${path ? `/${path}` : ''}${ref ? `@${ref}` : ''}`;

type GithubSource = Extract<AddSource, { kind: 'github' }>;

function github(input: string, owner: string, repo: string, path: string, ref: string | undefined, skill?: string): GithubSource {
  checkRepo(repo, input);
  return { kind: 'github', owner, repo, path, ...(ref ? { ref } : {}), ...(skill ? { skill } : {}), cloneUrl: `https://github.com/${owner}/${repo}.git`, label: githubLabel(owner, repo, path, ref) };
}

/** How a `/tree/a/b/c` URL may split into a ref and a path, longest ref first; refs that are not valid names are left out. */
function treeSplits(tree: readonly string[]): Array<{ ref: string; path: string }> {
  return tree
    .map((_, i) => ({ ref: tree.slice(0, tree.length - i).join('/'), path: tree.slice(tree.length - i).join('/') }))
    .filter(({ ref }) => REF.test(ref));
}

/** The ref names a `/tree/` URL may mean, to look up on the remote. */
export const treeRefCandidates = (source: AddSource): string[] => (source.kind === 'github' && source.tree ? treeSplits(source.tree).map((s) => s.ref) : []);

/**
 * Settles a `/tree/<ref>/<path>` URL against the refs the remote has: a branch
 * name may hold `/`, so the longest leading segments that name a branch or tag
 * are the ref and the rest the path. With no match the first segment stays the
 * ref, and the clone reports it missing.
 */
export function resolveTreeRef(source: AddSource, remoteRefs: ReadonlySet<string>): AddSource {
  if (source.kind !== 'github' || !source.tree) return source;
  const { tree, ...rest } = source;
  const split = treeSplits(tree).find((s) => remoteRefs.has(s.ref));
  if (split === undefined) return rest;
  const path = checkRepoPath(split.path, source.label);
  return { ...rest, ref: split.ref, path, label: githubLabel(source.owner, source.repo, path, split.ref) };
}

function fromUrl(input: string): AddSource {
  if (input.includes('::')) throw refuse(input, 'git transport helpers (ext::, fd:: and the like) are not accepted');
  if (/^[^/:]+@[^/:]+:/.test(input)) throw refuse(input, 'scp-style ssh sources are not accepted; use an https URL');
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    if (input.includes('@')) throw usageError(UNSHOWN_URL);
    throw refuse(input, 'not a valid URL');
  }
  // `https://user:12/ss@host` parses as host `user`: an `@` past the host means a secret may sit in the path.
  if (url.pathname.includes('@')) throw usageError(UNSHOWN_URL);
  if (url.protocol !== 'https:') throw refuse(input, `only https git URLs are accepted, not ${url.protocol.replace(/:$/, '')}`);
  if (url.hostname === '') throw refuse(input, 'the URL has no host');
  if (url.search !== '' || url.hash !== '') throw refuse(input, 'a git URL takes no query or fragment');
  const credentials = url.username !== '' || url.password !== '';
  const gh = url.hostname === 'github.com' && url.port === '' && !credentials ? GITHUB_URL.exec(url.pathname) : null;
  if (gh) {
    // Decoded first, so an encoded `..%2F..` is checked as the `../..` GitHub would see.
    const decode = (part: string) => {
      try {
        return decodeURIComponent(part);
      } catch {
        throw refuse(input, 'the URL path is not valid percent-encoding');
      }
    };
    const source = github(input, gh[1]!, gh[2]!, checkRepoPath(decode(gh[4] ?? ''), input), gh[3] ? checkRef(decode(gh[3]), input) : undefined);
    const tree = gh[3] && gh[4] ? [gh[3], ...(gh[4].split('/').filter(Boolean))].map(decode) : [];
    return tree.length > 1 ? { ...source, tree } : source;
  }
  const bare = new URL(url.href);
  bare.username = '';
  bare.password = '';
  return { kind: 'git', cloneUrl: url.href, label: bare.href };
}

function isLocalPath(input: string): boolean {
  return isAbsolute(input) || /^\.\.?(?:[/\\]|$)/.test(input) || /^[A-Za-z]:[/\\]/.test(input);
}

/** Parses a source string; every refusal is a `usage_error` whose message never carries credentials. */
export function parseAddSource(input: string, cwd: string = process.cwd()): AddSource {
  const raw = input.trim();
  if (raw === '') throw usageError(`name a source: ${USAGE}`);
  if (/[\0-\x1f\x7f]/.test(raw)) throw refuse(raw, 'it contains control characters');
  if (raw.startsWith('-')) throw refuse(raw, 'it reads as an option');
  if (raw.startsWith('@agentkit/')) throw refuse(raw, '@agentkit is reserved for AgentKit kit releases');
  if (raw.startsWith('@') || /^(?:kit|collection):/.test(raw)) throw refuse(raw, 'registry sources are installed with skillx install');
  if (isLocalPath(raw)) {
    const dir = resolve(cwd, raw);
    return { kind: 'local', dir, label: dir };
  }
  if (raw.startsWith('github:')) {
    const m = GITHUB_REF.exec(raw.slice('github:'.length));
    if (!m) throw refuse(raw, 'expected github:owner/repo[/path][@ref]');
    return github(raw, m[1]!, m[2]!, checkRepoPath(m[3] ?? '', raw), m[4] === undefined ? undefined : checkRef(m[4], raw));
  }
  if (raw.includes('://') || raw.includes('::') || /^[^/:]+@[^/:]+:/.test(raw)) return fromUrl(raw);
  const m = SHORTHAND.exec(raw);
  if (m) return github(raw, m[1]!, m[2]!, '', undefined, m[3]);
  throw usageError(`${raw.includes('@') ? 'the source' : `'${raw}'`} is not a source: ${USAGE}`);
}

/** Where discovery starts inside the source: the `github:` path, else the root. */
export const searchPathOf = (source: AddSource) => (source.kind === 'github' ? source.path : '');
