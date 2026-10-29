import type { LoaderFunctionArgs } from "react-router";
import { agentKitIdentityEnabled, siteOrigin, skillxClientId, skillxRedirectUri, SKILLX_RESOURCE_SCOPES } from "~/lib/agentkit/agentkit-config";

/**
 * `GET /oauth/client.json`: SkillX's OAuth Client ID Metadata Document for
 * agentkit.best. Its URL is the client_id; a public client, so no secret.
 * 404 while `SKILLX_AGENTKIT_IDENTITY` is off.
 */
export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!agentKitIdentityEnabled(env)) return new Response("Not found", { status: 404 });
  return Response.json(
    {
      client_id: skillxClientId(env),
      client_name: "SkillX",
      client_uri: siteOrigin(env),
      logo_uri: `${siteOrigin(env)}/favicon.ico`,
      redirect_uris: [skillxRedirectUri(env)],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      scope: SKILLX_RESOURCE_SCOPES.join(" "),
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
}
