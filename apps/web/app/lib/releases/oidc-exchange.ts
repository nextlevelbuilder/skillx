/**
 * `POST /api/v1/oidc/github/token`: GitHub Actions trusted publishing.
 *
 * Body `{"token": "<GitHub OIDC JWT>", "publisher": "@handle"}`. The JWT is
 * verified (`github-oidc.ts`, audience `SKILLX_OIDC_AUDIENCE` or `skillx`)
 * and must match an active trusted publisher of that publisher: the same
 * `repository_id` and `repository`, a `workflow_ref` of
 * `<repository>/<workflowPath>@...`, and the configured `ref` and
 * `environment` when set. Only `push`, `workflow_dispatch` and `release`
 * events may publish (`PUBLISH_EVENTS`), so a fork's pull request or a
 * comment-triggered workflow never can. Each JWT is exchanged once (its `jti` is the
 * primary key of `oidc_token_exchanges`).
 *
 * Answers `{token, expiresAt, publisher, scope}`: an `sxo_` token valid for
 * 15 minutes that only `POST .../releases` of `@handle` accepts (and the
 * promote route). It is re-checked against D1 on every use, so revoking the
 * trusted publisher or suspending the publisher stops it at once.
 *
 * Rate limited on `RELEASE_WRITE_LIMITER` per client IP, failing closed.
 * Without `SKILLX_TOKEN_SECRET` the route is `503 oidc.unavailable`.
 * Mismatches are one `403 oidc.not_trusted` that names no configuration.
 */
import { DEFAULT_OIDC_AUDIENCE, verifyGithubOidcToken } from "./github-oidc";
import type { GithubOidcClaims, JwksFetcher } from "./github-oidc";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { rateLimitCaller } from "./release-rate-limit";
import { BARE_PUBLISHER_HANDLE, NO_STORE, enforceWriteLimit, failureHeaders, invalidRequest, methodNotAllowed, readJsonObject } from "./release-state-http";
import { tokenSecret } from "./release-tokens";
import { mintOidcPublishToken } from "./trusted-publish-token";

const BODY_FIELDS: ReadonlySet<string> = new Set(["token", "publisher"]);
const MAX_BODY_BYTES = 20 * 1024;
/** How long an exchange row is kept; far beyond any JWT or publish token lifetime. */
export const EXCHANGE_RETENTION_MS = 7 * 24 * 60 * 60_000;
/**
 * Events whose workflow runs the trusted ref itself. Everything else
 * (`pull_request*`, `workflow_run`, `issue_comment`, `schedule`, ...) can run
 * a workflow on behalf of someone without write access, or on a stale ref.
 */
export const PUBLISH_EVENTS: ReadonlySet<string> = new Set(["push", "workflow_dispatch", "release"]);

export interface OidcExchangeDeps {
  now?: () => Date;
  fetchJwks?: JwksFetcher;
}

type TrustedRow = { id: string; repository: string; repository_id: string; workflow_path: string; ref: string | null; environment: string | null };

const notTrusted = () => releaseError(403, "oidc.not_trusted", "no trusted publisher of this publisher matches the workflow");

/** True when the claims satisfy one trusted publisher entry. */
export function matchesTrustedPublisher(row: TrustedRow, claims: GithubOidcClaims): boolean {
  if (claims.repository_id !== row.repository_id) return false;
  if (claims.repository.toLowerCase() !== row.repository) return false;
  const repoPart = claims.workflow_ref.slice(0, row.repository.length);
  const rest = claims.workflow_ref.slice(row.repository.length);
  if (repoPart.toLowerCase() !== row.repository || !rest.startsWith(`/${row.workflow_path}@`)) return false;
  if (row.ref !== null && (claims.ref !== row.ref || rest !== `/${row.workflow_path}@${row.ref}`)) return false;
  if (row.environment !== null && claims.environment !== row.environment) return false;
  return true;
}

export async function serveOidcExchange(request: Request, env: Env, deps: OidcExchangeDeps = {}): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    await enforceWriteLimit(env, rateLimitCaller(request, null), true);
    const secret = tokenSecret(env);
    if (secret === null) throw releaseError(503, "oidc.unavailable", "trusted publishing is not configured");
    const body = await readJsonObject(request, BODY_FIELDS, MAX_BODY_BYTES);
    if (typeof body.token !== "string" || body.token === "") throw invalidRequest("token must be the GitHub Actions OIDC token");
    const handle = typeof body.publisher === "string" ? body.publisher.replace(/^@/, "") : "";
    if (!BARE_PUBLISHER_HANDLE.test(handle)) throw invalidRequest("publisher must be @handle");

    const now = deps.now?.() ?? new Date();
    const claims = await verifyGithubOidcToken(body.token, {
      audience: env.SKILLX_OIDC_AUDIENCE || DEFAULT_OIDC_AUDIENCE,
      now,
      fetchJwks: deps.fetchJwks,
    });
    if (!PUBLISH_EVENTS.has(claims.event_name)) {
      throw releaseError(403, "oidc.event_forbidden", `only push, workflow_dispatch and release workflows can publish, not ${claims.event_name}`);
    }

    const publisher = await env.DB.prepare("SELECT id, state FROM publishers WHERE handle = ?").bind(handle).first<{ id: string; state: string }>();
    if (publisher === null) throw notTrusted();
    const { results } = await env.DB.prepare(
      "SELECT id, repository, repository_id, workflow_path, ref, environment FROM trusted_publishers WHERE publisher_id = ? AND provider = 'github' AND state = 'active' ORDER BY created_at, id",
    )
      .bind(publisher.id)
      .all<TrustedRow>();
    const trusted = results.find((row) => matchesTrustedPublisher(row, claims));
    if (trusted === undefined) throw notTrusted();
    if (publisher.state !== "active") throw releaseError(403, "publisher.inactive", `publisher @${handle} is ${publisher.state}`);

    const { token, expiresAt } = await mintOidcPublishToken(secret, { handle, publisherId: publisher.id, trustedPublisherId: trusted.id, jti: claims.jti }, now);
    // Opportunistic retention: a jti only blocks replay while its JWT (at most 1 hour) and
    // the publish token (15 minutes) live; older rows are kept a week for forensics.
    await env.DB.prepare(
      `DELETE FROM oidc_token_exchanges WHERE rowid IN (SELECT rowid FROM oidc_token_exchanges WHERE created_at <= ? LIMIT 50)`,
    )
      .bind(now.getTime() - EXCHANGE_RETENTION_MS)
      .run()
      .catch((error: unknown) => console.warn("oidc exchange: cannot delete old exchanges:", error instanceof Error ? error.message : String(error)));
    const recorded = await env.DB.prepare(
      `INSERT INTO oidc_token_exchanges (jti, trusted_publisher_id, publisher_id, repository, workflow_ref, run_id, created_at, token_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(jti) DO NOTHING RETURNING jti`,
    )
      .bind(claims.jti, trusted.id, publisher.id, claims.repository, claims.workflow_ref, claims.run_id, now.getTime(), expiresAt.getTime())
      .first<{ jti: string }>();
    if (recorded === null) throw releaseError(409, "oidc.replayed", "this OIDC token was already exchanged");

    console.info(`oidc publish token issued: @${handle} for ${claims.repository} run ${claims.run_id ?? "?"}`);
    return Response.json({ token, expiresAt: expiresAt.toISOString(), publisher: `@${handle}`, scope: `releases:publish:@${handle}` }, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("oidc exchange failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "oidc exchange failed"));
  }
}
