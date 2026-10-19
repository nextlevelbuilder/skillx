import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serveOidcExchange } from "~/lib/releases/oidc-exchange";

/**
 * `POST /api/v1/oidc/github/token`: exchange a GitHub Actions OIDC token for a
 * short-lived publish token (see `oidc-exchange.ts`). 404 while
 * `SKILLX_RELEASES_API` is off; other methods get 405.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  return serveOidcExchange(request, context.cloudflare.env);
}

export async function action({ request, context }: ActionFunctionArgs) {
  return serveOidcExchange(request, context.cloudflare.env);
}
