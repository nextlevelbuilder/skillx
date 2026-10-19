/**
 * Channel promotion: `POST /api/v1/packages/@handle/slug/releases/:version/promote`
 * with `{"to", "from"?, "reason"?}` (`application/json`).
 *
 * Moves a published release between `alpha`, `beta` and `stable` (like an npm
 * dist-tag). Only `package_releases.channel` changes: bytes, digests and the
 * signed manifest stay as published (the manifest's `channel` records the
 * channel at publish time; the listing and `X-SkillX-Release-Channel` carry
 * the current one).
 *
 * Who may move what:
 * - a publisher credential of the package handle (scoped
 *   `releases:publish:@handle` key or OIDC publish token): promotions only
 *   (alpha -> beta -> stable), so a CI key cannot demote a stable release;
 * - the package owner (session or account API key) and the admin
 *   (`X-Admin-Secret`): any move.
 *
 * Every attempt on an existing release is audited in `release_state_audit`
 * with `subject_kind` `release_channel` and the channels as `from_state` /
 * `to_state`, by the same compare-and-set as state changes: `from` (default:
 * the current channel when the request is read) must still hold when the
 * batch runs, otherwise `409 state_conflict`. The release must be published
 * and its publisher active when the batch runs. Requests are counted on
 * `RELEASE_WRITE_LIMITER` before the body is read. 404 while
 * `SKILLX_RELEASES_API` is off.
 */
import { RELEASE_CHANNELS } from "@skillx/contracts";
import type { ReleaseChannel } from "@skillx/contracts";
import { hashScopedApiKey } from "~/lib/auth/api-key-utils";
import { notFound, parsePackageIdentity, parseReleaseVersion } from "./release-access";
import { authorizeReleasePublisher } from "./release-auth";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "./release-http";
import { releasesApiEnabled } from "./release-limits";
import { rateLimitCaller } from "./release-rate-limit";
import { compareAndSet, recordAttempt } from "./release-state-cas";
import type { Attempt } from "./release-state-cas";
import { NO_STORE, enforceWriteLimit, failureHeaders, invalidRequest, methodNotAllowed, parseReason, readJsonObject, resolveLimitedActor } from "./release-state-http";
import { tokenSecret } from "./release-tokens";
import type { TransitionActor } from "./release-transitions";

const BODY_FIELDS: ReadonlySet<string> = new Set(["from", "to", "reason"]);
const RANK: Readonly<Record<ReleaseChannel, number>> = { alpha: 0, beta: 1, stable: 2 };
const isChannel = (value: unknown): value is ReleaseChannel => typeof value === "string" && (RELEASE_CHANNELS as readonly string[]).includes(value);

/** Re-checked inside the batch: the release is published and its publisher active. */
const PROMOTABLE_GUARD = `EXISTS (SELECT 1 FROM package_releases gr JOIN packages gp ON gp.id = gr.package_id
  JOIN publishers gpub ON gpub.id = gp.publisher_id WHERE gr.id = ? AND gr.release_state = 'published' AND gpub.state = 'active')`;

interface Subject {
  id: string;
  channel: string;
  release_state: string;
  release_digest: string | null;
  visibility: string;
  owner_user_id: string | null;
  publisher_state: string;
}

