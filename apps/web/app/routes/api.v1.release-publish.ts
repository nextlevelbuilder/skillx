import type { ActionFunctionArgs } from "react-router";
import { ingestRelease } from "~/lib/releases/ingest-release";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { loadRegistrySigner } from "~/lib/releases/sign-manifest";

/**
 * `POST /api/v1/packages/@handle/slug/releases`: upload one immutable release
 * as an uncompressed tar. Answers 404 to everything while the Worker var
 * `SKILLX_RELEASES_API` is off (the default).
 */
export async function loader({ context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!releasesApiEnabled(env)) return notFoundResponse();
  return Response.json({ error: { code: "method_not_allowed", message: "use POST" } }, { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request, params, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") {
    return Response.json({ error: { code: "method_not_allowed", message: "use POST" } }, { status: 405, headers: { Allow: "POST" } });
  }
  return ingestRelease(request, params, {
    db: env.DB,
    bucket: env.R2,
    loadSigner: () => loadRegistrySigner(env),
  });
}
