import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isPackageAction, servePackageAction } from "~/lib/creator/owner-actions-http";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { methodNotAllowed } from "~/lib/releases/release-state-http";

/**
 * Owner management of a package, mounted on three paths (the last segment
 * names the action): `POST /api/v1/packages/@handle/slug/visibility`,
 * `.../delete` and `.../restore` (see `lib/creator/owner-actions-http.ts`).
 * Answers 404 to everything while `SKILLX_RELEASES_API` is off, 405 to other
 * methods.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  return releasesApiEnabled(context.cloudflare.env) ? methodNotAllowed() : notFoundResponse();
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const segment = new URL(request.url).pathname.replace(/\/+$/, "").split("/").pop() ?? "";
  if (!isPackageAction(segment)) return notFoundResponse();
  return servePackageAction(request, context.cloudflare.env, params, segment);
}
