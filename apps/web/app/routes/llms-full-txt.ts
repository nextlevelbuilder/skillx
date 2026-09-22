/**
 * `GET /llms-full.txt` — every listed skill with its SKILL.md body.
 *
 * This is the most payload-heavy surface in the product. It obeys the protected
 * boundary row by row through the shared catalog index, so a listing whose
 * payload was not granted is rendered with an explicit note instead of an empty
 * body. It is bounded and cached, and it states how much it left out.
 */

import type { LoaderFunctionArgs } from "react-router";
import { getDb } from "~/lib/db";
import { getCached } from "~/lib/cache/kv-cache";
import { fetchPublicCatalogIndex } from "~/lib/catalog/public-catalog-index";
import { renderLlmsFullTxt } from "~/lib/markdown/llms-txt";

/** How many skill bodies the document carries before truncating. */
const FULL_LIMIT = 200;
const CACHE_TTL_SECONDS = 300;
const CACHE_KEY = "llms-full-txt:v2";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;

  try {
    const siteUrl = new URL(request.url).origin;

    const body = await getCached<string>(env.KV, CACHE_KEY, CACHE_TTL_SECONDS, async () => {
      const { entries, total } = await fetchPublicCatalogIndex(getDb(env.DB), {
        limit: FULL_LIMIT,
        includeContent: true,
      });

      return renderLlmsFullTxt(siteUrl, entries, {
        total,
        truncated: entries.length < total,
      });
    });

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("llms-full.txt error:", error);
    return new Response("Failed to render llms-full.txt\n", { status: 500 });
  }
}
