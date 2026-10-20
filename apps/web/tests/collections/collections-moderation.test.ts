import { describe, expect, it } from "vitest";
import { collectionLimit } from "~/lib/collections/collection-http";
import { collectionView, isHidden } from "~/lib/collections/collection-views";
import { ADMIN_SECRET, call, create, h, otherKey } from "./collections-harness";

const admin = { key: null, headers: { "X-Admin-Secret": ADMIN_SECRET } };
const moderate = (id: string, body: Record<string, unknown>) => call(`/api/v1/collections/${id}/moderation`, body, admin);

describe("collections per-account cap", () => {
  it("defaults to 100 and takes a positive integer override", () => {
    expect(collectionLimit({})).toBe(100);
    expect(collectionLimit({ SKILLX_COLLECTIONS_MAX_PER_USER: " 3 " })).toBe(3);
    for (const bad of ["0", "-1", "abc", "1.5", "9999999"]) expect(collectionLimit({ SKILLX_COLLECTIONS_MAX_PER_USER: bad })).toBe(100);
  });

  it("refuses a create or clone over the cap with 409 and writes nothing", async () => {
    const env = { SKILLX_COLLECTIONS_MAX_PER_USER: "2" };
    expect((await create({ slug: "one" }, { env })).status).toBe(201);
    const pub = (await create({ slug: "two", visibility: "public" }, { env })).body.collection;
    const over = await create({ slug: "three" }, { env });
    expect(over).toMatchObject({ status: 409, body: { error: { code: "collection.limit_reached" } } });
    const clone = await call(`/api/v1/collections/${pub.id}/clone`, { slug: "copy" }, { env });
    expect(clone.body.error.code).toBe("collection.limit_reached");
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM collections").get()).toEqual({ n: 2 });
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM collection_revisions").get()).toEqual({ n: 2 });
    // The cap is per account: another user still clones, and deleting frees a slot.
    expect((await call(`/api/v1/collections/${pub.id}/clone`, { slug: "copy" }, { env, key: otherKey })).status).toBe(201);
    expect((await call(`/api/v1/collections/${pub.id}`, undefined, { method: "DELETE" })).status).toBe(200);
    expect((await create({ slug: "three" }, { env })).status).toBe(201);
  });
});

describe("collections moderation", () => {
  it("hides a public collection from everyone but its owner, and blocks cloning", async () => {
    const { id } = (await create({ visibility: "public" })).body.collection;
    const hidden = await moderate(id, { from: "active", to: "hidden", reason: "spam" });
    expect(hidden.status).toBe(200);
    expect(hidden.body.collection).toMatchObject({ id, visibility: "public", moderation: { state: "hidden", reason: "spam" } });
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: null })).status).toBe(404);
    expect((await call(`/api/v1/collections/${id}/revisions/latest`, undefined, { key: otherKey })).status).toBe(404);
    expect((await call(`/api/v1/collections/${id}/clone`, { slug: "copy" }, { key: otherKey })).status).toBe(404);
    const own = await call(`/api/v1/collections/${id}`);
    expect(own.body.collection.moderation).toMatchObject({ state: "hidden", reason: "spam" });
    expect((await call(`/api/v1/collections/${id}/clone`, { slug: "copy" })).body.error.code).toBe("collection.hidden");
    // Re-publishing does not lift the hide; only an operator does.
    expect((await call(`/api/v1/collections/${id}`, { visibility: "unlisted" }, { method: "PATCH" })).status).toBe(200);
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: null })).status).toBe(404);
    // The owner keeps editing; new revisions stay hidden, and deleting is refused so the slot stays used.
    expect((await call(`/api/v1/collections/${id}/members`, { expectedRevision: 1, remove: ["@alpha/demo"] })).status).toBe(201);
    expect((await call(`/api/v1/collections/${id}/revisions/latest`, undefined, { key: null })).status).toBe(404);
    const del = await call(`/api/v1/collections/${id}`, undefined, { method: "DELETE" });
    expect(del).toMatchObject({ status: 409, body: { error: { code: "collection.hidden" } } });
    expect((await moderate(id, { from: "hidden", to: "active" })).body.collection.moderation).toBeUndefined();
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: null })).status).toBe(200);
  });

  it("is compare-and-set and audits every attempt", async () => {
    const { id } = (await create({ visibility: "public" })).body.collection;
    expect((await moderate(id, { from: "active", to: "hidden", reason: "spam" })).status).toBe(200);
    const stale = await moderate(id, { from: "active", to: "hidden", reason: "other" });
    expect(stale).toMatchObject({ status: 409, body: { error: { code: "collection.moderation_conflict" } } });
    expect((await moderate(id, { from: "hidden", to: "hidden" })).status).toBe(400);
    expect((await moderate(id, { from: "active", to: "gone" })).status).toBe(400);
    const read = await call(`/api/v1/collections/${id}/moderation`, undefined, admin);
    expect(read.body.collection.moderation).toMatchObject({ state: "hidden", reason: "spam" });
    expect(read.body.revision).toMatchObject({ revisionNumber: 1, members: [{ packageName: "@alpha/demo" }] });
    expect(read.body.history.map((e: { outcome: string }) => e.outcome).sort()).toEqual(["applied", "stale"]);
    const rows = h.d1.raw.prepare("SELECT actor_kind, subject_kind FROM release_state_audit WHERE subject_id = ?").all(id);
    expect(rows).toEqual([
      { actor_kind: "admin", subject_kind: "collection" },
      { actor_kind: "admin", subject_kind: "collection" },
    ]);
  });

  it("reads a row written before migration 0020 as active", () => {
    const legacy = { id: "col_x", owner_id: "u", slug: "s", name: "n", visibility: "public", latest_revision_number: 1, cloned_from_revision_id: null, created_at: 0, updated_at: 0 };
    expect(isHidden(legacy)).toBe(false);
    expect(collectionView(legacy, null)).not.toHaveProperty("moderation");
  });

  it("is reserved to the admin secret and 404s unknown collections", async () => {
    const { id } = (await create({ visibility: "public" })).body.collection;
    expect((await call(`/api/v1/collections/${id}/moderation`, { from: "active", to: "hidden" })).body.error.code).toBe("collection.admin_only");
    expect((await call(`/api/v1/collections/${id}/moderation`, undefined, { key: null })).status).toBe(401);
    const wrong = await call(`/api/v1/collections/${id}/moderation`, undefined, { key: null, headers: { "X-Admin-Secret": "nope" } });
    expect(wrong.body.error.code).toBe("invalid_admin_secret");
    expect((await moderate("col_00000000-0000-0000-0000-000000000000", { from: "active", to: "hidden" })).status).toBe(404);
    expect((await call(`/api/v1/collections/${id}/moderation`, undefined, { method: "DELETE", ...admin })).status).toBe(405);
  });
});
