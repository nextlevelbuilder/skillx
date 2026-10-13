/**
 * Server-side limits and the feature flag of the release publish API.
 *
 * The `agentkit.skill-tree/v1` contract allows trees up to 256 MiB and 4,096
 * files. A Worker buffers the upload in memory (128 MB isolate) and writes
 * one R2 object per file within a per-request subrequest budget, so the
 * registry accepts less (1,000 files, 32 MiB). A lower limit only
 * ever rejects with `tree.limit_exceeded`; it never changes a digest, so it
 * stays contract-compatible.
 */
import { ERROR_CODES } from "@skillx/skill-tree";
import type { TreeLimits } from "@skillx/skill-tree";
import { releaseError } from "./release-http";

const MiB = 1024 * 1024;

/** Largest accepted request body: the uncompressed tar artifact. */
export const MAX_RELEASE_UPLOAD_BYTES = 32 * MiB;

/**
 * Default subrequests one publish may spend (Worker var
 * `SKILLX_RELEASE_SUBREQUEST_BUDGET` overrides it). Every D1 query and R2
 * call counts. Workers Paid allows 10,000 per request by default; this is
 * half of that for headroom. On a free account (1,000 cap) set the var lower.
 */
export const DEFAULT_RELEASE_SUBREQUEST_BUDGET = 5000;

/**
 * Subrequests of a publish besides the per-file blob puts, rounded up:
 * D1 key lookups (2), last-use update, publisher, package and release reads,
 * the insert batch and the conflict re-read (8), plus R2 artifact and
 * manifest put + head (4).
 */
export const RELEASE_FIXED_SUBREQUESTS = 16;

/** Tree limits applied while the upload streams through the tar reader. */
export const RELEASE_SERVER_TREE_LIMITS: TreeLimits = {
  maxEntries: 10_000,
  // One R2 put per distinct file; the subrequest budget guard checks the total.
  maxFiles: 1_000,
  maxFileSize: 32 * MiB,
  maxTreeSize: 32 * MiB,
};

/**
 * Refuses, before any R2 write, a publish whose planned subrequests (one put
 * per distinct blob plus the fixed cost) exceed the budget, so a request can
 * never die half-way at the platform cap and fail the same way on retry.
 */
export function assertSubrequestBudget(blobPuts: number, budget = DEFAULT_RELEASE_SUBREQUEST_BUDGET): void {
  const planned = blobPuts + RELEASE_FIXED_SUBREQUESTS;
  if (planned > budget) {
    throw releaseError(413, ERROR_CODES.limitExceeded, `release needs ${planned} storage operations; the limit is ${budget}`);
  }
}

/** Largest accepted `X-SkillX-Release` metadata header (base64 text). */
export const MAX_RELEASE_METADATA_HEADER_BYTES = 16 * 1024;

/** Concurrent R2 writes of per-file blobs. */
export const BLOB_WRITE_CONCURRENCY = 6;

/**
 * Worker var `SKILLX_RELEASE_SUBREQUEST_BUDGET`: a positive integer, else the
 * default. A malformed value is reported and falls back to the default.
 */
export function releaseSubrequestBudget(env: { SKILLX_RELEASE_SUBREQUEST_BUDGET?: string }): number {
  const raw = (env.SKILLX_RELEASE_SUBREQUEST_BUDGET ?? "").trim();
  if (raw === "") return DEFAULT_RELEASE_SUBREQUEST_BUDGET;
  const value = /^[1-9][0-9]{0,6}$/.test(raw) ? Number(raw) : NaN;
  if (Number.isNaN(value)) {
    console.warn("SKILLX_RELEASE_SUBREQUEST_BUDGET is not a positive integer; using the default");
    return DEFAULT_RELEASE_SUBREQUEST_BUDGET;
  }
  return value;
}

/** Worker var `SKILLX_RELEASES_API`: the release API answers only when it is "1" or "true". */
export function releasesApiEnabled(env: { SKILLX_RELEASES_API?: string }): boolean {
  const value = (env.SKILLX_RELEASES_API ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}
