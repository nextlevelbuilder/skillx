/**
 * `GET /llms-full.txt?limit=` — listed skills with their SKILL.md bodies.
 *
 * This is the most payload-heavy surface in the product. It obeys the protected
 * boundary row by row through the shared catalog index, so a listing whose payload
 * was not granted is rendered with an explicit note instead of an empty body. It is
 * bounded and cached, and it says when it left listings out.
 *
 * `?limit=` bounds a document that would otherwise be megabytes; the cache key
 * carries the origin (the body holds absolute URLs) and the normalized limit.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { getCached } from "~/lib/cache/kv-cache";
import { fetchPublicCatalogIndex } from "~/lib/catalog/public-catalog-index";
import { renderLlmsFullTxt } from "~/lib/markdown/llms-txt";
import { FULL_LIMITS, llmsCacheKey, parseLlmsLimit } from "~/lib/markdown/llms-limit";

const CACHE_TTL_SECONDS = 300;

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const url = new URL(request.url);
    const limit = parseLlmsLimit(url.searchParams.get("limit"), FULL_LIMITS);

    const body = await getCached<string>(
      env.KV,
      llmsCacheKey("llms-full-txt", url.origin, limit),
      CACHE_TTL_SECONDS,
      async () => {
        const { entries, truncated } = await fetchPublicCatalogIndex(getDb(env.DB), {
          limit,
          includeContent: true,
        });
        return renderLlmsFullTxt(url.origin, entries, { truncated });
      },
    );

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    console.error("llms-full.txt error:", error);
    return new Response("Failed to render llms-full.txt\n", { status: 500, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Content-Type-Options": "nosniff" } });
  }
}
