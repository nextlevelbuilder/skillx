/**
 * Dispatch of `/api/v1/kits/@handle/name[/<sub>]` by method and sub-path.
 * GETs are reads; POSTs are writes (write limiter, fail closed). An unknown
 * sub-path is the JSON 404; a known path with the wrong method is 405.
 */
import { json, parseKitName, readKitBody, requireGeneration, requireId, requireIdempotencyKey, serveKit, withIfMatch } from "./kit-http";
import type { KitCaller, KitEnv } from "./kit-http";
import { readConflict, readConflicts, resolveConflict } from "./kit-conflicts";
import { activateRevision, readLock, rejectRevision } from "./kit-lifecycle";
import { submitProposal, validateProposal } from "./kit-proposals";
import { previewUpdate, rebaseKit } from "./kit-rebase";
import { quarantineRevision, readProposalReview, reviewProposal } from "./kit-review";
import { readDiff, readKit, readRevision, readRevisions, storeRevision, storedResponse } from "./kit-revisions";
import { notFoundResponse } from "~/lib/releases/release-http";

type Handler = (caller: KitCaller, kit: string, args: string[]) => Promise<Response>;

interface RouteDef {
  pattern: RegExp;
  get?: Handler;
  post?: Handler;
  /** Operator-only (admin secret); owners get 403. */
  admin?: true;
}

/** The request body; on a generation-guarded write, `If-Match` supplies or confirms `expectedGeneration`. */
const body = async (c: KitCaller, fields: string[]) => {
  const raw = await readKitBody(c.request, fields);
  return fields.includes("expectedGeneration") ? withIfMatch(c.request, raw) : raw;
};
const query = (c: KitCaller, name: string) => new URL(c.request.url).searchParams.get(name);

const ROUTES: RouteDef[] = [
  { pattern: /^$/, get: (c, k) => readKit(c, k) },
  {
    pattern: /^revisions$/,
    get: (c, k) => readRevisions(c, k),
    post: async (c, k) => {
      const b = await body(c, ["expectedGeneration", "idempotencyKey", "document"]);
      const stored = await storeRevision(c, {
        kitName: k,
        document: b.document,
        expectedGeneration: requireGeneration(b.expectedGeneration),
        idempotencyKey: requireIdempotencyKey(b.idempotencyKey),
        origin: "manual",
      });
      return storedResponse(stored);
    },
  },
  { pattern: /^revisions\/([^/]+)$/, get: (c, k, [id]) => readRevision(c, k, requireId(id, "revision")) },
  {
    pattern: /^revisions\/([^/]+)\/reject$/,
    post: async (c, k, [id]) => rejectRevision(c, k, requireId(id, "revision"), requireGeneration((await body(c, ["expectedGeneration"])).expectedGeneration)),
  },
  { pattern: /^revisions\/([^/]+)\/proposal$/, get: (c, k, [id]) => readProposalReview(c, k, requireId(id, "revision")) },
  {
    pattern: /^revisions\/([^/]+)\/review$/,
    post: async (c, k, [id]) => {
      const b = await body(c, ["expectedGeneration", "decision", "approval"]);
      return reviewProposal(c, k, requireId(id, "revision"), b, requireGeneration(b.expectedGeneration));
    },
  },
  {
    pattern: /^revisions\/([^/]+)\/quarantine$/,
    admin: true,
    post: async (c, k, [id]) => quarantineRevision(c, k, requireId(id, "revision"), (await body(c, ["reason"])).reason),
  },
  { pattern: /^proposals$/, post: async (c, k) => submitProposal(c, k, await body(c, ["expectedGeneration", "idempotencyKey", "proposal"])) },
  { pattern: /^proposals\/validate$/, post: async (c, k) => validateProposal(c, k, await body(c, ["expectedGeneration", "proposal"])) },
  {
    pattern: /^diff$/,
    get: (c, k) => readDiff(c, k, requireId(query(c, "from"), "from"), requireId(query(c, "to"), "to")),
  },
  { pattern: /^preview-update$/, post: async (c, k) => previewUpdate(c, k, await body(c, ["fromRevisionId", "updates", "includeForks"])) },
  {
    pattern: /^rebase$/,
    post: async (c, k) => {
      const b = await body(c, ["expectedGeneration", "idempotencyKey", "fromRevisionId", "updates", "includeForks"]);
      return rebaseKit(c, k, b, requireGeneration(b.expectedGeneration), requireIdempotencyKey(b.idempotencyKey));
    },
  },
  { pattern: /^conflicts$/, get: (c, k) => readConflicts(c, k) },
  { pattern: /^conflicts\/([^/]+)$/, get: (c, k, [id]) => readConflict(c, k, requireId(id, "conflict")) },
  {
    pattern: /^conflicts\/([^/]+)\/resolve$/,
    post: async (c, k, [id]) => {
      const b = await body(c, ["expectedGeneration", "idempotencyKey", "approvedBy", "decisions", "agentSuggestion"]);
      return resolveConflict(c, k, requireId(id, "conflict"), b, requireGeneration(b.expectedGeneration), requireIdempotencyKey(b.idempotencyKey));
    },
  },
  {
    pattern: /^(activate|rollback)$/,
    post: async (c, k, [verb]) => {
      const b = await body(c, ["expectedGeneration", "revisionId", "approval"]);
      return activateRevision(c, k, b, requireGeneration(b.expectedGeneration), verb === "rollback");
    },
  },
  {
    pattern: /^lock$/,
    get: (c, k) => {
      const rev = query(c, "revision");
      return readLock(c, k, rev === null ? null : requireId(rev, "revision"));
    },
  },
];

const methodNotAllowed = (allow: string) => json({ error: { code: "method_not_allowed", message: `use ${allow}` } }, 405, { Allow: allow });

/** Serves one request of the kit API. */
export async function serveKitRequest(request: Request, env: KitEnv, params: Record<string, string | undefined>, now?: () => Date): Promise<Response> {
  const sub = params["*"] ?? "";
  const route = ROUTES.find((r) => r.pattern.test(sub));
  const method = request.method === "HEAD" ? "GET" : request.method;
  const handler = method === "GET" ? route?.get : method === "POST" ? route?.post : undefined;
  return serveKit(
    request,
    env,
    route?.admin === true ? "admin" : method !== "GET" ? "write" : "read",
    async (caller) => {
      if (route === undefined) return notFoundResponse();
      if (handler === undefined) return methodNotAllowed(route.get !== undefined && route.post !== undefined ? "GET, POST" : route.get !== undefined ? "GET" : "POST");
      return handler(caller, parseKitName(params.scope, params.name), route.pattern.exec(sub)!.slice(1));
    },
    now,
  );
}
