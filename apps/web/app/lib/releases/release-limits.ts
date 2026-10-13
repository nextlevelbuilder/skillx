/**
 * Server-side limits and the feature flag of the release publish API.
 *
 * The `agentkit.skill-tree/v1` contract allows trees up to 256 MiB and 4,096
 * files. A Worker buffers the upload in memory (128 MB isolate) and writes
 * one R2 object per file, so the registry accepts less. A lower limit only
 * ever rejects with `tree.limit_exceeded`; it never changes a digest, so it
 * stays contract-compatible.
 */
import type { TreeLimits } from "@skillx/skill-tree";

const MiB = 1024 * 1024;

/** Largest accepted request body: the uncompressed tar artifact. */
export const MAX_RELEASE_UPLOAD_BYTES = 32 * MiB;

/** Tree limits applied while the upload streams through the tar reader. */
export const RELEASE_SERVER_TREE_LIMITS: TreeLimits = {
  maxEntries: 10_000,
  maxFiles: 1_000,
  maxFileSize: 32 * MiB,
  maxTreeSize: 32 * MiB,
};

/** Largest accepted `X-SkillX-Release` metadata header (base64 text). */
export const MAX_RELEASE_METADATA_HEADER_BYTES = 16 * 1024;

/** Concurrent R2 writes of per-file blobs. */
export const BLOB_WRITE_CONCURRENCY = 6;

/** Worker var `SKILLX_RELEASES_API`: the release API answers only when it is "1" or "true". */
export function releasesApiEnabled(env: { SKILLX_RELEASES_API?: string }): boolean {
  const value = (env.SKILLX_RELEASES_API ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}
