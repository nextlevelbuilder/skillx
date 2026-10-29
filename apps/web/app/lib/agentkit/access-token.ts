/**
 * Local verification of agentkit.best access tokens (RFC 9068 `at+jwt`,
 * ES256) against the AS JWKS. No introspection: the AS issues 60-second
 * tokens for SkillX, so a revoked grant stops working within a minute.
 */
import { agentKitIssuer, skillxResource } from "./agentkit-config";
import type { AgentKitEnv } from "./agentkit-config";

export interface AccessTokenClaims {
  sub: string;
  scopes: string[];
  clientId: string | null;
  grantId: string | null;
  exp: number;
}

export class InvalidAccessTokenError extends Error {}

const JWT_SHAPE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
/** Clock skew tolerated on `exp` and `iat`, in seconds. */
const SKEW_SECONDS = 5;
const JWKS_TTL_MS = 10 * 60_000;
/** An unknown `kid` refetches the JWKS at most this often (key rotation without a fetch storm). */
const JWKS_REFETCH_MS = 30_000;
const JWKS_TIMEOUT_MS = 5_000;

export const looksLikeJwt = (token: string) => JWT_SHAPE.test(token);

export function base64UrlEncode(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

function decodeJson(part: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(base64UrlDecode(part)));
    if (value !== null && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  } catch {
    // fall through
  }
  throw new InvalidAccessTokenError("malformed token");
}

interface JwksCache {
  issuer: string;
  keys: Map<string, CryptoKey>;
  fetchedAt: number;
}
let cache: JwksCache | null = null;

/** Test hook: forget the cached JWKS. */
export function resetJwksCache(): void {
  cache = null;
}

async function loadJwks(issuer: string, fetcher: typeof fetch): Promise<JwksCache> {
  const res = await fetcher(`${issuer}/.well-known/jwks.json`, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) });
  if (!res.ok) throw new Error(`JWKS fetch failed with HTTP ${res.status}`);
  const body = (await res.json()) as { keys?: unknown };
  const keys = new Map<string, CryptoKey>();
  for (const jwk of Array.isArray(body.keys) ? body.keys : []) {
    const k = jwk as JsonWebKey & { kid?: unknown; use?: unknown };
    if (k.kty !== "EC" || k.crv !== "P-256" || typeof k.kid !== "string") continue;
    if ((k.alg !== undefined && k.alg !== "ES256") || (k.use !== undefined && k.use !== "sig")) continue;
    const { kty, crv, x, y } = k;
    keys.set(k.kid, await crypto.subtle.importKey("jwk", { kty, crv, x, y }, { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]));
  }
  return { issuer, keys, fetchedAt: Date.now() };
}

async function keyFor(issuer: string, kid: string, fetcher: typeof fetch): Promise<CryptoKey | undefined> {
  const now = Date.now();
  if (cache === null || cache.issuer !== issuer || now - cache.fetchedAt > JWKS_TTL_MS) {
    cache = await loadJwks(issuer, fetcher);
  } else if (!cache.keys.has(kid) && now - cache.fetchedAt > JWKS_REFETCH_MS) {
    cache = await loadJwks(issuer, fetcher);
  }
  return cache.keys.get(kid);
}

/**
 * Verifies signature, `typ`, `iss`, exact `aud` (the SkillX resource), `exp`
 * and `iat`. Throws `InvalidAccessTokenError` for a token SkillX must refuse;
 * any other error means the JWKS could not be read.
 */
export async function verifyAccessToken(env: AgentKitEnv, token: string, fetcher: typeof fetch = fetch, nowSeconds = Math.floor(Date.now() / 1000)): Promise<AccessTokenClaims> {
  if (!looksLikeJwt(token)) throw new InvalidAccessTokenError("not a JWT");
  const [headerPart, payloadPart, signaturePart] = token.split(".");
  const header = decodeJson(headerPart);
  const typ = typeof header.typ === "string" ? header.typ.toLowerCase() : "";
  if (header.alg !== "ES256" || (typ !== "at+jwt" && typ !== "application/at+jwt") || typeof header.kid !== "string") {
    throw new InvalidAccessTokenError("unsupported token type");
  }
  const issuer = agentKitIssuer(env);
  const key = await keyFor(issuer, header.kid, fetcher);
  if (key === undefined) throw new InvalidAccessTokenError("unknown signing key");
  const signed = new TextEncoder().encode(`${headerPart}.${payloadPart}`);
  const valid = await crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, base64UrlDecode(signaturePart), signed);
  if (!valid) throw new InvalidAccessTokenError("bad signature");

  const claims = decodeJson(payloadPart);
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== issuer || !audiences.includes(skillxResource(env))) throw new InvalidAccessTokenError("wrong issuer or audience");
  if (typeof claims.exp !== "number" || claims.exp + SKEW_SECONDS <= nowSeconds) throw new InvalidAccessTokenError("expired");
  if (typeof claims.iat === "number" && claims.iat - SKEW_SECONDS > nowSeconds) throw new InvalidAccessTokenError("issued in the future");
  if (typeof claims.sub !== "string" || claims.sub === "") throw new InvalidAccessTokenError("no subject");
  const scope = typeof claims.scope === "string" ? claims.scope : "";
  return {
    sub: claims.sub,
    scopes: scope.split(" ").filter(Boolean),
    clientId: typeof claims.client_id === "string" ? claims.client_id : null,
    grantId: typeof claims.grant_id === "string" ? claims.grant_id : null,
    exp: claims.exp,
  };
}
