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
 * makes concurrent requests agree, so two documents never share a sequence:
 * the loser re-reads and serves the winner only if it still reports the state
 * the loser observes, and answers 503 after `MAX_ISSUE_ATTEMPTS` lost races.
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
  issuedAtMs: number | null;
  key: string | null;
}

/** A sequence gap that makes every served state reachable from any previous one (the verifier's transition cap). */
const UNKNOWN_PREVIOUS_STEPS = 4;
const MAX_ISSUE_ATTEMPTS = 3;

async function storedStatus(db: D1Database, releaseId: string): Promise<StoredStatus> {
  const row = await db
    .prepare("SELECT status_sequence, status_issued_at, status_key FROM package_releases WHERE id = ?")
    .bind(releaseId)
    .first<{ status_sequence: number | null; status_issued_at: number | null; status_key: string | null }>();
  return { sequence: row?.status_sequence ?? null, issuedAtMs: row?.status_issued_at ?? null, key: row?.status_key ?? null };
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The stored document, or null when it is missing, oversized, does not hash
 * to its key, or is not this release's status. A null previous document is
 * re-issued, never a permanent error.
 */
async function loadStatus(bucket: R2Bucket, key: string, releaseDigest: string): Promise<Loaded | null> {
  const object = await bucket.get(key);
  if (object === null || object.size > MAX_STATUS_BYTES) return null;
  const bytes = new Uint8Array(await object.arrayBuffer());
  if (key !== statusKey(await sha256Hex(bytes))) return null;
  try {
    const status = JSON.parse(new TextDecoder().decode(bytes)) as SkillxReleaseStatus;
    return status.releaseDigest === releaseDigest && Number.isSafeInteger(status.sequence) ? { status, bytes, key } : null;
  } catch {
    return null;
  }
}

interface Loaded {
  status: SkillxReleaseStatus;
  bytes: Uint8Array;
  key: string;
}

/** Fewest transitions from `from` to `to` (the graph reaches every served state within 2). */
function stepsBetween(from: UnsignedReleaseStatus["state"], to: UnsignedReleaseStatus["state"]): number {
  for (let steps = 1; steps <= UNKNOWN_PREVIOUS_STEPS; steps++) if (isReachableState(from, to, steps)) return steps;
  throw new Error(`release state ${to} is unreachable from ${from}`);
}

/**
 * The next sequence, strictly above both the recorded sequence and the
 * previous document. When the previous document is unknown (missing object,
 * or the pointer lost by a migration rollback) the gap is the transition cap,
 * so any state stays reachable for a consumer holding an older document.
 */
function nextSequence(stored: StoredStatus, previous: SkillxReleaseStatus | null, state: EffectiveStatus["state"]): number {
  if (previous !== null && previous.sequence === stored.sequence) return previous.sequence + stepsBetween(previous.state, state);
  if (previous === null && stored.sequence === null) return 1 + (state === "published" ? 0 : stepsBetween("published", state));
  return Math.max(stored.sequence ?? 0, previous?.sequence ?? 0) + UNKNOWN_PREVIOUS_STEPS;
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
  stored: StoredStatus,
  previous: SkillxReleaseStatus | null,
  deps: StatusDeps,
  nowMs: number,
): Promise<Loaded> {
  const signer = await deps.loadSigner();
  // A first status of a non-published release counts the implied `published` one before it (sequence 1 must be published).
  const sequence = nextSequence(stored, previous, effective.state);
  const floorMs = Math.max(
    Math.floor(nowMs / 1000) * 1000,
    previous === null ? 0 : Date.parse(previous.issuedAt) + 1000,
    stored.issuedAtMs === null ? 0 : stored.issuedAtMs + 1000,
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
  const hex = await sha256Hex(bytes);
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
  const nowMs = (deps.now?.() ?? new Date()).getTime();
  // Every attempt re-reads the release, so a document is served only when it matches the state this request observed.
  for (let attempt = 0; attempt < MAX_ISSUE_ATTEMPTS; attempt++) {
    const release = await findReleaseForStatus(ctx.db, identity, version, ctx.userId);
    if (release === null) throw notFound();
    const effective = effectiveStatus(release);
    const stored = await storedStatus(ctx.db, release.id);
    const previous = stored.key === null ? null : await loadStatus(ctx.bucket, stored.key, release.releaseDigest);
    if (previous !== null && previous.status.sequence === stored.sequence && reusable(previous.status, effective, deps, nowMs)) {
      return statusResponse(release, previous.status, previous.bytes, previous.key);
    }
    const manifest = await readManifest(ctx.bucket, release);
    const issued = await issueStatus(ctx, release, manifest, effective, stored, previous?.status ?? null, deps, nowMs);
    const cas = await ctx.db
      .prepare("UPDATE package_releases SET status_sequence = ?, status_issued_at = ?, status_key = ? WHERE id = ? AND status_sequence IS ?")
      .bind(issued.status.sequence, Date.parse(issued.status.issuedAt), issued.key, release.id, stored.sequence)
      .run();
    if ((cas.meta.changes ?? 0) === 1) return statusResponse(release, issued.status, issued.bytes, issued.key);
    // A concurrent request recorded a document first: retry, serving it only if it reports what the next read observes.
  }
  throw releaseError(503, "release.status_contended", "release status is being updated; retry shortly");
}