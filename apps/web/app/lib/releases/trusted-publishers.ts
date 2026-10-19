/**
 * Admin configuration of trusted publishers: the GitHub Actions workflows
 * allowed to exchange their OIDC token for a short-lived publish token of
 * one publisher (see `oidc-exchange.ts`).
 *
 * - `GET  /api/v1/publishers/:handle/trusted-publishers` lists them.
 * - `POST /api/v1/publishers/:handle/trusted-publishers` adds one:
 *   `{repository, repositoryId, workflowPath, ref?, environment?, reason?}`.
 *   `repositoryId` is GitHub's numeric id (`gh api repos/OWNER/REPO --jq .id`);
 *   it survives a rename and stops a re-created repository of the same name
 *   from inheriting the trust. An identical active entry is returned as is.
 * - `POST /api/v1/publishers/:handle/trusted-publishers/:id/revoke` revokes one.
 *
 * Admin (`X-Admin-Secret`) only, counted on `RELEASE_WRITE_LIMITER`; every
 * change writes a `release_state_audit` row (`subject_kind`
 * `trusted_publisher`) in the same batch. Answers are `no-store`.
 */
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { AUDIT_COLUMNS } from "./release-state-cas";
import { BARE_PUBLISHER_HANDLE, NO_STORE, failureHeaders, invalidRequest, parseReason, readJsonObject, resolveLimitedActor } from "./release-state-http";

const BODY_FIELDS: ReadonlySet<string> = new Set(["repository", "repositoryId", "workflowPath", "ref", "environment", "reason"]);
const REVOKE_FIELDS: ReadonlySet<string> = new Set(["reason"]);
const REPOSITORY = /^[a-z0-9](?:[a-z0-9-]{0,38})\/[a-z0-9._-]{1,100}$/;
const REPOSITORY_ID = /^[1-9][0-9]{0,19}$/;
const WORKFLOW_PATH = /^\.github\/workflows\/[A-Za-z0-9._-]{1,100}\.ya?ml$/;
const REF = /^refs\/(?:heads|tags)\/[\x21-\x7e]{1,200}$/;
const ENVIRONMENT = /^[\x21-\x7e](?:[\x20-\x7e]{0,253}[\x21-\x7e])?$/;
const MAX_ACTIVE = 20;

type Params = Record<string, string | undefined>;

export interface TrustedPublisher {
  id: string;
  provider: "github";
  repository: string;
  repositoryId: string;
  workflowPath: string;
  ref: string | null;
  environment: string | null;
  state: "active" | "revoked";
  createdAt: string;
  revokedAt: string | null;
}

type Row = { id: string; provider: "github"; repository: string; repository_id: string; workflow_path: string; ref: string | null; environment: string | null; state: "active" | "revoked"; created_at: number; revoked_at: number | null };

const toApi = (r: Row): TrustedPublisher => ({
  id: r.id,
  provider: r.provider,
  repository: r.repository,
  repositoryId: r.repository_id,
  workflowPath: r.workflow_path,
  ref: r.ref,
  environment: r.environment,
  state: r.state,
  createdAt: new Date(r.created_at).toISOString(),
  revokedAt: r.revoked_at === null ? null : new Date(r.revoked_at).toISOString(),
});

const optional = (value: unknown, pattern: RegExp, message: string): string | null => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !pattern.test(value)) throw invalidRequest(message);
  return value;
};

async function publisherId(db: D1Database, handle: string | undefined): Promise<string> {
  if (handle === undefined || !BARE_PUBLISHER_HANDLE.test(handle)) throw releaseError(404, "publisher.not_found", "unknown publisher");
  const row = await db.prepare("SELECT id FROM publishers WHERE handle = ?").bind(handle).first<{ id: string }>();
  if (row === null) throw releaseError(404, "publisher.not_found", "unknown publisher");
  return row.id;
}

const SELECT = "SELECT id, provider, repository, repository_id, workflow_path, ref, environment, state, created_at, revoked_at FROM trusted_publishers";

export async function listTrustedPublishers(db: D1Database, pubId: string): Promise<TrustedPublisher[]> {
  const { results } = await db.prepare(`${SELECT} WHERE publisher_id = ? ORDER BY created_at, id`).bind(pubId).all<Row>();
  return results.map(toApi);
}

