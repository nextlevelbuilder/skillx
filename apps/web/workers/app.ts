import { createRequestHandler } from "react-router";

// Extend Env type with auth secrets
declare global {
  interface Env {
    GITHUB_CLIENT_ID: string;
    GITHUB_CLIENT_SECRET: string;
    BETTER_AUTH_SECRET: string;
    ADMIN_SECRET: string;
    TURNSTILE_SECRET: string;
    // SKILLX_RELEASES_API (release API flag, "1"/"true" = on) is typed from wrangler.jsonc vars.
    /** Registry Ed25519 signing key, base64 PKCS #8 DER. Secret; never logged or returned. */
    SKILLX_REGISTRY_SIGNING_KEY?: string;
    /** Published ID of the registry signing key. */
    SKILLX_REGISTRY_SIGNING_KEY_ID?: string;
    /**
     * Comma-separated revoked registry key IDs listed by GET /api/v1/keys. Set in the
     * dashboard, not in wrangler.jsonc vars (a deploy would overwrite dashboard values).
     */
    SKILLX_REGISTRY_REVOKED_KEY_IDS?: string;
  }
}

declare module "react-router" {
  export interface AppLoadContext {
    cloudflare: {
      env: Env;
      ctx: ExecutionContext;
    };
  }
}

const requestHandler = createRequestHandler(
  () => import("virtual:react-router/server-build"),
  import.meta.env.MODE
);

export default {
  async fetch(request, env, ctx) {
    return requestHandler(request, {
      cloudflare: { env, ctx },
    });
  },
} satisfies ExportedHandler<Env>;
