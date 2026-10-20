import { compareVersions, parseVersion } from '@skillx/contracts';
import { integrityError, InstallError } from './install-errors.js';
import type { Registry } from './registry-client.js';

/**
 * Pins one package reference to an exact release. An explicit version must
 * exist (a yanked one installs with a warning, so a pinned recipe keeps
 * working); without a version the newest published release wins, stable
 * before prerelease. A pinned digest must equal the release's digest.
 */

export interface Pin {
  version: string;
  releaseDigest: string;
}

/** Highest of a list of versions, preferring releases without a prerelease tag. */
export function newestVersion(versions: readonly string[]): string | null {
  const parsed = versions.map((v) => ({ v, p: parseVersion(v) })).filter((x) => x.p !== null);
  const stable = parsed.filter((x) => x.p!.prerelease === null);
  const pool = stable.length > 0 ? stable : parsed;
  pool.sort((a, b) => compareVersions(b.p!, a.p!));
  return pool[0]?.v ?? null;
}

export async function resolvePin(registry: Registry, wanted: { name: string; version?: string; digest?: string }, warnings: string[]): Promise<Pin> {
  const releases = await registry.releases(wanted.name);
  let version = wanted.version;
  if (version === undefined) {
    version = newestVersion(releases.filter((r) => r.state === 'published').map((r) => r.version)) ?? undefined;
    if (version === undefined) throw new InstallError('not_found', `${wanted.name} has no published release`, { package: wanted.name });
  }
  const release = releases.find((r) => r.version === version);
  if (release === undefined) throw new InstallError('not_found', `${wanted.name}@${version} was not found`, { package: wanted.name, version });
  if (release.state !== 'published') warnings.push(`${wanted.name}@${version} is ${release.state}`);
  if (wanted.digest !== undefined && wanted.digest !== release.releaseDigest) {
    throw integrityError(`${wanted.name}@${version} is ${release.releaseDigest}, not the pinned ${wanted.digest}`, { package: wanted.name, version });
  }
  return { version, releaseDigest: release.releaseDigest };
}
