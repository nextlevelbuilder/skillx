import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { methodNotAllowed, serveStateChange } from "~/lib/releases/release-state-http";

/**
 * Compare-and-set state transitions, mounted on two paths (the params tell
 * them apart): `POST /api/v1/packages/@handle/slug/releases/:version/state`
 * (owner or admin) and `POST /api/v1/publishers/@handle/state` (admin).
 * Answers 404 to everything while `SKILLX_RELEASES_API` is off.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  return releasesApiEnabled(context.cloudflare.env) ? methodNotAllowed() : notFoundResponse();
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serveStateChange(request, context.cloudflare.env, params);
}
