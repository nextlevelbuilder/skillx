import type { LoaderFunctionArgs } from "react-router";
import { serveLibrary } from "~/lib/library/library-http";

/**
 * `GET /api/v1/library`: the caller's private library, owned and entitled
 * skills plus personal kits (see docs/api-reference.md). 404 while
 * `SKILLX_RELEASES_API` is off; every answer is `private, no-store`.
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  return serveLibrary(request, context.cloudflare.env);
}
