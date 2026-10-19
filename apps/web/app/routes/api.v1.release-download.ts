import type { LoaderFunctionArgs } from "react-router";
import { serveDownloadRedeem } from "~/lib/releases/release-download-url";

/**
 * `GET /api/v1/downloads/:token`: stream the artifact a signed download URL
 * names (see `release-download-url.ts`). 404 while `SKILLX_RELEASES_API` is off.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveDownloadRedeem(request, context.cloudflare.env, params);
}
