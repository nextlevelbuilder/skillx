import type { LoaderFunctionArgs } from "react-router";
import { readSigningKeys, serveReleaseRead } from "~/lib/releases/release-read";
import type { ReleaseReadEnv } from "~/lib/releases/release-read";

/**
 * `GET /api/v1/keys`: active and revoked registry signing key IDs
 * (informational; clients trust the public keys they embed).
 */
export async function loader({ request, context }: LoaderFunctionArgs) {
  const env: ReleaseReadEnv = context.cloudflare.env;
  return serveReleaseRead(request, env, () => readSigningKeys(env));
}
