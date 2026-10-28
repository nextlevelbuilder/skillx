import {
  INSTALL_LOCK_SCHEMA,
  INSTALL_RESOLVER_VERSION,
  PACKAGE_NAME_PATTERN,
  canonicalJsonBytes,
  collectionRevisionDigest,
  isInstallAlias,
  sortLockPackages,
} from '@skillx/contracts';
import type { InstallLock, InstallLockPackage, PersonalKitDocument, PersonalKitLock, SkillOverlay } from '@skillx/contracts';
import { sha256Hex } from './fetch-verify.js';
import { incompatibleError, integrityError, usageError } from './install-errors.js';
import type { Registry } from './registry-client.js';
import { resolvePin } from './release-pins.js';

/**
 * Resolves a source to an exact `skillx.lock/v1`: a kit revision (through
 * the personal kit lock), a collection revision, or explicit packages. Every
 * package ends pinned by version, release digest and composition digest;
 * the overlays a kit entry needs are returned next to the lock (the lock
 * holds only their digests).
 */

export type SourceRef =
  | { kind: 'kit'; kit: string; revisionId?: string }
  | { kind: 'collection'; id: string; revision: number | 'latest' }
  | { kind: 'packages'; packages: Array<{ name: string; version?: string; digest?: string }> };

export interface Resolution {
  lock: InstallLock;
  /** Overlay layers by alias, in lock order; absent for packages installed as published. */
  overlays: Map<string, SkillOverlay[]>;
  warnings: string[];
}

