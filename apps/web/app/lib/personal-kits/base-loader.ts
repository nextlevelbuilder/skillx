/**
 * Loads the pinned base release of a kit entry as a `KitTree`, through the
 * same access rules as the pinned read API (`resolveReleaseByDigest` with the
 * version and package selectors, so another package shipping the same tree
 * never answers for the pin): the owner must be able to read it (public, a
 * private package of a publisher they own, or entitled), the publisher must be active and no release of the tree may be
 * quarantined. A yanked base still
 * loads (pins keep working) and is reported. Blob bytes are checked against
 * the manifest SHA-256 before use; a mismatch is a storage failure.
 */
import { kitTreeDigest } from "@skillx/contracts";
import type { KitSkillEntry, KitTree } from "@skillx/contracts";
import { blobKey } from "~/lib/releases/r2-create-only";
import { resolveReleaseByDigest, resolveReleaseByVersion } from "~/lib/releases/release-access";
import type { ReadableRelease } from "~/lib/releases/release-access";
import { ReleaseHttpError, releaseError } from "~/lib/releases/release-http";
import { readManifest } from "~/lib/releases/release-read";

export interface LoadedBase {
  release: ReadableRelease;
  tree: KitTree;
}

/** Binding calls (D1 release lookups, R2 manifest and blob reads) one request may spend on bases. */
export const MAX_BASE_SUBREQUESTS = 800;

export interface BaseCache {
  bases: Map<string, Promise<LoadedBase>>;
  blobs: Map<string, Promise<Uint8Array>>;
  spent: number;
  limit: number;
}

export const newBaseCache = (limit = MAX_BASE_SUBREQUESTS): BaseCache => ({ bases: new Map(), blobs: new Map(), spent: 0, limit });

function spend(cache: BaseCache, n: number): void {
  cache.spent += n;
  if (cache.spent > cache.limit) {
    throw releaseError(422, "kit.request_too_large", `the kit needs more than ${cache.limit} base reads in one request; split it into smaller kits or fewer updates`);
  }
}

export type BaseFailure = "entitlement" | "revoked_base" | "unavailable";

/** Classifies an access failure of a base release. */
export function baseFailure(error: unknown): BaseFailure | null {
  if (!(error instanceof ReleaseHttpError)) return null;
  if (error.status === 404) return "entitlement";
  if (error.code === "release_quarantined" || error.code === "publisher_revoked") return "revoked_base";
  if (error.status === 410) return "unavailable";
  return null;
}

const hex = (buffer: ArrayBuffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, "0")).join("");

async function treeOf(bucket: R2Bucket, release: ReadableRelease, cache: BaseCache): Promise<KitTree> {
  spend(cache, 1);
  const manifest = await readManifest(bucket, release);
  const files = manifest.files.map((f) => ({ path: f.path, mode: f.mode, size: f.size, sha256: f.sha256 }));
  if ((await kitTreeDigest(files)) !== release.releaseDigest) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  const byPath = new Map(files.map((f) => [f.path, f]));
  return {
    digest: release.releaseDigest,
    files,
    declaredScripts: manifest.declaredScripts,
    read: async (path) => {
      const entry = byPath.get(path);
      if (entry === undefined) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
      let bytes = cache.blobs.get(entry.sha256);
      if (bytes === undefined) {
        spend(cache, 1);
        bytes = fetchBlob(bucket, entry);
        cache.blobs.set(entry.sha256, bytes);
      }
      return bytes;
    },
  };
}

async function fetchBlob(bucket: R2Bucket, entry: { sha256: string; size: number }): Promise<Uint8Array> {
  const object = await bucket.get(blobKey(entry.sha256));
  if (object === null) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (bytes.length !== entry.size || hex(await crypto.subtle.digest("SHA-256", bytes)) !== entry.sha256) {
    throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  }
  return bytes;
}

function cached(cache: BaseCache, key: string, load: () => Promise<LoadedBase>): Promise<LoadedBase> {
  let hit = cache.bases.get(key);
  if (hit === undefined) {
    spend(cache, 1);
    hit = load();
    cache.bases.set(key, hit);
  }
  return hit;
}

/** The base an entry pins, checked against its package and version. */
export function loadPinnedBase(env: Env, userId: string, base: KitSkillEntry["base"], cache: BaseCache): Promise<LoadedBase> {
  return cached(cache, `pin|${userId}|${base.package}|${base.version}|${base.releaseDigest}`, async () => {
    const release = await resolveReleaseByDigest(env.DB, base.releaseDigest, userId, base.version, base.package);
    return { release, tree: await treeOf(env.R2, release, cache) };
  });
}

/** A new upstream release by version (published only: a yanked version is never a rebase target). */
export function loadUpstream(env: Env, userId: string, pkg: string, version: string, cache: BaseCache): Promise<LoadedBase> {
  return cached(cache, `up|${userId}|${pkg}|${version}`, async () => {
    const release = await resolveReleaseByVersion(env.DB, pkg, version, userId);
    return { release, tree: await treeOf(env.R2, release, cache) };
  });
}
