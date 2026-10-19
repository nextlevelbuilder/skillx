import type { LoaderFunctionArgs } from "react-router";
import { serveQuarantineQueue } from "~/lib/releases/release-review";

/**
 * `GET /api/v1/admin/quarantine`: the admin review queue of quarantined
 * releases (see `release-review.ts`). 404 while `SKILLX_RELEASES_API` is off.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  return serveQuarantineQueue(request, context.cloudflare.env);
}
