import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serveKitRequest } from "~/lib/personal-kits/kit-router";

/**
 * Personal kit API, mounted on `/api/v1/kits/:scope/:name` and
 * `/api/v1/kits/:scope/:name/*` (see docs/personal-kits-api.md). Answers 404
 * to everything while `SKILLX_PERSONAL_KITS_API` is off.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serveKitRequest(request, context.cloudflare.env, params);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serveKitRequest(request, context.cloudflare.env, params);
}
