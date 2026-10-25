/**
 * Pinned whole-tree read API. Every endpoint: 404 while `SKILLX_RELEASES_API`
 * is off, then viewer (unscoped or `library:read` Bearer API key, or session;
 * never a query string token; a bad key is 401), then the rate limit binding, then the
 * access rules of `release-access`. Stored bytes are streamed from the R2
 * body exactly as written by the publish path (no redirect, no
 * transformation, served as opaque downloads so a browser never renders
 * them).
 *
 * Caching: every error is `no-store`; every success varies on
 * `Authorization, Cookie` because the selected release can depend on the
 * viewer. Public file and artifact bytes are `immutable` for a year, so a
 * later quarantine cannot recall copies already held by browsers or proxies;
 * it only stops new fetches from this API. Private answers are never stored.
 */
import { RELEASE_KEY_ID_PATTERN, RELEASE_SIGNATURE_ALGORITHM, validateReleaseManifest } from "@skillx/contracts";
import type { SkillxReleaseManifest } from "@skillx/contracts";
import { validatePath } from "@skillx/skill-tree";
import { grantsLibraryRead } from "~/lib/auth/api-key-scopes";
import { resolveRequestCredential } from "~/lib/auth/scoped-viewer";
import { blobKey } from "./r2-create-only";
import {
  listPackageReleases,
  notFound,
  parsePackageIdentity,
  parseReleaseDigest,
  parseReleaseVersion,
  resolveReleaseByDigest,
  resolveReleaseByVersion,
} from "./release-access";
import type { ReadableRelease } from "./release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { MAX_RELEASE_UPLOAD_BYTES, RELEASE_SERVER_TREE_LIMITS, releasesApiEnabled } from "./release-limits";
import { checkReleaseRateLimit, rateLimitCaller } from "./release-rate-limit";

/** Largest stored manifest the API serves or parses (1,000 files fit in well under 1 MiB). */
export const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
/** Version lookups, listings and manifests may change state (yank, quarantine): short TTL. */
export const SHORT_TTL_SECONDS = 60;
const IMMUTABLE_TTL_SECONDS = 31_536_000;

export type ReleaseReadEnv = Env;

export interface ReadContext {
  db: D1Database;
  bucket: R2Bucket;
  userId: string | null;
  /** The API key of the viewer; null or absent for a session, anonymous or a signed download URL. */
  keyId?: string | null;
  request: Request;
}

type Params = Record<string, string | undefined>;

/**
 * The viewer of a request (see `resolveRequestCredential`): an unscoped API
 * key, the session, or anonymous. A bad key is `401 invalid_api_key`, never a
 * fall back. Every scoped key is refused the same way (MCP, collections).
 */
export async function resolveViewer(request: Request, env: ReleaseReadEnv): Promise<string | null> {
  return (await resolveRequestCredential(request, env)).userId;
}

/** Runs one read endpoint behind the flag, viewer resolution (a scoped key needs `library:read`) and the rate limit. */
export async function serveReleaseRead(
  request: Request,
  env: ReleaseReadEnv,
  handler: (ctx: ReadContext) => Promise<Response>,
): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  try {
    const { userId, keyId } = await resolveRequestCredential(request, env, grantsLibraryRead);
    const decision = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, rateLimitCaller(request, userId));
    if (!decision.allowed) {
      return errorResponse(
        releaseError(429, "rate_limited", `too many requests; retry after ${decision.retryAfterSeconds} seconds`),
        { "Retry-After": String(decision.retryAfterSeconds) },
      );
    }
    return await handler({ db: env.DB, bucket: env.R2, userId, keyId, request });
  } catch (error) {
    if (error instanceof ReleaseHttpError) {
      return errorResponse(error, error.status === 401 ? { "WWW-Authenticate": "Bearer" } : {});
    }
    console.error("release read failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release read failed"));
  }
}

