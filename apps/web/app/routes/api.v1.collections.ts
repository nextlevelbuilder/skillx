import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { serveCollectionIndex, serveCollectionRequest } from "~/lib/collections/collection-router";

/**
 * Collections API, mounted on `/api/v1/collections`, `/api/v1/collections/:id`
 * and `/api/v1/collections/:id/*` (see docs/api-reference.md#collections).
 * Answers 404 to everything while `SKILLX_COLLECTIONS_API` is off.
 */
function serve(request: Request, env: Env, params: Record<string, string | undefined>) {
  return params.id === undefined ? serveCollectionIndex(request, env) : serveCollectionRequest(request, env, params);
}

export async function loader({ request, params, context }: LoaderFunctionArgs) {
  return serve(request, context.cloudflare.env, params);
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  return serve(request, context.cloudflare.env, params);
}
