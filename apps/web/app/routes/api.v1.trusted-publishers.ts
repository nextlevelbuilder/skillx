import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serveTrustedPublishers } from "~/lib/releases/trusted-publishers";

/**
 * `GET|POST /api/v1/publishers/:handle/trusted-publishers` and
 * `POST .../trusted-publishers/:id/revoke`: admin configuration of GitHub
 * Actions trusted publishing (see `trusted-publishers.ts`). 404 while
 * `SKILLX_RELEASES_API` is off.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveTrustedPublishers(request, context.cloudflare.env, params);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serveTrustedPublishers(request, context.cloudflare.env, params);
}
