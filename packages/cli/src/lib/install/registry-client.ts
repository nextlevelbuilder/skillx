import { PACKAGE_NAME_PATTERN as PACKAGE } from '@skillx/contracts';
import { InstallError } from './install-errors.js';

/**
 * The registry reads the installer needs: signed manifests and file bytes
 * from the pinned release read API, kit locks from the personal kit API and
 * collection revisions from the collections API. Base URL, credentials and
 * `fetch` are injected, so tests drive an in-process server and nothing here
 * reads the user's config. The API key is sent only to `baseUrl`.
 */

export interface RegistryOptions {
  baseUrl: string;
  apiKey?: string;
  fetch?: typeof fetch;
}

export interface ReleaseSummary {
  version: string;
  channel: string;
  state: string;
  releaseDigest: string;
}

export interface CollectionRevisionView {
  id: string;
  collectionId: string;
  revisionNumber: number;
  revisionDigest: string | null;
  members: Array<{ packageName: string; version?: string; digest?: string }>;
  config: Record<string, unknown>;
}

export interface KitLockResponse {
  lock: unknown;
  documents: unknown[];
  warnings: string[];
}

export interface Registry {
  manifest(releaseDigest: string, pkg: string, version: string): Promise<Uint8Array>;
  file(releaseDigest: string, pkg: string, version: string, path: string): Promise<Uint8Array>;
  releases(pkg: string): Promise<ReleaseSummary[]>;
  kitLock(kit: string, revisionId?: string): Promise<KitLockResponse>;
  collectionRevision(id: string, revision: number | 'latest'): Promise<CollectionRevisionView>;
}

const KIT = /^@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63}$/;
const COLLECTION_ID = /^col_[0-9a-f-]{36}$/;
const REVISION_ID = /^[a-z]+_[0-9a-f-]{36}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;

function classify(status: number, what: string): InstallError {
  if (status === 404) return new InstallError('not_found', `${what} was not found`, { status });
  if (status === 401 || status === 403) return new InstallError('auth_error', `the registry refused ${what}`, { status });
  if (status === 429) return new InstallError('rate_limited', `the registry rate limited ${what}`, { status }, 'Retry later.');
  return new InstallError('api_error', `the registry answered ${status} for ${what}`, { status });
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

/** Only https, or plain http to this machine: credentials never travel in clear text. */
export function assertSecureRegistry(baseUrl: string): void {
  let url: URL;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new InstallError('usage_error', `invalid registry URL ${baseUrl}`);
  }
  const loopback = LOOPBACK.has(url.hostname) || url.hostname.endsWith('.localhost');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) {
    throw new InstallError('usage_error', `the registry must use https (plain http only for localhost): ${url.origin}`);
  }
}

export function createRegistry(options: RegistryOptions): Registry {
  assertSecureRegistry(options.baseUrl);
  const base = options.baseUrl.replace(/\/+$/, '');
  const doFetch = options.fetch ?? fetch;

  async function get(path: string, what: string): Promise<Response> {
    const headers: Record<string, string> = { Accept: 'application/json, application/octet-stream' };
    if (options.apiKey) headers.Authorization = `Bearer ${options.apiKey}`;
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, { headers, redirect: 'error' });
    } catch (error) {
      throw new InstallError('network_error', `could not reach the registry for ${what}: ${error instanceof Error ? error.message : String(error)}`);
    }
    if (!res.ok) {
      void res.body?.cancel().catch(() => undefined);
      throw classify(res.status, what);
    }
    return res;
  }
  const bytes = async (path: string, what: string) => new Uint8Array(await (await get(path, what)).arrayBuffer());
  const json = async <T>(path: string, what: string) => (await (await get(path, what)).json()) as T;

  const check = (ok: boolean, message: string) => {
    if (!ok) throw new InstallError('usage_error', message);
  };
  const selector = (pkg: string, version: string) => `?version=${encodeURIComponent(version)}&package=${encodeURIComponent(pkg)}`;

  return {
    manifest(releaseDigest, pkg, version) {
      check(DIGEST.test(releaseDigest) && PACKAGE.test(pkg), `invalid release reference ${pkg}@${version}`);
      return bytes(`/api/v1/releases/${releaseDigest}/manifest${selector(pkg, version)}`, `the manifest of ${pkg}@${version}`);
    },
    file(releaseDigest, pkg, version, path) {
      check(DIGEST.test(releaseDigest) && PACKAGE.test(pkg), `invalid release reference ${pkg}@${version}`);
      const encoded = path.split('/').map(encodeURIComponent).join('/');
      return bytes(`/api/v1/releases/${releaseDigest}/files/${encoded}${selector(pkg, version)}`, `${path} of ${pkg}@${version}`);
    },
    async releases(pkg) {
      check(PACKAGE.test(pkg), `invalid package name ${pkg}`);
      const body = await json<{ releases?: ReleaseSummary[] }>(`/api/v1/packages/${pkg}/releases`, `the releases of ${pkg}`);
      return Array.isArray(body.releases) ? body.releases : [];
    },
    kitLock(kit, revisionId) {
      check(KIT.test(kit), `invalid kit name ${kit}`);
      check(revisionId === undefined || REVISION_ID.test(revisionId), `invalid kit revision id ${revisionId}`);
      const query = revisionId === undefined ? '' : `?revision=${encodeURIComponent(revisionId)}`;
      return json<KitLockResponse>(`/api/v1/kits/${kit}/lock${query}`, `the lock of kit ${kit}`);
    },
    async collectionRevision(id, revision) {
      check(COLLECTION_ID.test(id), `invalid collection id ${id}`);
      const body = await json<{ revision: CollectionRevisionView }>(`/api/v1/collections/${id}/revisions/${revision}`, `collection ${id}`);
      return body.revision;
    },
  };
}
