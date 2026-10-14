import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { servePublisherProvision } from "~/lib/releases/publisher-provision";
import { methodNotAllowed } from "~/lib/releases/release-state-http";

/**
 * `POST /api/v1/publishers`: admin-only publisher provisioning (see
 * `publisher-provision.ts`). Answers 404 to everything while
 * `SKILLX_RELEASES_API` is off, 405 to other methods.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  return releasesApiEnabled(context.cloudflare.env) ? methodNotAllowed() : notFoundResponse();
}

export async function action({ request, context }: ActionFunctionArgs) {
  return servePublisherProvision(request, context.cloudflare.env);
}
