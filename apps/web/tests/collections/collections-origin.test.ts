import { beforeEach, describe, expect, it, vi } from "vitest";
import { call, create, h, ownerKey } from "./collections-harness";

/**
 * A collection write in a web session (no `Authorization`) rides the ambient
 * cookie, so it must come from this origin; an API key is never ambient and is
 * not checked.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

beforeEach(() => {
  session.user = null;
});

const count = () => h.d1.raw.prepare("SELECT COUNT(*) AS n FROM collections").get() as { n: number };

describe("collections: same-origin web sessions", () => {
  it("refuses a cross-origin web-session write on every write method, writing nothing", async () => {
    session.user = { id: "user-a" };
    for (const headers of [{ Origin: "https://evil.example" }, { Origin: "https://sub.skillx.test" }, { "Sec-Fetch-Site": "same-site" }]) {
      const refused = await create({}, { key: null, headers });
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("cross_origin");
    }
    expect(count().n).toBe(0);

    const { id } = (await create({}, { key: ownerKey })).body.collection;
    const foreign = { key: null, headers: { Origin: "https://evil.example" } };
    expect((await call(`/api/v1/collections/${id}`, { name: "x" }, { ...foreign, method: "PATCH" })).body.error.code).toBe("cross_origin");
    expect((await call(`/api/v1/collections/${id}`, {}, { ...foreign, method: "DELETE" })).body.error.code).toBe("cross_origin");
    expect((await call(`/api/v1/collections/${id}`, undefined, { key: ownerKey })).body.collection.name).toBe("Starter");
  });

  it("accepts a same-origin or header-less web-session write", async () => {
    session.user = { id: "user-a" };
    expect((await create({}, { key: null, headers: { Origin: "https://skillx.test" } })).status).toBe(201);
    expect((await create({ slug: "second" }, { key: null, headers: { "Sec-Fetch-Site": "same-origin" } })).status).toBe(201);
    expect((await create({ slug: "third" }, { key: null })).status).toBe(201);
  });

  it("does not check the origin of an API-key write", async () => {
    expect((await create({}, { headers: { Origin: "https://evil.example" } })).status).toBe(201);
  });
});