export async function addTrustedPublisher(db: D1Database, pubId: string, body: Record<string, unknown>, now: Date): Promise<{ trustedPublisher: TrustedPublisher; created: boolean }> {
  const repository = typeof body.repository === "string" ? body.repository.toLowerCase() : "";
  if (!REPOSITORY.test(repository)) throw invalidRequest("repository must be owner/repo");
  if (typeof body.repositoryId !== "string" || !REPOSITORY_ID.test(body.repositoryId)) throw invalidRequest("repositoryId must be the numeric GitHub repository id, as a string");
  if (typeof body.workflowPath !== "string" || !WORKFLOW_PATH.test(body.workflowPath)) throw invalidRequest("workflowPath must be .github/workflows/<file>.yml");
  const ref = optional(body.ref, REF, "ref must be refs/heads/<branch> or refs/tags/<tag>");
  const environment = optional(body.environment, ENVIRONMENT, "environment must be a GitHub environment name");
  const reason = parseReason(body.reason);
  const key = [repository, body.repositoryId, body.workflowPath, ref, environment] as const;

  const same = await db
    .prepare(`${SELECT} WHERE publisher_id = ? AND state = 'active' AND repository = ? AND repository_id = ? AND workflow_path = ? AND ref IS ? AND environment IS ?`)
    .bind(pubId, ...key)
    .first<Row>();
  if (same !== null) return { trustedPublisher: toApi(same), created: false };

  const id = `tp_${crypto.randomUUID()}`;
  const at = now.getTime();
  await db.batch([
    db
      .prepare(
        `INSERT INTO trusted_publishers (id, publisher_id, provider, repository, repository_id, workflow_path, ref, environment, state, created_at)
         SELECT ?, ?, 'github', ?, ?, ?, ?, ?, 'active', ?
          WHERE (SELECT count(*) FROM trusted_publishers WHERE publisher_id = ? AND state = 'active') < ${MAX_ACTIVE}`,
      )
      .bind(id, pubId, ...key, at, pubId),
    db
      .prepare(`INSERT INTO release_state_audit (${AUDIT_COLUMNS}) SELECT ?, 'trusted_publisher', ?, 'admin', 'admin', 'none', 'active', 'applied', ?, ? WHERE EXISTS (SELECT 1 FROM trusted_publishers WHERE id = ?)`)
      .bind(`rsa_${crypto.randomUUID()}`, id, reason, at, id),
  ]);
  const stored = await db.prepare(`${SELECT} WHERE id = ?`).bind(id).first<Row>();
  if (stored === null) throw releaseError(409, "trusted_publisher.limit", `a publisher may have at most ${MAX_ACTIVE} active trusted publishers`);
  return { trustedPublisher: toApi(stored), created: true };
}

export async function revokeTrustedPublisher(db: D1Database, pubId: string, id: string, reason: string | null, now: Date): Promise<TrustedPublisher> {
  const at = now.getTime();
  const auditId = `rsa_${crypto.randomUUID()}`;
  await db.batch([
    db.prepare("UPDATE trusted_publishers SET state = 'revoked', revoked_at = ? WHERE id = ? AND publisher_id = ? AND state = 'active'").bind(at, id, pubId),
    db
      .prepare(`INSERT INTO release_state_audit (${AUDIT_COLUMNS}) SELECT ?, 'trusted_publisher', ?, 'admin', 'admin', 'active', 'revoked', 'applied', ?, ? WHERE EXISTS (SELECT 1 FROM trusted_publishers WHERE id = ? AND revoked_at = ?)`)
      .bind(auditId, id, reason, at, id, at),
  ]);
  const stored = await db.prepare(`${SELECT} WHERE id = ? AND publisher_id = ?`).bind(id, pubId).first<Row>();
  if (stored === null) throw releaseError(404, "trusted_publisher.not_found", "unknown trusted publisher");
  // This request revoked it exactly when the stored revocation time is ours.
  if (stored.revoked_at !== at) throw releaseError(409, "trusted_publisher.already_revoked", "the trusted publisher is already revoked");
  return toApi(stored);
}

/** Serves the three routes; `params.id` selects revocation. */
export async function serveTrustedPublishers(request: Request, env: Env, params: Params, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  const revoke = params.id !== undefined;
  const allowed = revoke ? "POST" : "GET, POST";
  if (!allowed.split(", ").includes(request.method)) {
    return Response.json({ error: { code: "method_not_allowed", message: `use ${allowed}` } }, { status: 405, headers: { Allow: allowed, ...NO_STORE } });
  }
  try {
    const actor = await resolveLimitedActor(request, env);
    if (actor.kind !== "admin") throw releaseError(403, "trusted_publisher.admin_only", "only an admin may configure trusted publishers");
    const pubId = await publisherId(env.DB, params.handle);
    if (request.method === "GET") return Response.json({ trustedPublishers: await listTrustedPublishers(env.DB, pubId) }, { headers: NO_STORE });
    if (revoke) {
      const body = await readJsonObject(request, REVOKE_FIELDS);
      const trustedPublisher = await revokeTrustedPublisher(env.DB, pubId, params.id!, parseReason(body.reason), now());
      return Response.json({ trustedPublisher }, { headers: NO_STORE });
    }
    const result = await addTrustedPublisher(env.DB, pubId, await readJsonObject(request, BODY_FIELDS), now());
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("trusted publisher change failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "trusted publisher change failed"));
  }
}
