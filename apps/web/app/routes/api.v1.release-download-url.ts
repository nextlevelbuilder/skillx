import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serveDownloadUrlMint } from "~/lib/releases/release-download-url";

/**
 * `POST /api/v1/releases/:digest/artifact/url`: mint a signed, short-lived
 * artifact download URL (see `release-download-url.ts`). 404 while
 * `SKILLX_RELEASES_API` is off; other methods get 405.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveDownloadUrlMint(request, context.cloudflare.env, params);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serveDownloadUrlMint(request, context.cloudflare.env, params);
}
