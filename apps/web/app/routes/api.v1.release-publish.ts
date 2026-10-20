import type { ActionFunctionArgs } from "react-router";
import { publishRelease } from "~/lib/releases/release-idempotency";
import { notFoundResponse } from "~/lib/releases/release-http";
import { releaseSubrequestBudget, releasesApiEnabled } from "~/lib/releases/release-limits";
import { loadRegistrySigner } from "~/lib/releases/sign-manifest";
import { tokenSecret } from "~/lib/releases/release-tokens";

/**
 * `POST /api/v1/packages/@handle/slug/releases`: upload one immutable release
 * as an uncompressed tar, idempotent with an `Idempotency-Key` header
 * (see `release-idempotency.ts`). Answers 404 to everything while the Worker var
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
  return publishRelease(request, params, {
    db: env.DB,
    bucket: env.R2,
    loadSigner: () => loadRegistrySigner(env),
    subrequestBudget: releaseSubrequestBudget(env),
    tokenSecret: tokenSecret(env),
  });
}