/**
 * Public answers are cacheable (`immutable` for bytes). Every answer about a
 * private package is `private, no-store`, so revoking access, a quarantine or
 * a key revocation takes effect on the next request instead of after a
 * browser-held copy expires.
 */
export function cacheControl(release: { visibility: string }, maxAge: number, immutable: boolean): string {
  if (release.visibility !== "public") return "private, no-store";
  return `public, max-age=${maxAge}${immutable ? ", immutable" : ""}, no-transform`;
}

/** A stored object is missing or not what D1 recorded: an integrity failure, never served. */
export function storageError(what: string, context = "release read"): ReleaseHttpError {
  console.error(`${context}: ${what}`);
  return releaseError(500, "release.storage_inconsistent", "release storage is inconsistent");
}

function hexFromKey(key: string): string {
  return /([0-9a-f]{64})(?:\.[a-z]+)?$/.exec(key)?.[1] ?? "";
}

function stateHeaders(release: ReadableRelease): Record<string, string> {
  return {
    "X-SkillX-Release-State": release.state,
    "X-SkillX-Release-Digest": release.releaseDigest,
    "X-SkillX-Identity": release.identity,
    "X-SkillX-Version": release.version,
  };
}

/**
 * The current channel moves with promote and is not signed, so it is sent
 * only on short-lived answers, never on the year-long immutable file and
 * artifact responses.
 */
const channelHeader = (release: ReadableRelease) => ({ "X-SkillX-Release-Channel": release.channel });

const DOWNLOAD_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; sandbox",
  "Content-Disposition": "attachment",
};

/** `If-None-Match` names the strong ETag (or `*`). */
function notModified(request: Request, etag: string): boolean {
  const header = request.headers.get("If-None-Match");
  if (header === null) return false;
  return header.split(",").some((tag) => {
    const value = tag.trim();
    return value === "*" || value === etag || value === `W/${etag}`;
  });
}

/** Which release a request selects can depend on who asks (entitlements). */
export const VARY_VIEWER = { Vary: "Authorization, Cookie" };

function bytesResponse(request: Request, object: R2ObjectBody, etag: string, headers: Record<string, string>): Response {
  const all = { ...headers, ...VARY_VIEWER, ETag: etag };
  if (notModified(request, etag)) {
    // The body is not needed; release the R2 stream.
    void object.body.cancel().catch(() => undefined);
    return new Response(null, { status: 304, headers: all });
  }
  return new Response(object.body, { headers: { ...all, "Content-Length": String(object.size) } });
}

async function getManifestObject(bucket: R2Bucket, release: Pick<ReadableRelease, "manifestKey">, context?: string): Promise<R2ObjectBody> {
  const object = await bucket.get(release.manifestKey);
  if (object === null) throw storageError(`manifest ${release.manifestKey} is missing`, context);
  if (object.size > MAX_MANIFEST_BYTES) {
    void object.body.cancel().catch(() => undefined);
    throw storageError(`manifest ${release.manifestKey} exceeds ${MAX_MANIFEST_BYTES} bytes`, context);
  }
  return object;
}

/** The signed manifest bytes as stored; the state travels in headers because the bytes are immutable. */
async function manifestResponse(ctx: ReadContext, release: ReadableRelease): Promise<Response> {
  const object = await getManifestObject(ctx.bucket, release);
  return bytesResponse(ctx.request, object, `"${hexFromKey(release.manifestKey)}"`, {
    "Content-Type": "application/json",
    "Cache-Control": cacheControl(release, SHORT_TTL_SECONDS, false),
    "X-Content-Type-Options": "nosniff",
    ...stateHeaders(release),
    ...channelHeader(release),
  });
}

