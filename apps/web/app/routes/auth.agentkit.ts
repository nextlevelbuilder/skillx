import { redirect } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { agentKitIdentityEnabled } from "~/lib/agentkit/agentkit-config";
import { completeLink, startLink } from "~/lib/agentkit/link-flow";
import { crossOriginRefusal } from "~/lib/auth/same-origin";
import { getSession } from "~/lib/auth/session-helpers";

/**
 * `POST /auth/agentkit/start` sends the signed-in user to agentkit.best to
 * authorize SkillX; `GET /auth/agentkit/callback` finishes the link. Both end
 * on /settings with `?agentkit=<outcome>`. 404 while `SKILLX_AGENTKIT_IDENTITY`
 * is off.
 */
const settings = (outcome: string) => redirect(`/settings?agentkit=${outcome}#agentkit`);

export async function action({ request, context, params }: ActionFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!agentKitIdentityEnabled(env) || params.step !== "start") return new Response("Not found", { status: 404 });
  const crossOrigin = crossOriginRefusal(request);
  if (crossOrigin) return crossOrigin;
  const session = await getSession(request, env);
  if (!session?.user?.id) return redirect("/settings");
  const url = await startLink(env, session.user.id);
  return url === null ? settings("already_linked") : redirect(url);
}

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as Env;
  if (!agentKitIdentityEnabled(env)) return new Response("Not found", { status: 404 });
  if (params.step !== "callback") return redirect("/settings");
  const session = await getSession(request, env);
  if (!session?.user?.id) return settings("expired");
  return settings(await completeLink(env, session.user.id, new URL(request.url).searchParams));
}
