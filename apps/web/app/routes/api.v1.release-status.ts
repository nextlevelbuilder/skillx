import type { LoaderFunctionArgs } from "react-router";
import { serveReleaseRead } from "~/lib/releases/release-read";
import { readReleaseStatus } from "~/lib/releases/release-status-issue";
import { loadRegistrySigner } from "~/lib/releases/sign-manifest";

/**
 * The signed `skillx.release-status/v1` document of one release
 * (`GET /api/v1/packages/@handle/slug/releases/:version/status`), served in
 * every state, including yanked and quarantined, so offline clients can
 * verify the state with the registry key.
 */
export async function loader({ request, params, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  return serveReleaseRead(request, env, (ctx) =>
    readReleaseStatus(ctx, params, {
      loadSigner: () => loadRegistrySigner(env),
      activeKeyId: env.SKILLX_REGISTRY_SIGNING_KEY_ID,
    }),
  );
}