/** `GET /api/v1/packages/@handle/slug/releases` */
export async function readReleaseList(ctx: ReadContext, params: Params): Promise<Response> {
  const identity = parsePackageIdentity(params.scope, params.slug);
  const list = await listPackageReleases(ctx.db, identity, ctx.userId);
  return Response.json(
    {
      identity: list.identity,
      releases: list.releases.map((release) => ({
        version: release.version,
        channel: release.channel,
        state: release.state,
        releaseDigest: release.releaseDigest,
        artifactDigest: release.artifactDigest,
        artifactSize: release.artifactSize,
        createdAt: new Date(release.createdAt).toISOString(),
      })),
    },
    { headers: { "Cache-Control": cacheControl(list, SHORT_TTL_SECONDS, false), ...VARY_VIEWER } },
  );
}

/** `GET /api/v1/packages/@handle/slug/releases/:version` */
export async function readManifestByVersion(ctx: ReadContext, params: Params): Promise<Response> {
  const identity = parsePackageIdentity(params.scope, params.slug);
  const version = parseReleaseVersion(params.version);
  return manifestResponse(ctx, await resolveReleaseByVersion(ctx.db, identity, version, ctx.userId));
}

/**
 * Resolves the release of a digest endpoint. The optional `?version=` and
 * `?package=@handle/slug` query parameters are selectors (never credentials)
 * that pin one release of the tree; a malformed value is 400, an unknown or
 * mismatched one 404.
 */
export async function resolveDigestTarget(ctx: ReadContext, params: Params): Promise<ReadableRelease> {
  const digest = parseReleaseDigest(params.digest);
  const query = new URL(ctx.request.url).searchParams;
  const selector = query.get("version");
  const version = selector === null ? null : parseReleaseVersion(selector);
  const pkg = query.get("package");
  const slash = pkg?.indexOf("/") ?? -1;
  const identity = pkg === null ? null : parsePackageIdentity(pkg.slice(0, slash < 0 ? pkg.length : slash), slash < 0 ? undefined : pkg.slice(slash + 1));
  return resolveReleaseByDigest(ctx.db, digest, ctx.userId, version, identity);
}

/** `GET /api/v1/releases/:digest/manifest[?version=&package=]` */
export async function readManifestByDigest(ctx: ReadContext, params: Params): Promise<Response> {
  return manifestResponse(ctx, await resolveDigestTarget(ctx, params));
}

function invalidPath(): ReleaseHttpError {
  return releaseError(400, "invalid_path", "file path must be one relative agentkit.skill-tree/v1 path");
}

/**
 * The file path of `.../files/<path>`, read from the raw URL (not the router
 * splat) and percent-decoded exactly once. It must be a valid tree path, so
 * NUL, backslash, `..`, empty segments and absolute paths fail with 400; a
 * double-encoded name stays encoded and simply matches no manifest entry.
 */
export function releaseFilePath(request: Request): string {
  const { pathname } = new URL(request.url);
  const marker = "/files/";
  const at = pathname.indexOf(marker, "/api/v1/releases/".length);
  if (at < 0) throw invalidPath();
  let path: string;
  try {
    path = decodeURIComponent(pathname.slice(at + marker.length));
  } catch {
    throw invalidPath();
  }
  if (validatePath(path) !== null) throw invalidPath();
  return path;
}

/** The validated signed manifest of a stored release (also used by the personal kit base loader and the kit replay check). */
export async function readManifest(
  bucket: R2Bucket,
  release: Pick<ReadableRelease, "manifestKey" | "releaseDigest">,
  context?: string,
): Promise<SkillxReleaseManifest> {
  const object = await getManifestObject(bucket, release, context);
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(await object.arrayBuffer()));
  } catch {
    throw storageError(`manifest ${release.manifestKey} is not JSON`, context);
  }
  if (!validateReleaseManifest(parsed).valid) throw storageError(`manifest ${release.manifestKey} is invalid`, context);
  const manifest = parsed as SkillxReleaseManifest;
  if (manifest.releaseDigest !== release.releaseDigest) throw storageError(`manifest ${release.manifestKey} names another tree`, context);
  return manifest;
}

