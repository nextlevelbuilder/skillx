/**
 * Dispatch of `/api/v1/collections[/:id[/<sub>]]` by method and sub-path.
 * GETs are reads (anonymous allowed for non-private collections); POST,
 * PATCH and DELETE are owner writes. A collection is a recipe of package
 * references; per-user overlays and activation belong to personal kits.
 */
import { COLLECTION_VISIBILITIES } from "@skillx/contracts";
import type { CollectionMember } from "@skillx/contracts";
import { notFoundResponse, releaseError } from "~/lib/releases/release-http";
import { badRequest, json, readBody, requireRevisionNumber, serveCollections } from "./collection-http";
import type { CollectionCaller, CollectionEnv } from "./collection-http";
import {
  appendRevision,
  collectionView,
  deleteCollection,
  findRevision,
  insertCollection,
  listOwned,
  listRevisions,
  ownedCollection,
  prepareContent,
  readableCollection,
  revisionView,
  updateMetadata,
} from "./collection-store";

const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ID = /^col_[0-9a-f-]{36}$/;

function requireSlug(raw: unknown): string {
  if (typeof raw !== "string" || !SLUG.test(raw)) throw badRequest("slug must be 1 to 64 lowercase letters, digits or dashes");
  return raw;
}
function requireName(raw: unknown, fallback?: string): string {
  if (raw === undefined && fallback !== undefined) return fallback;
  if (typeof raw !== "string" || raw.trim() === "" || raw.length > 120) throw badRequest("name must be 1 to 120 characters");
  return raw.trim();
}
function requireVisibility(raw: unknown, fallback = "private"): string {
  if (raw === undefined) return fallback;
  if (!(COLLECTION_VISIBILITIES as readonly unknown[]).includes(raw)) throw badRequest(`visibility must be one of ${COLLECTION_VISIBILITIES.join(", ")}`);
  return raw as string;
}

/** The member list of `base` with `add` upserted by package and `remove` dropped (each must exist). */
export function editMembers(base: CollectionMember[], add: unknown, remove: unknown): unknown[] {
  if (add !== undefined && !Array.isArray(add)) throw badRequest("add must be an array of members");
  if (remove !== undefined && (!Array.isArray(remove) || remove.some((r) => typeof r !== "string"))) throw badRequest("remove must be an array of package names");
  const byName = new Map<string, unknown>(base.map((m) => [m.packageName, m]));
  for (const name of (remove ?? []) as string[]) {
    if (!byName.delete(name)) throw releaseError(422, "collection.member_missing", `${name} is not a member`);
  }
  for (const member of (add ?? []) as unknown[]) {
    const name = typeof member === "object" && member !== null ? (member as { packageName?: unknown }).packageName : undefined;
    if (typeof name !== "string") throw badRequest("every added member needs a packageName");
    byName.set(name, member);
  }
  return [...byName.values()];
}

type Handler = (c: CollectionCaller, id: string, args: string[]) => Promise<Response>;
interface RouteDef {
  pattern: RegExp;
  get?: Handler;
  post?: Handler;
  patch?: Handler;
  delete?: Handler;
}

