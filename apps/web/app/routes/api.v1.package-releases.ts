import type { LoaderFunctionArgs } from "react-router";
import { readReleaseList, serveReleaseRead } from "~/lib/releases/release-read";

/**
 * `GET /api/v1/packages/@handle/slug/releases`: published and yanked releases
 * (quarantined hidden). The same path's `POST` publishes a release; the action
 * stays in its own module. 404 while `SKILLX_RELEASES_API` is off.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveReleaseRead(request, context.cloudflare.env, (ctx) => readReleaseList(ctx, params));
}

export { action } from "./api.v1.release-publish";
