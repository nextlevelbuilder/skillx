/**
 * Signed, short-lived artifact download URLs for viewers who may read a
 * release (private packages need an entitlement), so a download can be
 * handed to a tool that holds no credentials (a package manager, `curl`).
 *
 * - `POST /api/v1/releases/:digest/artifact/url[?version=&package=]` runs the
 *   normal read path (viewer, rate limit, access rules of `release-access`)
 *   and answers `{url, expiresAt, ...}`. The URL is valid for 5 minutes.
 * - `GET /api/v1/downloads/:token` streams the artifact. The token is an
 *   HMAC (`SKILLX_TOKEN_SECRET`, purpose `artifact-download`) over the
 *   release digest, identity, version, viewer and expiry; it is never an API
 *   key and grants nothing else. Redemption re-applies the access rules for
 *   the same viewer, so a revoked entitlement, a quarantine or a suspended
 *   publisher stops a URL that was already issued. Answers are `no-store`.
 *
 * The public artifact path (`/api/v1/releases/:digest/artifact`) is
 * unchanged. Without the secret, minting is `503 download_url.unavailable`
 * and every token is invalid (`404`).
 */
import { RELEASE_DIGEST_PATTERN, RELEASE_VERSION_PATTERN, PACKAGE_NAME_PATTERN } from "@skillx/contracts";
import { notFound, resolveReleaseByDigest } from "./release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { checkReleaseRateLimit, rateLimitCaller } from "./release-rate-limit";
import { artifactResponse, resolveDigestTarget, serveReleaseRead } from "./release-read";
import type { ReadContext } from "./release-read";
import { signToken, tokenSecret, verifyToken } from "./release-tokens";

export const DOWNLOAD_URL_TTL_MS = 5 * 60_000;
const NO_STORE = { "Cache-Control": "no-store" };

type Params = Record<string, string | undefined>;

/** `POST /api/v1/releases/:digest/artifact/url` */
export function serveDownloadUrlMint(request: Request, env: Env, params: Params, now: () => Date = () => new Date()): Promise<Response> {
  return serveReleaseRead(request, env, async (ctx: ReadContext) => {
    if (request.method !== "POST") {
      return Response.json({ error: { code: "method_not_allowed", message: "use POST" } }, { status: 405, headers: { Allow: "POST", ...NO_STORE } });
    }
    const release = await resolveDigestTarget(ctx, params);
    const secret = tokenSecret(env);
    if (secret === null) throw releaseError(503, "download_url.unavailable", "signed download URLs are not configured");
    const exp = now().getTime() + DOWNLOAD_URL_TTL_MS;
    const token = await signToken(secret, "artifact-download", {
      v: 1,
      d: release.releaseDigest,
      i: release.identity,
      n: release.version,
      u: ctx.userId,
      exp,
    });
    const origin = new URL(request.url).origin;
    return Response.json(
      {
        url: `${origin}/api/v1/downloads/${token}`,
        expiresAt: new Date(exp).toISOString(),
        identity: release.identity,
        version: release.version,
        releaseDigest: release.releaseDigest,
        artifactDigest: release.artifactDigest,
        artifactSize: release.artifactSize,
      },
      { headers: NO_STORE },
    );
  });
}

function parsePayload(payload: Record<string, unknown> | null) {
  if (payload === null || payload.v !== 1) return null;
  const { d, i, n, u } = payload;
  if (typeof d !== "string" || !RELEASE_DIGEST_PATTERN.test(d)) return null;
  if (typeof i !== "string" || !PACKAGE_NAME_PATTERN.test(i)) return null;
  if (typeof n !== "string" || !RELEASE_VERSION_PATTERN.test(n)) return null;
  if (u !== null && typeof u !== "string") return null;
  return { digest: d, identity: i, version: n, userId: u as string | null };
}

/** `GET /api/v1/downloads/:token` */
export async function serveDownloadRedeem(request: Request, env: Env, params: Params, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  try {
    const decision = await checkReleaseRateLimit(env.RELEASE_READ_LIMITER, rateLimitCaller(request, null));
    if (!decision.allowed) {
      return errorResponse(releaseError(429, "rate_limited", `too many requests; retry after ${decision.retryAfterSeconds} seconds`), {
        "Retry-After": String(decision.retryAfterSeconds),
      });
    }
    const secret = tokenSecret(env);
    const target = secret === null ? null : parsePayload(await verifyToken(secret, "artifact-download", params.token ?? "", now()));
    // Forged, expired and unconfigured all answer like an unknown release.
    if (target === null) throw notFound();
    const release = await resolveReleaseByDigest(env.DB, target.digest, target.userId, target.version, target.identity);
    return await artifactResponse({ db: env.DB, bucket: env.R2, userId: target.userId, request }, release, "no-store");
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error);
    console.error("release download failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release download failed"));
  }
}
