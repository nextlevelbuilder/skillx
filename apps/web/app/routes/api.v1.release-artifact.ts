import type { LoaderFunctionArgs } from "react-router";
import { readReleaseArtifact, serveReleaseRead } from "~/lib/releases/release-read";

/**
 * `GET /api/v1/releases/:digest/artifact`: the uploaded tar, streamed
 * same-origin from the R2 object body (no redirect).
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveReleaseRead(request, context.cloudflare.env, (ctx) => readReleaseArtifact(ctx, params));
}
