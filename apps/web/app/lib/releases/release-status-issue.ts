/**
 * `GET /api/v1/packages/@handle/slug/releases/:version/status`: the signed
 * `skillx.release-status/v1` document of one release, so a consumer can
 * verify yank and quarantine offline with the published registry key.
 *
 * Issuing is lazy and monotonic. The latest document is kept in R2
 * (content-addressed, create-only) and its sequence, issuedAt and key in
 * D1. It is served again while it reports the current effective state and
 * key and was issued less than `STATUS_REISSUE_SECONDS` ago (so it always
 * has at least 12h of its 24h lifetime left). Otherwise a new one is signed:
 * the sequence advances by the transitions needed to reach the new state
 * (at least 1), issuedAt is at least one second after the previous one and
 * never before the manifest createdAt. A compare-and-set on the sequence
 * makes concurrent requests agree: the loser serves the winner's document,
 * so two different documents never share a sequence.
 */
import { RELEASE_SIGNATURE_ALGORITHM, SKILLX_RELEASE_STATUS_SCHEMA_VERSION, canonicalJsonBytes, isReachableState, releaseManifestDigest, signReleaseStatus } from "@skillx/contracts";
import type { SkillxReleaseManifest, SkillxReleaseStatus, UnsignedReleaseStatus } from "@skillx/contracts";
import { putCreateOnly, statusKey } from "./r2-create-only";
import { findReleaseForStatus, notFound, parsePackageIdentity, parseReleaseVersion } from "./release-access";
import type { ReleaseRowAccess } from "./release-access";
import { releaseError } from "./release-http";
import { SHORT_TTL_SECONDS, VARY_VIEWER, cacheControl, readManifest } from "./release-read";
import type { ReadContext } from "./release-read";
import { effectiveStatus } from "./release-status-state";
import type { EffectiveStatus } from "./release-status-state";
import type { RegistrySigner } from "./sign-manifest";
import { releaseTimestamp } from "./sign-manifest";

export const STATUS_LIFETIME_SECONDS = 24 * 60 * 60;
export const STATUS_REISSUE_SECONDS = 12 * 60 * 60;
const MAX_STATUS_BYTES = 8 * 1024;

export interface StatusDeps {
  loadSigner: () => Promise<RegistrySigner>;
  /** The configured signing key ID; a document under another key is re-signed. */
  activeKeyId: string | undefined;
  now?: () => Date;
}

interface StoredStatus {
  sequence: number | null;
  key: string | null;
}

async function storedStatus(db: D1Database, releaseId: string): Promise<StoredStatus> {
  const row = await db
    .prepare("SELECT status_sequence, status_key FROM package_releases WHERE id = ?")
    .bind(releaseId)
    .first<{ status_sequence: number | null; status_key: string | null }>();
  return { sequence: row?.status_sequence ?? null, key: row?.status_key ?? null };
}

async function loadStatus(bucket: R2Bucket, key: string): Promise<{ status: SkillxReleaseStatus; bytes: Uint8Array }> {
  const object = await bucket.get(key);
  if (object === null || object.size > MAX_STATUS_BYTES) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  const bytes = new Uint8Array(await object.arrayBuffer());
  return { status: JSON.parse(new TextDecoder().decode(bytes)) as SkillxReleaseStatus, bytes };
}

/** Fewest transitions from `from` to `to` (the graph reaches every served state within 2). */
function stepsBetween(from: UnsignedReleaseStatus["state"], to: UnsignedReleaseStatus["state"]): number {
  for (let steps = 1; steps <= 4; steps++) if (isReachableState(from, to, steps)) return steps;
  throw new Error(`release state ${to} is unreachable from ${from}`);
}

function reusable(previous: SkillxReleaseStatus | null, effective: EffectiveStatus, deps: StatusDeps, nowMs: number): boolean {
  return (
    previous !== null &&
    previous.state === effective.state &&
    previous.reason === effective.reason &&
    previous.keyId === deps.activeKeyId?.trim() &&
    nowMs < Date.parse(previous.issuedAt) + STATUS_REISSUE_SECONDS * 1000
  );
}

