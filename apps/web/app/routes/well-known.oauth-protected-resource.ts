import type { LoaderFunctionArgs } from "react-router";
import { agentKitIdentityEnabled, agentKitIssuer, skillxResource, SKILLX_RESOURCE_SCOPES } from "~/lib/agentkit/agentkit-config";

/**
 * RFC 9728 protected resource metadata for `<origin>/api`, served at
 * `/.well-known/oauth-protected-resource` and its path-suffixed form
 * `/.well-known/oauth-protected-resource/api`. 404 while
 * `SKILLX_AGENTKIT_IDENTITY` is off.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!agentKitIdentityEnabled(env)) return new Response("Not found", { status: 404 });
  return Response.json(
    {
      resource: skillxResource(env),
      resource_name: "SkillX",
      authorization_servers: [agentKitIssuer(env)],
      scopes_supported: [...SKILLX_RESOURCE_SCOPES],
      bearer_methods_supported: ["header"],
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
