/**
 * HTTP boundary of the owner management API:
 *
 * - `POST /api/v1/packages/@handle/slug/visibility` with `{"from", "to", "approve"?}`
 * - `POST /api/v1/packages/@handle/slug/delete` and `.../restore` with `{}`
 * - `POST /api/v1/kits/@handle/name/delete` and `.../restore` with `{}`
 *
 * 404 `not_found` while `SKILLX_RELEASES_API` is off; the kit routes also
 * need `SKILLX_PERSONAL_KITS_API` (else 404 `kit.api_disabled`). The actor is
 * resolved exactly as by the release state API (`resolveLimitedActor`): a
 * cookie-session request from another origin is `403 cross_origin` first,
 * then the admin secret, an unscoped key or the session; every scoped key is
 * refused (401), so a leaked CI or kit key cannot delete or publish widely.
 * Writes count against `RELEASE_WRITE_LIMITER` before the body is read.
 * Bodies are `application/json` (a cross-origin page cannot send that without
 * a preflight these routes never grant). Every answer is `no-store`.
 */
import { isPackageVisibility, PACKAGE_VISIBILITIES } from "@skillx/contracts";
import { kitApiDisabledResponse, parseKitName, personalKitsApiEnabled } from "~/lib/personal-kits/kit-http";
import { parsePackageIdentity } from "~/lib/releases/release-access";
import { ReleaseHttpError, errorResponse, notFoundResponse, releaseError } from "~/lib/releases/release-http";
import { releasesApiEnabled } from "~/lib/releases/release-limits";
import { NO_STORE, failureHeaders, invalidRequest, methodNotAllowed, readJsonObject, resolveLimitedActor } from "~/lib/releases/release-state-http";
import { deleteKit, restoreKit } from "./kit-management";
import { changePackageVisibility, deletePackage, restorePackage } from "./package-management";

export type PackageAction = "visibility" | "delete" | "restore";
export type KitAction = "delete" | "restore";

const PACKAGE_ACTIONS: ReadonlySet<string> = new Set(["visibility", "delete", "restore"]);
export const isPackageAction = (value: string): value is PackageAction => PACKAGE_ACTIONS.has(value);
export const isKitAction = (value: string): value is KitAction => value === "delete" || value === "restore";

const VISIBILITY_FIELDS: ReadonlySet<string> = new Set(["from", "to", "approve"]);
const NO_FIELDS: ReadonlySet<string> = new Set();

type Params = Record<string, string | undefined>;

/** A signed-in web session: no API key and no admin secret on the request. */
const isInteractive = (request: Request) => !request.headers.has("Authorization") && !request.headers.has("X-Admin-Secret");

async function readVisibilityBody(request: Request) {
  const body = await readJsonObject(request, VISIBILITY_FIELDS);
  if (!isPackageVisibility(body.from) || !isPackageVisibility(body.to)) throw invalidRequest(`from and to must be one of: ${PACKAGE_VISIBILITIES.join(", ")}`);
  if (body.approve !== undefined && typeof body.approve !== "boolean") throw invalidRequest("approve must be a boolean");
  return { from: body.from, to: body.to, approve: body.approve === true };
}

async function run(work: () => Promise<unknown>): Promise<Response> {
  try {
    return Response.json(await work(), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ReleaseHttpError) return errorResponse(error, failureHeaders(error));
    console.error("owner management request failed:", error instanceof Error ? error.message : String(error));
    return errorResponse(releaseError(500, "owner.internal_error", "owner management request failed"));
  }
}

/** Serves one package management request. */
export async function servePackageAction(request: Request, env: Env, params: Params, action: PackageAction, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (request.method !== "POST") return methodNotAllowed();
  return run(async () => {
    const identity = parsePackageIdentity(params.scope, params.slug);
    const actor = await resolveLimitedActor(request, env);
    if (action === "visibility") {
      const body = await readVisibilityBody(request);
      return changePackageVisibility(env.DB, identity, { ...body, interactive: isInteractive(request), actor, now: now() });
    }
    await readJsonObject(request, NO_FIELDS);
    return action === "delete" ? deletePackage(env.DB, identity, actor, now()) : restorePackage(env.DB, identity, actor, now());
  });
}

/** Serves one kit delete or restore request (dispatched by the kit router). */
export async function serveKitAction(request: Request, env: Env, params: Params, action: KitAction, now: () => Date = () => new Date()): Promise<Response> {
  if (!releasesApiEnabled(env)) return notFoundResponse();
  if (!personalKitsApiEnabled(env as { SKILLX_PERSONAL_KITS_API?: string })) return kitApiDisabledResponse();
  if (request.method !== "POST") return methodNotAllowed();
  return run(async () => {
    const kit = parseKitName(params.scope, params.name);
    const actor = await resolveLimitedActor(request, env);
    await readJsonObject(request, NO_FIELDS);
    return action === "delete" ? deleteKit(env.DB, kit, actor, now()) : restoreKit(env.DB, kit, actor, now());
  });
}