async function issueStatus(
  ctx: ReadContext,
  release: ReleaseRowAccess,
  manifest: SkillxReleaseManifest,
  effective: EffectiveStatus,
  previous: SkillxReleaseStatus | null,
  deps: StatusDeps,
  nowMs: number,
): Promise<{ status: SkillxReleaseStatus; bytes: Uint8Array; key: string }> {
  const signer = await deps.loadSigner();
  // A first status of a non-published release counts the implied `published` one before it (sequence 1 must be published).
  const sequence =
    previous === null
      ? 1 + (effective.state === "published" ? 0 : stepsBetween("published", effective.state))
      : previous.sequence + stepsBetween(previous.state, effective.state);
  const floorMs = Math.max(
    Math.floor(nowMs / 1000) * 1000,
    previous === null ? 0 : Date.parse(previous.issuedAt) + 1000,
    Date.parse(manifest.createdAt),
  );
  const unsigned: UnsignedReleaseStatus = {
    schemaVersion: SKILLX_RELEASE_STATUS_SCHEMA_VERSION,
    releaseDigest: release.releaseDigest,
    manifestDigest: await releaseManifestDigest(manifest),
    state: effective.state,
    ...(effective.reason === undefined ? {} : { reason: effective.reason }),
    issuedAt: releaseTimestamp(new Date(floorMs)),
    expiresAt: releaseTimestamp(new Date(floorMs + STATUS_LIFETIME_SECONDS * 1000)),
    sequence,
    keyId: signer.keyId,
    signatureAlgorithm: RELEASE_SIGNATURE_ALGORITHM,
  };
  const status = await signReleaseStatus(unsigned, signer.privateKey);
  const bytes = canonicalJsonBytes(status);
  const hex = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
  const key = statusKey(hex);
  await putCreateOnly(ctx.bucket, key, bytes, { sha256Hex: hex, contentType: "application/json", verifyExisting: true });
  return { status, bytes, key };
}

function statusResponse(release: ReleaseRowAccess, status: SkillxReleaseStatus, bytes: Uint8Array, key: string): Response {
  const etag = `"${/([0-9a-f]{64})\.json$/.exec(key)?.[1] ?? ""}"`;
  return new Response(bytes as Uint8Array<ArrayBuffer>, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": cacheControl(release, SHORT_TTL_SECONDS, false),
      "X-Content-Type-Options": "nosniff",
      ...VARY_VIEWER,
      ETag: etag,
      "X-SkillX-Release-State": status.state,
      "X-SkillX-Release-Digest": release.releaseDigest,
      "X-SkillX-Identity": release.identity,
      "X-SkillX-Version": release.version,
    },
  });
}

export async function readReleaseStatus(ctx: ReadContext, params: Record<string, string | undefined>, deps: StatusDeps): Promise<Response> {
  const identity = parsePackageIdentity(params.scope, params.slug);
  const version = parseReleaseVersion(params.version);
  const release = await findReleaseForStatus(ctx.db, identity, version, ctx.userId);
  if (release === null) throw notFound();
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  const effective = await effectiveStatus(ctx.db, release);
  const stored = await storedStatus(ctx.db, release.id);
  const previous = stored.key === null ? null : await loadStatus(ctx.bucket, stored.key);
  if (previous !== null && reusable(previous.status, effective, deps, nowMs)) {
    return statusResponse(release, previous.status, previous.bytes, stored.key!);
  }
  const manifest = await readManifest(ctx.bucket, release);
  const issued = await issueStatus(ctx, release, manifest, effective, previous?.status ?? null, deps, nowMs);
  const cas = await ctx.db
    .prepare("UPDATE package_releases SET status_sequence = ?, status_issued_at = ?, status_key = ? WHERE id = ? AND status_sequence IS ?")
    .bind(issued.status.sequence, Date.parse(issued.status.issuedAt), issued.key, release.id, stored.sequence)
    .run();
  if ((cas.meta.changes ?? 0) === 1) return statusResponse(release, issued.status, issued.bytes, issued.key);
  // A concurrent request recorded its document first; serve that one so one sequence never has two documents.
  const winner = await storedStatus(ctx.db, release.id);
  if (winner.key === null) throw releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
  const won = await loadStatus(ctx.bucket, winner.key);
  return statusResponse(release, won.status, won.bytes, winner.key);
}