const KIT_REF = /^kit:(@[a-z0-9][a-z0-9-]{0,38}\/[a-z0-9][a-z0-9._-]{0,63})(?:#([a-z]+_[0-9a-f-]{36}))?$/;
const COLLECTION_REF = /^collection:(col_[0-9a-f-]{36})(?:#(\d{1,9}|latest))?$/;
/** `#sha256:<hex>` pins the reviewed tree: a release with another digest is refused, never installed. */
const PACKAGE_REF = /^(@[^@\s#]+\/[^@\s#]+)(?:@([^\s#]+))?(?:#(sha256:[0-9a-f]{64}))?$/;

/** `kit:@h/k[#revId]`, `collection:<id>[#n]`, or one or more `@p/s[@version][#sha256:<hex>]`. */
export function parseRefs(refs: readonly string[]): SourceRef {
  if (refs.length === 0) throw usageError('name a source: kit:@handle/kit, collection:<id> or @publisher/package');
  const kit = KIT_REF.exec(refs[0]!);
  const collection = COLLECTION_REF.exec(refs[0]!);
  if ((kit || collection) && refs.length > 1) throw usageError('install one kit or collection at a time');
  if (kit) return { kind: 'kit', kit: kit[1]!, ...(kit[2] ? { revisionId: kit[2] } : {}) };
  if (collection) return { kind: 'collection', id: collection[1]!, revision: collection[2] === undefined || collection[2] === 'latest' ? 'latest' : Number(collection[2]) };
  return {
    kind: 'packages',
    packages: refs.map((ref) => {
      const m = PACKAGE_REF.exec(ref);
      if (!m || !PACKAGE_NAME_PATTERN.test(m[1]!)) throw usageError(`'${ref}' is not kit:@h/k, collection:<id> or @publisher/package[@version][#sha256:<hex>]`);
      return { name: m[1]!, ...(m[2] ? { version: m[2] } : {}), ...(m[3] ? { digest: m[3] } : {}) };
    }),
  };
}

export const overlayDigestOf = (overlay: SkillOverlay) => `sha256:${sha256Hex(canonicalJsonBytes(overlay))}`;

function checkAliases(packages: readonly InstallLockPackage[]): void {
  const seen = new Set<string>();
  for (const p of packages) {
    if (!isInstallAlias(p.alias)) throw usageError(`'${p.alias}' (${p.package}) is not a valid skill directory name`);
    if (seen.has(p.alias)) throw usageError(`two packages install as '${p.alias}'`, { alias: p.alias });
    seen.add(p.alias);
  }
}

/** Overlays of the kit lock entries, found in the owned documents of the lineage by digest. */
function kitOverlays(packages: readonly InstallLockPackage[], documents: unknown[]): Map<string, SkillOverlay[]> {
  const byDigest = new Map<string, SkillOverlay>();
  for (const doc of documents as Array<PersonalKitDocument & { foreign?: boolean }>) {
    if (doc.foreign || !Array.isArray(doc.skills)) continue;
    for (const entry of doc.skills) if (entry.overlay.ops.length > 0) byDigest.set(overlayDigestOf(entry.overlay), entry.overlay);
  }
  const overlays = new Map<string, SkillOverlay[]>();
  for (const p of packages) {
    if (p.overlayDigests.length === 0) continue;
    const layers = p.overlayDigests.map((d) => byDigest.get(d));
    if (layers.some((l) => l === undefined)) {
      throw integrityError(`the overlay of ${p.alias} is not readable (it belongs to a kit you do not own)`, { alias: p.alias });
    }
    overlays.set(p.alias, layers as SkillOverlay[]);
  }
  return overlays;
}

export function checkRuntimes(runtimes: Record<string, string>, runtime: string): void {
  if (Object.keys(runtimes).length > 0 && !(runtime in runtimes)) {
    throw incompatibleError(`this source targets ${Object.keys(runtimes).join(', ')}, not ${runtime}`, { runtime, runtimes });
  }
}

async function resolveKit(registry: Registry, ref: { kit: string; revisionId?: string }): Promise<Resolution> {
  const res = await registry.kitLock(ref.kit, ref.revisionId);
  const kl = res.lock as PersonalKitLock | null;
  if (kl === null) throw incompatibleError(`kit ${ref.kit} has no installable revision`, { warnings: res.warnings });
  const packages = sortLockPackages(
    kl.entries.map((e) => ({ alias: e.alias, package: e.package, version: e.version, releaseDigest: e.releaseDigest, compositionDigest: e.compositionDigest, overlayDigests: e.overlayDigests })),
  );
  checkAliases(packages);
  const lock: InstallLock = {
    schema: INSTALL_LOCK_SCHEMA,
    resolver: INSTALL_RESOLVER_VERSION,
    source: { kind: 'kit', kit: kl.kit, revisionId: kl.revisionId, revisionNumber: kl.revisionNumber, revisionDigest: kl.revisionDigest },
    runtimes: kl.runtimes,
    packages,
  };
  return { lock, overlays: kitOverlays(packages, res.documents), warnings: res.warnings };
}

async function resolvePackages(registry: Registry, wanted: Array<{ name: string; version?: string; digest?: string }>, warnings: string[]): Promise<InstallLockPackage[]> {
  const packages: InstallLockPackage[] = [];
  for (const w of wanted) {
    const pin = await resolvePin(registry, w, warnings);
    packages.push({ alias: w.name.slice(w.name.indexOf('/') + 1), package: w.name, version: pin.version, releaseDigest: pin.releaseDigest, compositionDigest: pin.releaseDigest, overlayDigests: [] });
  }
  const sorted = sortLockPackages(packages);
  checkAliases(sorted);
  return sorted;
}

export async function resolveSource(registry: Registry, ref: SourceRef): Promise<Resolution> {
  const warnings: string[] = [];
  const base = { schema: INSTALL_LOCK_SCHEMA, resolver: INSTALL_RESOLVER_VERSION, runtimes: {} } as const;
  if (ref.kind === 'kit') return resolveKit(registry, ref);
  if (ref.kind === 'packages') {
    return { lock: { ...base, source: { kind: 'packages' }, packages: await resolvePackages(registry, ref.packages, warnings) }, overlays: new Map(), warnings };
  }
  const rev = await registry.collectionRevision(ref.id, ref.revision);
  const digest = await collectionRevisionDigest({ members: rev.members as never, config: rev.config as never });
  if (rev.revisionDigest !== null && rev.revisionDigest !== digest) throw integrityError(`collection ${ref.id} revision ${rev.revisionNumber} does not match its digest`);
  if (rev.revisionDigest === null) warnings.push(`collection ${ref.id} revision ${rev.revisionNumber} has no digest: the registry may have left out members you cannot read, so this install may be partial`);
  const wanted = rev.members.map((m) => ({ name: m.packageName, ...(m.version ? { version: m.version } : {}), ...(m.digest ? { digest: m.digest } : {}) }));
  const source = { kind: 'collection' as const, collectionId: rev.collectionId, revisionNumber: rev.revisionNumber, revisionDigest: digest };
  return { lock: { ...base, source, packages: await resolvePackages(registry, wanted, warnings) }, overlays: new Map(), warnings };
}

