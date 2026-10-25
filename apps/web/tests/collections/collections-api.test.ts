import { describe, expect, it } from "vitest";
import { ADMIN_SECRET, DIGEST, call, create, h, otherKey, scopedKey } from "./collections-harness";

describe("collections API", () => {
  it("is 404 while the flag is off", async () => {
    const res = await call("/api/v1/collections", undefined, { env: { SKILLX_COLLECTIONS_API: "0" } });
    expect(res).toEqual({ status: 404, body: { error: { code: "not_found", message: "Not found" } } });
  });

  it("creates a private collection with an immutable, digested revision 1", async () => {
    const res = await create();
    expect(res.status).toBe(201);
    expect(res.body.collection).toMatchObject({ slug: "starter", visibility: "private", owned: true, latestRevisionNumber: 1, clonedFromRevisionId: null });
    expect(res.body.revision).toMatchObject({ revisionNumber: 1, members: [{ packageName: "@alpha/demo", version: "1.0.0" }], config: { scope: "user" } });
    expect(res.body.revision.revisionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(() => h.d1.raw.prepare("UPDATE collection_revisions SET members_json = '[]'").run()).toThrow(/immutable/);
    expect((await create()).body.error.code).toBe("collection.slug_exists");
  });

  it("hides private collections from others and anonymous callers, shows unlisted ones", async () => {
    const { id } = (await create()).body.collection;
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: otherKey })).status).toBe(404);
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: null })).status).toBe(404);
    expect((await call(`/api/v1/collections/${id}`, { visibility: "unlisted" }, { method: "PATCH" })).body.collection.visibility).toBe("unlisted");
    const anon = await call(`/api/v1/collections/${id}/revisions/latest`, undefined, { key: null });
    expect(anon.status).toBe(200);
    expect(anon.body.revision.revisionNumber).toBe(1);
    expect((await call(`/api/v1/collections/${id}`, { name: "Mine now" }, { method: "PATCH", key: otherKey })).status).toBe(404);
  });

  it("adds and removes members as new revisions with compare-and-set", async () => {
    const { id } = (await create()).body.collection;
    const added = await call(`/api/v1/collections/${id}/members`, { expectedRevision: 1, add: [{ packageName: "@alpha/zed", version: "2.0.0", digest: DIGEST }] });
    expect(added.status).toBe(201);
    expect(added.body.revision.members.map((m: { packageName: string }) => m.packageName)).toEqual(["@alpha/demo", "@alpha/zed"]);
    const stale = await call(`/api/v1/collections/${id}/members`, { expectedRevision: 1, remove: ["@alpha/demo"] });
    expect(stale).toMatchObject({ status: 409, body: { error: { code: "collection.revision_conflict" } } });
    const removed = await call(`/api/v1/collections/${id}/members`, { expectedRevision: 2, remove: ["@alpha/demo"] });
    expect(removed.body.revision).toMatchObject({ revisionNumber: 3, members: [{ packageName: "@alpha/zed" }] });
    expect((await call(`/api/v1/collections/${id}/members`, { expectedRevision: 3, remove: ["@alpha/nope"] })).body.error.code).toBe("collection.member_missing");
    const revisions = await call(`/api/v1/collections/${id}/revisions`);
    expect(revisions.body.revisions.map((r: { revisionNumber: number }) => r.revisionNumber)).toEqual([3, 2, 1]);
    expect((await call(`/api/v1/collections/${id}/revisions/1`)).body.revision.members).toHaveLength(1);
  });

  it("replaces content with a full revision and refuses secrets and absolute paths", async () => {
    const { id } = (await create()).body.collection;
    const ok = await call(`/api/v1/collections/${id}/revisions`, { expectedRevision: 1, members: [], config: {} });
    expect(ok.body.revision).toMatchObject({ revisionNumber: 2, members: [] });
    const leak = await call(`/api/v1/collections/${id}/revisions`, { expectedRevision: 2, members: [], config: { token: "ghp_0123456789abcdefghijklmnopqrstuvwxyz", dir: "/home/alice/skills" } });
    expect(leak.status).toBe(422);
    expect(leak.body.error.issues).toEqual(expect.arrayContaining([{ path: "config.token", code: "sync.secret-key" }, { path: "config.dir", code: "sync.absolute-path" }]));
    expect(JSON.stringify(leak.body)).not.toContain("ghp_");
  });

  it("clones a readable collection into the caller's account with lineage", async () => {
    const created = (await create({ visibility: "public" })).body;
    const clone = await call(`/api/v1/collections/${created.collection.id}/clone`, { slug: "copy" }, { key: otherKey });
    expect(clone.status).toBe(201);
    expect(clone.body.collection).toMatchObject({ slug: "copy", visibility: "private", owned: true, clonedFromRevisionId: created.revision.id });
    // The cloner reads no `@alpha/demo`, so the clone starts without it and carries its own digest.
    expect(clone.body.revision.members).toEqual([]);
    expect(clone.body.revision.revisionDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(clone.body.revision.revisionDigest).not.toBe(created.revision.revisionDigest);
    const own = await call(`/api/v1/collections/${created.collection.id}/clone`, { slug: "own-copy" });
    expect(own.body.revision.members).toEqual(created.revision.members);
    expect(own.body.revision.revisionDigest).toBe(created.revision.revisionDigest);
    const privateOne = (await create({ slug: "secret-list" })).body.collection;
    expect((await call(`/api/v1/collections/${privateOne.id}/clone`, { slug: "x" }, { key: otherKey })).status).toBe(404);
  });

  it("deletes only for the owner, and lists only the caller's collections", async () => {
    const { id } = (await create()).body.collection;
    expect((await call(`/api/v1/collections/${id}`, undefined, { method: "DELETE", key: otherKey })).status).toBe(404);
    expect((await call("/api/v1/collections", undefined, { key: otherKey })).body.collections).toEqual([]);
    expect((await call(`/api/v1/collections/${id}`, undefined, { method: "DELETE" })).body).toEqual({ deleted: true, id });
    expect((await call(`/api/v1/collections/${id}`)).status).toBe(404);
    expect(h.d1.raw.prepare("SELECT count(*) AS n FROM collection_revisions").get()).toEqual({ n: 0 });
  });

  it("refuses scoped publish keys, the admin secret and anonymous writes", async () => {
    expect((await create()).status).toBe(201);
    expect((await call("/api/v1/collections", { slug: "x" }, { key: scopedKey })).status).toBe(401);
    expect((await call("/api/v1/collections", { slug: "x" }, { key: null })).status).toBe(401);
    expect((await call("/api/v1/collections", undefined, { key: null })).status).toBe(401);
    const admin = await call("/api/v1/collections", { slug: "x" }, { key: null, headers: { "X-Admin-Secret": ADMIN_SECRET } });
    expect(admin).toMatchObject({ status: 403, body: { error: { code: "collection.owner_only" } } });
  });

  it("validates bodies: unknown fields, bad slugs and member shapes", async () => {
    expect((await call("/api/v1/collections", { slug: "Bad Slug" })).body.error.code).toBe("invalid_request");
    expect((await call("/api/v1/collections", { slug: "ok", extra: 1 })).body.error.code).toBe("invalid_request");
    const bad = await call("/api/v1/collections", { slug: "ok", members: [{ packageName: "nope" }] });
    expect(bad).toMatchObject({ status: 422, body: { error: { code: "collection.invalid" } } });
  });
});
