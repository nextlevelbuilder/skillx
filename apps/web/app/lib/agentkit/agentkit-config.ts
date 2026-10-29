/**
 * AgentKit identity (agentkit.best OAuth AS) as seen from SkillX: SkillX is
 * a public OAuth client for "Link with AgentKit" and a resource server for
 * access tokens minted for `<origin>/api`. Everything is off unless
 * `SKILLX_AGENTKIT_IDENTITY` is "1" or "true"; off, SkillX behaves exactly as
 * before (GitHub login, SkillX API keys).
 */

export interface AgentKitEnv {
  ENVIRONMENT?: string;
  SKILLX_AGENTKIT_IDENTITY?: string;
  /** Issuer override for development and tests; defaults to https://agentkit.best. */
  AGENTKIT_ISSUER?: string;
}

export const DEFAULT_AGENTKIT_ISSUER = "https://agentkit.best";
export const SKILLX_KITS_READ = "skillx-kits:read";
export const SKILLX_KITS_WRITE = "skillx-kits:write";
export const SKILLX_RESOURCE_SCOPES = [SKILLX_KITS_READ, SKILLX_KITS_WRITE] as const;
export function agentKitIdentityEnabled(env: AgentKitEnv): boolean {
  const value = (env.SKILLX_AGENTKIT_IDENTITY ?? "").trim().toLowerCase();
  return value === "1" || value === "true";
}

export function siteOrigin(env: AgentKitEnv): string {
  return env.ENVIRONMENT === "development" ? "http://localhost:5173" : "https://skillx.sh";
}

export function agentKitIssuer(env: AgentKitEnv): string {
  return (env.AGENTKIT_ISSUER ?? DEFAULT_AGENTKIT_ISSUER).replace(/\/+$/, "");
}

/** The RFC 8707 resource (and token `aud`) SkillX accepts. */
export const skillxResource = (env: AgentKitEnv) => `${siteOrigin(env)}/api`;
/** The Client ID Metadata Document URL, which is SkillX's client_id at the AS. */
export const skillxClientId = (env: AgentKitEnv) => `${siteOrigin(env)}/oauth/client.json`;
export const skillxRedirectUri = (env: AgentKitEnv) => `${siteOrigin(env)}/auth/agentkit/callback`;
/** Where a caller whose AgentKit account has no SkillX link is sent. */
export const linkSettingsUrl = (env: AgentKitEnv) => `${siteOrigin(env)}/settings#agentkit`;

/** RFC 9728 metadata of the SkillX resource. */
export const resourceMetadataUrl = (env: AgentKitEnv) => `${siteOrigin(env)}/.well-known/oauth-protected-resource`;
/**
 * `WWW-Authenticate` for a 401: points RFC 9728 clients at the metadata only
 * while it is served, so the flag off keeps the plain challenge.
 */
export const bearerChallenge = (env?: AgentKitEnv) =>
  env !== undefined && agentKitIdentityEnabled(env) ? `Bearer resource_metadata="${resourceMetadataUrl(env)}"` : "Bearer";

export const asEndpoint =(env: AgentKitEnv, path: "authorize" | "token" | "revoke") => `${agentKitIssuer(env)}/oauth/${path}`;