/** A bearer `sxo_` token, or an `sx_` key stored under the scoped hash. */
async function isPublisherCredential(db: D1Database, request: Request): Promise<boolean> {
  const header = request.headers.get("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (token.startsWith("sxo_")) return true;
  if (!/^sx_[0-9a-f]{64}$/.test(token)) return false;
  const row = await db.prepare("SELECT 1 AS found FROM api_keys WHERE key_hash = ? AND revoked_at IS NULL").bind(await hashScopedApiKey(token)).first();
  return row !== null;
}

async function resolvePromoteActor(request: Request, env: Env, handle: string, now: Date): Promise<TransitionActor> {
  if (request.headers.get("X-Admin-Secret") === null && (await isPublisherCredential(env.DB, request))) {
    const auth = await authorizeReleasePublisher(env.DB, request, handle, { tokenSecret: tokenSecret(env), now });
    await enforceWriteLimit(env, rateLimitCaller(request, `key:${auth.apiKeyId}`), true);
    return { kind: "publisher_key", id: auth.apiKeyId };
  }
  return resolveLimitedActor(request, env);
}

export interface PromoteResult {
  identity: string;
  version: string;
  releaseDigest: string | null;
  from: ReleaseChannel;
  to: ReleaseChannel;
  channel: ReleaseChannel;
  changedAt: string;
}

export async function promoteRelease(
  db: D1Database,
  identity: string,
  version: string,
  input: { from: ReleaseChannel | null; to: ReleaseChannel; reason: string | null; actor: TransitionActor; now: Date },
): Promise<PromoteResult> {
  const subject = await db
    .prepare(
      `SELECT r.id, r.channel, r.release_state, r.release_digest, p.visibility, pub.owner_user_id, pub.state AS publisher_state
         FROM package_releases r JOIN packages p ON p.id = r.package_id JOIN publishers pub ON pub.id = p.publisher_id
        WHERE p.name = ? AND r.version = ?`,
    )
    .bind(identity, version)
    .first<Subject>();
  if (subject === null) throw notFound();
  const from = input.from ?? (isChannel(subject.channel) ? subject.channel : "stable");
  const { to, actor } = input;
  const attempt: Attempt = { kind: "release_channel", subjectId: subject.id, input: { from, to, reason: input.reason, actor, now: input.now } };
  const refuse = async (outcome: "denied" | "invalid", error: ReleaseHttpError): Promise<never> => {
    await recordAttempt(db, attempt, outcome);
    throw error;
  };

  if (actor.kind === "user" && subject.owner_user_id !== actor.id) {
    // A private package stays indistinguishable from an unknown one.
    await refuse("denied", subject.visibility === "public" ? releaseError(403, "transition.not_owner", `only the owner of ${identity} or an admin may promote it`) : notFound());
  }
  if (from === to) await refuse("invalid", releaseError(422, "promote.same_channel", `the release is already in ${to}`));
  if (actor.kind === "publisher_key" && RANK[to] < RANK[from]) {
    await refuse("denied", releaseError(403, "promote.demotion_forbidden", "a publisher credential may only promote (alpha -> beta -> stable); demotion needs the owner or an admin"));
  }
  if (subject.release_state !== "published") {
    await refuse("invalid", releaseError(409, "promote.not_published", `only a published release can change channel; this one is ${subject.release_state}`));
  }
  if (subject.publisher_state !== "active") {
    await refuse("denied", releaseError(403, "publisher_revoked", "the publisher of this package is suspended or revoked"));
  }

  const outcome = await compareAndSet(db, attempt, { guard: { sql: PROMOTABLE_GUARD, binds: [subject.id] } });
  if (outcome === "denied") throw releaseError(409, "promote.not_published", "the release is no longer published, or its publisher is not active");
  if (outcome === "stale") throw releaseError(409, "state_conflict", `the release is no longer in ${from}; read its current channel and retry`);
  return { identity, version, releaseDigest: subject.release_digest, from, to, channel: to, changedAt: input.now.toISOString() };
}

/** Serves one promotion request. */
export async function servePromote(request: Request, env: Env, params: Record<string, string | undefined>, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") return methodNotAllowed();
  try {
    const identity = parsePackageIdentity(params.scope, params.slug);
    const version = parseReleaseVersion(params.version);
    const at = now();
    const actor = await resolvePromoteActor(request, env, identity.slice(1, identity.indexOf("/")), at);
    const body = await readJsonObject(request, BODY_FIELDS);
    if (!isChannel(body.to)) throw invalidRequest(`to must be one of: ${RELEASE_CHANNELS.join(", ")}`);
    if (body.from !== undefined && !isChannel(body.from)) throw invalidRequest(`from must be one of: ${RELEASE_CHANNELS.join(", ")}`);
    const result = await promoteRelease(env.DB, identity, version, {
      from: body.from ?? null,
      to: body.to,
      reason: parseReason(body.reason),
      actor,
      now: at,
    });
    return Response.json(result, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("release promote failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "release.internal_error", "release promote failed"));
  }
}
