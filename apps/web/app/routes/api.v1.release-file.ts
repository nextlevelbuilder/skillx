import type { LoaderFunctionArgs } from "react-router";
import { readReleaseFile, serveReleaseRead } from "~/lib/releases/release-read";

/**
 * `GET /api/v1/releases/:digest/files/<path>`: one file's raw bytes, only for a
 * path listed in the release manifest. `ETag` is the file SHA-256.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveReleaseRead(request, context.cloudflare.env, (ctx) => readReleaseFile(ctx, params));
}