/** `GET /api/v1/releases/:digest/files/*[?version=&package=]` */
export async function readReleaseFile(ctx: ReadContext, params: Params): Promise<Response> {
  parseReleaseDigest(params.digest);
  const path = releaseFilePath(ctx.request);
  const release = await resolveDigestTarget(ctx, params);
  const manifest = await readManifest(ctx.bucket, release);
  const entry = manifest.files.find((f) => f.path === path);
  if (entry === undefined) throw notFound();
  if (entry.size > RELEASE_SERVER_TREE_LIMITS.maxFileSize) throw storageError(`file ${entry.sha256} exceeds the size cap`);
  const object = await ctx.bucket.get(blobKey(entry.sha256));
  if (object === null) throw storageError(`blob ${entry.sha256} is missing`);
  if (object.size !== entry.size) {
    void object.body.cancel().catch(() => undefined);
    throw storageError(`blob ${entry.sha256} has ${object.size} bytes, manifest says ${entry.size}`);
  }
  return bytesResponse(ctx.request, object, `"${entry.sha256}"`, {
    "Content-Type": "application/octet-stream",
    "Cache-Control": cacheControl(release, IMMUTABLE_TTL_SECONDS, true),
    "X-SkillX-File-Mode": entry.mode,
    ...DOWNLOAD_HEADERS,
    ...stateHeaders(release),
  });
}

/** `GET /api/v1/releases/:digest/artifact[?version=&package=]`: the uploaded tar, streamed from the R2 body. */
export async function readReleaseArtifact(ctx: ReadContext, params: Params): Promise<Response> {
  return artifactResponse(ctx, await resolveDigestTarget(ctx, params));
}

/**
 * Streams the artifact of an already authorized release. `cache` overrides
 * the immutable public/private cache policy (signed download URLs are
 * `no-store`: the URL itself is the short-lived capability).
 */
export async function artifactResponse(ctx: ReadContext, release: ReadableRelease, cache?: string): Promise<Response> {
  if (release.artifactKey === null || release.artifactDigest === null) throw storageError(`release ${release.id} has no artifact`);
  const object = await ctx.bucket.get(release.artifactKey);
  if (object === null) throw storageError(`artifact ${release.artifactKey} is missing`);
  if (object.size > MAX_RELEASE_UPLOAD_BYTES || (release.artifactSize !== null && object.size !== release.artifactSize)) {
    void object.body.cancel().catch(() => undefined);
    throw storageError(`artifact ${release.artifactKey} size does not match the release`);
  }
  return bytesResponse(ctx.request, object, `"${hexFromKey(release.artifactKey)}"`, {
    "Content-Type": "application/x-tar",
    "Cache-Control": cache ?? cacheControl(release, IMMUTABLE_TTL_SECONDS, true),
    "X-SkillX-Artifact-Digest": release.artifactDigest,
    ...DOWNLOAD_HEADERS,
    ...stateHeaders(release),
  });
}

function keyIds(raw: string | undefined): string[] {
  return [...new Set((raw ?? "").split(",").map((id) => id.trim()).filter((id) => RELEASE_KEY_ID_PATTERN.test(id)))].sort();
}

/**
 * `GET /api/v1/keys`: the active registry key ID and revoked IDs. Informational
 * only (clients trust embedded public keys); it never reads the private key.
 */
export async function readSigningKeys(env: Pick<ReleaseReadEnv, "SKILLX_REGISTRY_SIGNING_KEY_ID" | "SKILLX_REGISTRY_REVOKED_KEY_IDS">): Promise<Response> {
  const revoked = keyIds(env.SKILLX_REGISTRY_REVOKED_KEY_IDS);
  const active = keyIds(env.SKILLX_REGISTRY_SIGNING_KEY_ID).filter((id) => !revoked.includes(id));
  return Response.json(
    { algorithm: RELEASE_SIGNATURE_ALGORITHM, active, revoked },
    { headers: { "Cache-Control": `public, max-age=${SHORT_TTL_SECONDS}, no-transform` } },
  );
}
