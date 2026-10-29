import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { agentKitIdentityEnabled } from "~/lib/agentkit/agentkit-config";
import { unlink } from "~/lib/agentkit/link-flow";
import { agentKitLinkStatus } from "~/lib/agentkit/link-status";
import { crossOriginRefusal } from "~/lib/auth/same-origin";
import { getSession } from "~/lib/auth/session-helpers";

const NO_STORE = { "Cache-Control": "private, no-store" };

/** `GET /api/user/agentkit-link`: the signed-in user's AgentKit link. */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  const session = await getSession(request, env);
  if (!session?.user?.id) return Response.json({ error: "Authentication required" }, { status: 401 });
  return Response.json(await agentKitLinkStatus(env, session.user.id), { headers: NO_STORE });
}

/** `DELETE /api/user/agentkit-link`: unlink; SkillX's grant is revoked at agentkit.best. */
export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (request.method !== "DELETE") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const crossOrigin = crossOriginRefusal(request);
  if (crossOrigin) return crossOrigin;
  const session = await getSession(request, env);
  if (!session?.user?.id) return Response.json({ error: "Authentication required" }, { status: 401 });
  // Unlinking stays possible with the flag off, so turning the feature off never strands a link.
  const removed = await unlink(env, session.user.id);
  return Response.json({ enabled: agentKitIdentityEnabled(env), linked: false, removed }, { headers: NO_STORE });
}
