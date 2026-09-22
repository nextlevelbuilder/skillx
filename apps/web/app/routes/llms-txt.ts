/**
 * `GET /llms.txt?limit=` — the catalog index for agents, in one request.
 *
 * Bounded and cached: the catalog holds six figures of skills, so the document
 * renders a deterministic top slice and reports how many listings it did not
 * include rather than pretending the catalog is that small. `?limit=` takes a
 * larger or smaller slice without a deployment.
 *
 * The cache key carries the origin because the rendered document contains absolute
 * URLs: sharing one entry across hosts would hand a caller links to a different
 * host. It also carries the resolved limit, since that changes the body.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { getCached } from "~/lib/cache/kv-cache";
import { fetchPublicCatalogIndex } from "~/lib/catalog/public-catalog-index";
import { renderLlmsTxt } from "~/lib/markdown/llms-txt";
import { INDEX_LIMITS, parseLlmsLimit } from "~/lib/markdown/llms-limit";

const CACHE_TTL_SECONDS = 300;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const url = new URL(request.url);
    const limit = parseLlmsLimit(url.searchParams.get("limit"), INDEX_LIMITS);

    const body = await getCached<string>(
      env.KV,
      `llms-txt:v3:${url.origin}:${limit}`,
      CACHE_TTL_SECONDS,
      async () => {
        const { entries, total } = await fetchPublicCatalogIndex(getDb(env.DB), { limit });
        return renderLlmsTxt(url.origin, entries, total);
      },
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("llms.txt error:", error);
    return new Response("Failed to render llms.txt\n", { status: 500 });
  }
}
