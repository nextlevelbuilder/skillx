/**
 * `GET /llms.txt` — the catalog index for agents, in one request.
 *
 * Bounded and cached: the catalog holds thousands of listings, so the document
 * renders a deterministic top slice and reports how many listings it did not
 * include rather than pretending the catalog is that small.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { getCached } from "~/lib/cache/kv-cache";
import { fetchPublicCatalogIndex } from "~/lib/catalog/public-catalog-index";
import { renderLlmsTxt } from "~/lib/markdown/llms-txt";

/** How many listings the index carries. */
const INDEX_LIMIT = 1000;
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = "llms-txt:v2";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const siteUrl = new URL(request.url).origin;

    const body = await getCached<string>(env.KV, CACHE_KEY, CACHE_TTL_SECONDS, async () => {
      const { entries, total } = await fetchPublicCatalogIndex(getDb(env.DB), {
        limit: INDEX_LIMIT,
      });
      return renderLlmsTxt(siteUrl, entries, total);
    });

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
