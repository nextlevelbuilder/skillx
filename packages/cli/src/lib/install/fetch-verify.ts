import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { applyOverlay, canonicalJsonBytes, kitTreeDigest, normalizeCompatibility, verifyReleaseManifest } from '@skillx/contracts';
import type { InstallLockPackage, KitTree, SkillOverlay, SkillxPackageManifest, SkillxReleaseManifest } from '@skillx/contracts';
import { incompatibleError, integrityError } from './install-errors.js';
import type { Registry } from './registry-client.js';

/**
 * Fetch and verify one locked package. Nothing is trusted until checked:
 * the manifest must be canonical, signed by a trusted key and name exactly
 * the pinned identity, version and release digest; every file must match its
 * manifest size and SHA-256; every overlay must hash to its locked digest;
 * and the composed tree must hash to `compositionDigest`. Verified file
 * bytes are cached by SHA-256 under `<skillxHome>/cache/blobs`.
 */

export interface VerifiedFile {
  path: string;
  mode: '100644' | '100755';
  sha256: string;
  size: number;
  bytes: Uint8Array;
}

export interface VerifiedTree {
  digest: string;
  files: VerifiedFile[];
}

export interface FetchDeps {
  registry: Registry;
  keys: ReadonlyMap<string, Uint8Array>;
  cacheDir: string;
  runtime: string;
}

export const sha256Hex = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function cached(cacheDir: string, sha256: string): Uint8Array | null {
  try {
    const bytes = new Uint8Array(readFileSync(join(cacheDir, sha256)));
    return sha256Hex(bytes) === sha256 ? bytes : null;
  } catch {
    return null;
  }
}

function store(cacheDir: string, sha256: string, bytes: Uint8Array): void {
  mkdirSync(cacheDir, { recursive: true });
  const tmp = join(cacheDir, `.${sha256}.${randomUUID()}.tmp`);
  writeFileSync(tmp, bytes);
  renameSync(tmp, join(cacheDir, sha256));
}

async function verifiedManifest(deps: FetchDeps, pkg: InstallLockPackage): Promise<SkillxReleaseManifest> {
  const bytes = await deps.registry.manifest(pkg.releaseDigest, pkg.package, pkg.version);
  const verdict = await verifyReleaseManifest(bytes, deps.keys);
  if (!verdict.valid) {
    throw integrityError(`the manifest of ${pkg.package}@${pkg.version} failed verification`, { package: pkg.package, issues: verdict.issues.map((i) => i.code) });
  }
  const manifest = JSON.parse(new TextDecoder().decode(bytes)) as SkillxReleaseManifest;
  if (manifest.identity !== pkg.package || manifest.version !== pkg.version || manifest.releaseDigest !== pkg.releaseDigest) {
    throw integrityError(`the signed manifest does not name ${pkg.package}@${pkg.version} ${pkg.releaseDigest}`, { package: pkg.package });
  }
  return manifest;
}

async function fileBytes(deps: FetchDeps, pkg: InstallLockPackage, file: SkillxReleaseManifest['files'][number]): Promise<Uint8Array> {
  const hit = cached(deps.cacheDir, file.sha256);
  if (hit !== null && hit.length === file.size) return hit;
  const bytes = await deps.registry.file(pkg.releaseDigest, pkg.package, pkg.version, file.path);
  if (bytes.length !== file.size || sha256Hex(bytes) !== file.sha256) {
    throw integrityError(`${file.path} of ${pkg.package}@${pkg.version} does not match its signed manifest`, { package: pkg.package, path: file.path });
  }
  store(deps.cacheDir, file.sha256, bytes);
  return bytes;
}

/** Refuses a tree whose `skillx.json` declares the target runtime unsupported or out of range. */
function checkCompatibility(tree: VerifiedTree, pkg: InstallLockPackage, runtime: string): void {
  const manifest = tree.files.find((f) => f.path === 'skillx.json');
  if (manifest === undefined) return;
  let declared: SkillxPackageManifest;
  try {
    declared = JSON.parse(new TextDecoder().decode(manifest.bytes)) as SkillxPackageManifest;
  } catch {
    return;
  }
  if (declared.compatible === undefined) return;
  const verdict = normalizeCompatibility({ runtime }, { declaration: declared.compatible, releaseDigest: pkg.releaseDigest });
  if (verdict.status === 'unsupported' || verdict.status === 'blocked') {
    throw incompatibleError(`${pkg.package}@${pkg.version} is ${verdict.status} on ${runtime}`, { package: pkg.package, runtime, status: verdict.status });
  }
}

export async function fetchVerified(deps: FetchDeps, pkg: InstallLockPackage, overlays: readonly SkillOverlay[]): Promise<VerifiedTree> {
  const manifest = await verifiedManifest(deps, pkg);
  const bytesByPath = new Map<string, Uint8Array>();
  for (const file of manifest.files) bytesByPath.set(file.path, await fileBytes(deps, pkg, file));

  let tree: KitTree = {
    digest: manifest.releaseDigest,
    files: manifest.files.map(({ path, mode, size, sha256 }) => ({ path, mode, size, sha256 })),
    read: async (path) => bytesByPath.get(path) ?? Promise.reject(new Error(`no file ${path}`)),
    declaredScripts: manifest.declaredScripts,
  };
  if (overlays.length !== pkg.overlayDigests.length) throw integrityError(`the overlays of ${pkg.alias} do not match the lock`, { alias: pkg.alias });
  for (const [i, overlay] of overlays.entries()) {
    if (`sha256:${sha256Hex(canonicalJsonBytes(overlay))}` !== pkg.overlayDigests[i]) {
      throw integrityError(`overlay ${i + 1} of ${pkg.alias} does not match its locked digest`, { alias: pkg.alias });
    }
    try {
      tree = await applyOverlay(tree, overlay);
    } catch (error) {
      throw integrityError(`overlay ${i + 1} of ${pkg.alias} does not apply: ${error instanceof Error ? error.message : String(error)}`, { alias: pkg.alias });
    }
  }
  const digest = await kitTreeDigest(tree.files);
  if (digest !== pkg.compositionDigest) {
    throw integrityError(`the composed tree of ${pkg.alias} does not match compositionDigest`, { alias: pkg.alias, expected: pkg.compositionDigest, actual: digest });
  }
  const files: VerifiedFile[] = [];
  for (const f of tree.files) files.push({ path: f.path, mode: f.mode as VerifiedFile['mode'], sha256: f.sha256, size: f.size, bytes: await tree.read(f.path) });
  const verified = { digest, files };
  checkCompatibility(verified, pkg, deps.runtime);
  return verified;
}
