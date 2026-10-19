/**
 * Verification of a GitHub Actions OIDC token (a JWT signed RS256 by
 * `https://token.actions.githubusercontent.com`, keys from its JWKS).
 *
 * Fails closed with `401 oidc.invalid_token` on anything unexpected: another
 * algorithm (only RS256; `none` and HMAC are refused), an unknown key id, a
 * bad signature, another issuer or audience, an expired, not-yet-valid or
 * over-long-lived token, or a missing claim the trusted publisher binding
 * needs. The JWKS is cached per isolate for 10 minutes; an unknown `kid`
 * refetches it at most once a minute (key rotation).
 */
import { releaseError } from "./release-http";

export const GITHUB_OIDC_ISSUER = "https://token.actions.githubusercontent.com";
export const GITHUB_OIDC_JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks`;
export const DEFAULT_OIDC_AUDIENCE = "skillx";
const JWKS_TTL_MS = 10 * 60_000;
const JWKS_MIN_REFRESH_MS = 60_000;
const CLOCK_SKEW_MS = 60_000;
/** GitHub tokens live 5 to 10 minutes; anything longer is not one. */
const MAX_LIFETIME_MS = 60 * 60_000;
const MAX_TOKEN_LENGTH = 16 * 1024;

export interface GithubOidcClaims {
  jti: string;
  sub: string;
  repository: string;
  repository_id: string;
  repository_owner_id: string;
  workflow_ref: string;
  ref: string;
  event_name: string;
  environment: string | null;
  run_id: string | null;
}

export type JwksFetcher = () => Promise<unknown>;

const invalid = (message: string) => releaseError(401, "oidc.invalid_token", message);

let cache: { keys: Map<string, CryptoKey>; fetchedAt: number } | null = null;

/** Test hook: forget the cached JWKS. */
export function resetJwksCache(): void {
  cache = null;
}

export const fetchGithubJwks: JwksFetcher = async () => {
  const res = await fetch(GITHUB_OIDC_JWKS_URL, { headers: { Accept: "application/json" } });
  if (!res.ok) throw releaseError(503, "oidc.jwks_unavailable", `cannot fetch the GitHub OIDC keys (${res.status})`);
  return res.json();
};

async function importJwks(document: unknown): Promise<Map<string, CryptoKey>> {
  const keys = new Map<string, CryptoKey>();
  const list = (document as { keys?: unknown })?.keys;
  if (!Array.isArray(list)) return keys;
  for (const jwk of list as Array<Record<string, unknown>>) {
    if (jwk.kty !== "RSA" || typeof jwk.kid !== "string" || typeof jwk.n !== "string" || typeof jwk.e !== "string") continue;
    try {
      const key = await crypto.subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e, alg: "RS256", ext: true }, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      keys.set(jwk.kid, key);
    } catch {
      // A malformed key is skipped; a token naming it fails as unknown.
    }
  }
  return keys;
}

async function keyFor(kid: string, fetchJwks: JwksFetcher, now: number): Promise<CryptoKey | undefined> {
  const stale = cache === null || now - cache.fetchedAt > JWKS_TTL_MS;
  const unknownKid = cache !== null && !cache.keys.has(kid) && now - cache.fetchedAt > JWKS_MIN_REFRESH_MS;
  if (stale || unknownKid) cache = { keys: await importJwks(await fetchJwks()), fetchedAt: now };
  return cache!.keys.get(kid);
}

function decodeSegment(segment: string): Record<string, unknown> {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))));
    if (typeof value === "object" && value !== null && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // Reported below.
  }
  throw invalid("the token is not a JWT");
}

function signatureBytes(segment: string): Uint8Array {
  try {
    const padded = segment.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (segment.length % 4)) % 4);
    return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
  } catch {
    throw invalid("the token signature is malformed");
  }
}

const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : null);

export async function verifyGithubOidcToken(
  token: string,
  options: { audience: string; now: Date; fetchJwks?: JwksFetcher },
): Promise<GithubOidcClaims> {
  if (token.length > MAX_TOKEN_LENGTH) throw invalid("the token is too long");
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((p) => !/^[A-Za-z0-9_-]+$/.test(p))) throw invalid("the token is not a JWT");
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];
  const header = decodeSegment(headerPart);
  if (header.alg !== "RS256") throw invalid("the token must be signed with RS256");
  if (typeof header.kid !== "string") throw invalid("the token names no signing key");

  const now = options.now.getTime();
  const key = await keyFor(header.kid, options.fetchJwks ?? fetchGithubJwks, now);
  if (key === undefined) throw invalid("the token is signed by an unknown key");
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, signatureBytes(signaturePart) as Uint8Array<ArrayBuffer>, signed);
  if (!ok) throw invalid("the token signature is not valid");

  const claims = decodeSegment(payloadPart);
  if (claims.iss !== GITHUB_OIDC_ISSUER) throw invalid("the token was not issued by GitHub Actions");
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(options.audience)) throw invalid(`the token audience must be ${options.audience}`);
  const exp = typeof claims.exp === "number" ? claims.exp * 1000 : NaN;
  const iat = typeof claims.iat === "number" ? claims.iat * 1000 : NaN;
  const nbf = typeof claims.nbf === "number" ? claims.nbf * 1000 : iat;
  if (!(exp > now)) throw invalid("the token has expired");
  if (!(iat <= now + CLOCK_SKEW_MS) || !(nbf <= now + CLOCK_SKEW_MS)) throw invalid("the token is not valid yet");
  if (exp - iat > MAX_LIFETIME_MS) throw invalid("the token lifetime is too long");

  const result = {
    jti: str(claims.jti),
    sub: str(claims.sub),
    repository: str(claims.repository),
    repository_id: str(claims.repository_id),
    repository_owner_id: str(claims.repository_owner_id),
    workflow_ref: str(claims.workflow_ref),
    ref: str(claims.ref),
    event_name: str(claims.event_name),
  };
  const missing = Object.entries(result).filter(([, value]) => value === null).map(([name]) => name);
  if (missing.length > 0) throw invalid(`the token lacks the claims: ${missing.join(", ")}`);
  return { ...(result as Record<keyof typeof result, string>), environment: str(claims.environment), run_id: str(claims.run_id) };
}
