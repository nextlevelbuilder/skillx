/** What /settings shows about a user's AgentKit link; a revoked link is detected and removed here too. */
import { agentKitIdentityEnabled } from "./agentkit-config";
import { ensureLinkLive, LinkUnavailableError } from "./link-liveness";
import type { LinkEnv } from "./link-liveness";
import { linkOfUser } from "./link-store";

export type AgentKitLinkStatus =
  | { enabled: false }
  | { enabled: true; linked: false }
  | { enabled: true; linked: true; linkedAt: number; scopes: string[]; unverified: boolean };

export async function agentKitLinkStatus(env: LinkEnv, userId: string, fetcher: typeof fetch = fetch): Promise<AgentKitLinkStatus> {
  if (!agentKitIdentityEnabled(env)) return { enabled: false };
  const link = await linkOfUser(env.DB, userId);
  if (link === null) return { enabled: true, linked: false };
  let unverified = false;
  try {
    if ((await ensureLinkLive(env, link, fetcher)) === "revoked") return { enabled: true, linked: false };
  } catch (error) {
    if (!(error instanceof LinkUnavailableError)) throw error;
    unverified = true;
  }
  return { enabled: true, linked: true, linkedAt: link.linkedAt, scopes: link.scopes.split(" ").filter(Boolean), unverified };
}
