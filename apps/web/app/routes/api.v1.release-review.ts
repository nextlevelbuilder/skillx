import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { serveReview } from "~/lib/releases/release-review";
import { methodNotAllowed } from "~/lib/releases/release-state-http";

/**
 * `POST /api/v1/packages/@handle/slug/releases/:version/review`: admin
 * approve/reject of a quarantined release (see `release-review.ts`). Answers
 * 404 to everything while `SKILLX_RELEASES_API` is off, 405 to other methods.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  return releasesApiEnabled(context.cloudflare.env) ? methodNotAllowed() : notFoundResponse();
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serveReview(request, context.cloudflare.env, params);
}