const ROUTES: RouteDef[] = [
  {
    pattern: /^$/,
    get: async (c, id) => json({ collection: collectionView(await readableCollection(c, id), c.userId) }),
    patch: async (c, id) => {
      const row = await ownedCollection(c, id);
      const b = await readBody(c.request, ["name", "visibility"]);
      const updated = await updateMetadata(c, row, requireName(b.name, row.name), requireVisibility(b.visibility, row.visibility));
      return json({ collection: collectionView(updated, c.userId) });
    },
    delete: async (c, id) => {
      await deleteCollection(c, await ownedCollection(c, id));
      return json({ deleted: true, id });
    },
  },
  {
    pattern: /^revisions$/,
    get: async (c, id) => {
      await readableCollection(c, id);
      return json({ revisions: (await listRevisions(c, id)).map(revisionView) });
    },
    post: async (c, id) => {
      const row = await ownedCollection(c, id);
      const b = await readBody(c.request, ["expectedRevision", "members", "config"]);
      const revision = await appendRevision(c, row, requireRevisionNumber(b.expectedRevision), await prepareContent(b.members, b.config));
      return json({ revision: revisionView(revision) }, 201);
    },
  },
  {
    pattern: /^revisions\/(\d{1,9}|latest)$/,
    get: async (c, id, [n]) => {
      const row = await readableCollection(c, id);
      return json({ revision: revisionView(await findRevision(c, id, n === "latest" ? row.latest_revision_number : Number(n))) });
    },
  },
  {
    pattern: /^members$/,
    post: async (c, id) => {
      const row = await ownedCollection(c, id);
      const b = await readBody(c.request, ["expectedRevision", "add", "remove"]);
      const expected = requireRevisionNumber(b.expectedRevision);
      const latest = revisionView(await findRevision(c, id, row.latest_revision_number));
      const content = await prepareContent(editMembers(latest.members, b.add, b.remove), latest.config);
      return json({ revision: revisionView(await appendRevision(c, row, expected, content)) }, 201);
    },
  },
  {
    pattern: /^clone$/,
    post: async (c, id) => {
      const source = await readableCollection(c, id);
      const b = await readBody(c.request, ["slug", "name", "visibility", "revisionNumber"]);
      const number = b.revisionNumber === undefined ? source.latest_revision_number : requireRevisionNumber(b.revisionNumber, "revisionNumber");
      const from = revisionView(await findRevision(c, id, number));
      const created = await insertCollection(
        c,
        { slug: requireSlug(b.slug ?? source.slug), name: requireName(b.name, source.name), visibility: requireVisibility(b.visibility), clonedFrom: from.id },
        await prepareContent(from.members, from.config),
      );
      return json({ collection: collectionView(created.collection, c.userId), revision: revisionView(created.revision) }, 201);
    },
  },
];

const methodNotAllowed = (route: RouteDef) => {
  const allow = (["get", "post", "patch", "delete"] as const).filter((m) => route[m] !== undefined).map((m) => m.toUpperCase()).join(", ");
  return json({ error: { code: "method_not_allowed", message: `use ${allow}` } }, 405);
};

/** Serves `/api/v1/collections` (list own, create). */
export function serveCollectionIndex(request: Request, env: CollectionEnv, now?: () => Date): Promise<Response> {
  const write = request.method === "POST";
  return serveCollections(
    request,
    env,
    write ? "write" : "read",
    async (c) => {
      if (!write) {
        if (request.method !== "GET" && request.method !== "HEAD") return json({ error: { code: "method_not_allowed", message: "use GET, POST" } }, 405);
        if (c.userId === null) throw releaseError(401, "auth.required", "sign in, or send Authorization: Bearer <account API key>");
        return json({ collections: (await listOwned(c)).map((row) => collectionView(row, c.userId)) });
      }
      const b = await readBody(request, ["slug", "name", "visibility", "members", "config"]);
      const created = await insertCollection(
        c,
        { slug: requireSlug(b.slug), name: requireName(b.name, typeof b.slug === "string" ? b.slug : undefined), visibility: requireVisibility(b.visibility), clonedFrom: null },
        await prepareContent(b.members, b.config),
      );
      return json({ collection: collectionView(created.collection, c.userId), revision: revisionView(created.revision) }, 201);
    },
    now,
  );
}

/** Serves `/api/v1/collections/:id[/<sub>]`. */
export function serveCollectionRequest(request: Request, env: CollectionEnv, params: Record<string, string | undefined>, now?: () => Date): Promise<Response> {
  const sub = params["*"] ?? "";
  const route = ROUTES.find((r) => r.pattern.test(sub));
  const method = (request.method === "HEAD" ? "GET" : request.method).toLowerCase() as "get" | "post" | "patch" | "delete";
  return serveCollections(
    request,
    env,
    method === "get" ? "read" : "write",
    async (c) => {
      const id = params.id ?? "";
      if (route === undefined || !ID.test(id)) return notFoundResponse();
      const handler = route[method];
      if (handler === undefined) return methodNotAllowed(route);
      return handler(c, id, route.pattern.exec(sub)!.slice(1));
    },
    now,
  );
}
