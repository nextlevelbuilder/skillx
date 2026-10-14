/**
 * Loads the pinned base release of a kit entry as a `KitTree`, through the
 * same access rules as the pinned read API (`resolveReleaseByDigest` with the
 * version and package selectors, so another package shipping the same tree
 * never answers for the pin): the owner must be able to read it (public, or
 * entitled), the publisher must be active and no release of the tree may be
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

async function treeOf(bucket: R2Bucket, release: ReadableRelease): Promise<KitTree> {
  const manifest = await readManifest(bucket, release);
  const files = manifest.files.map((f) => ({ path: f.path, mode: f.mode, size: f.size, sha256: f.sha256 }));
  if ((await kitTreeDigest(files)) !== release.releaseDigest) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  const bySha = new Map(files.map((f) => [f.path, f]));
  const cache = new Map<string, Uint8Array>();
  return {
    digest: release.releaseDigest,
    files,
    declaredScripts: manifest.declaredScripts,
    read: async (path) => {
      const entry = bySha.get(path);
      if (entry === undefined) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
      const cached = cache.get(entry.sha256);
      if (cached !== undefined) return cached;
      const object = await bucket.get(blobKey(entry.sha256));
      if (object === null) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
      const bytes = new Uint8Array(await object.arrayBuffer());
      if (bytes.length !== entry.size || hex(await crypto.subtle.digest("SHA-256", bytes)) !== entry.sha256) {
        throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
      }
      cache.set(entry.sha256, bytes);
      return bytes;
    },
  };
}

/** The base an entry pins, checked against its package and version. */
export async function loadPinnedBase(env: Env, userId: string, base: KitSkillEntry["base"]): Promise<LoadedBase> {
  const release = await resolveReleaseByDigest(env.DB, base.releaseDigest, userId, base.version, base.package);
  return { release, tree: await treeOf(env.R2, release) };
}

/** A new upstream release by version (published only: a yanked version is never a rebase target). */
export async function loadUpstream(env: Env, userId: string, pkg: string, version: string): Promise<LoadedBase> {
  const release = await resolveReleaseByVersion(env.DB, pkg, version, userId);
  return { release, tree: await treeOf(env.R2, release) };
}
