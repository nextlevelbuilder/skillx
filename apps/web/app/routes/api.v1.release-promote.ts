import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { servePromote } from "~/lib/releases/release-promote";
import { methodNotAllowed } from "~/lib/releases/release-state-http";

/**
 * `POST /api/v1/packages/@handle/slug/releases/:version/promote`: move a
 * published release between channels (see `release-promote.ts`). Answers 404
 * to everything while `SKILLX_RELEASES_API` is off, 405 to other methods.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  return releasesApiEnabled(context.cloudflare.env) ? methodNotAllowed() : notFoundResponse();
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return servePromote(request, context.cloudflare.env, params);
}
