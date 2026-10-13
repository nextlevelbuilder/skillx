import type { LoaderFunctionArgs } from "react-router";
import { readManifestByDigest, readManifestByVersion, serveReleaseRead } from "~/lib/releases/release-read";

/**
 * The signed `skillx.release/v1` manifest bytes, by version
 * (`GET /api/v1/packages/@handle/slug/releases/:version`) or by tree digest
 * (`GET /api/v1/releases/:digest/manifest`, for locked clients). The route
 * config mounts this module on both paths; the params tell them apart.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveReleaseRead(request, context.cloudflare.env, (ctx) =>
    params.digest !== undefined ? readManifestByDigest(ctx, params) : readManifestByVersion(ctx, params),
  );
}
