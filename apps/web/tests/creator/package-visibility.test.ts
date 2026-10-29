import { beforeEach, describe, expect, it, vi } from "vitest";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { action as routeAction, loader as routeLoader } from "~/routes/api.v1.package-manage";
import { ADMIN, envOf, expectError, publish, useStateHarness } from "../releases/release-state-helpers";
import type { Harness } from "../releases/release-state-helpers";
import { ORIGIN, manage, packageAudit, readStatuses, setVisibility, visibilityOf } from "./creator-helpers";

/**
 * Package visibility changes: a compare-and-set on `from`, owner-only, audited,
 * and a change to public only with a same-origin web session and approval.
 * Fixtures: `user-a` owns `@alpha`, `user-b` owns `@beta`.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let h: Harness;
let ownerKey: string;
let digest: string;
const SAME_ORIGIN = { Origin: ORIGIN };

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  digest = await publish();
});

describe("package visibility: narrowing", () => {
  it("lets the owner key make a public package private, audited and no-store", async () => {
    const res = await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { key: ownerKey });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body).toMatchObject({ identity: "@alpha/demo", from: "public", to: "private", visibility: "private" });
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
    expect(packageAudit(h)).toEqual([
      { subject_kind: "package", subject_name: "@alpha/demo", actor_kind: "user", actor_id: "user-a", action: "visibility", from_value: "public", to_value: "private" },
    ]);
    expect(await readStatuses("@alpha/demo", digest)).toEqual([404, 404, 404, 404]);
  });

  it("makes an unlisted package readable anonymously by name", async () => {
    session.user = { id: "user-a" };
    expect((await manage("@alpha/demo", "visibility", { from: "public", to: "unlisted" }, { headers: SAME_ORIGIN })).status).toBe(200);
    expect(await readStatuses("@alpha/demo", digest)).toEqual([200, 200, 200, 200]);
  });

  it("answers 409 visibility_conflict when from is stale and writes nothing", async () => {
    expectError(await manage("@alpha/demo", "visibility", { from: "unlisted", to: "private" }, { key: ownerKey }), 409, "visibility_conflict");
    expect(packageAudit(h)).toEqual([]);
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("public");
  });

  it("validates the body", async () => {
    for (const body of [{ from: "public", to: "internal" }, { from: "public" }, { from: "public", to: "private", approve: "yes" }, { from: "public", to: "private", extra: 1 }]) {
      expect((await manage("@alpha/demo", "visibility", body, { key: ownerKey })).status).toBe(400);
    }
    expect((await manage("@alpha/demo", "visibility", { from: "public", to: "public" }, { key: ownerKey })).status).toBe(400);
  });
});

describe("package visibility: making a package public", () => {
  beforeEach(() => setVisibility("@alpha/demo", "private"));

  it("refuses an API key even with approval", async () => {
    const res = await manage("@alpha/demo", "visibility", { from: "private", to: "public", approve: true }, { key: ownerKey });
    expectError(res, 403, "visibility.approval_required");
    expect(packageAudit(h)).toEqual([]);
  });

  it("refuses a web session without approve: true", async () => {
    session.user = { id: "user-a" };
    expectError(await manage("@alpha/demo", "visibility", { from: "private", to: "public" }, { headers: SAME_ORIGIN }), 403, "visibility.approval_required");
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
  });

  it("accepts a same-origin web session with approve: true", async () => {
    session.user = { id: "user-a" };
    const res = await manage("@alpha/demo", "visibility", { from: "private", to: "public", approve: true }, { headers: SAME_ORIGIN });
    expect(res).toMatchObject({ status: 200, body: { visibility: "public" } });
    expect(packageAudit(h)).toEqual([expect.objectContaining({ actor_kind: "user", from_value: "private", to_value: "public" })]);
  });

  it("refuses a cross-origin web session before anything else", async () => {
    session.user = { id: "user-a" };
    for (const headers of [{ Origin: "https://evil.example" }, { "Sec-Fetch-Site": "cross-site" }]) {
      expectError(await manage("@alpha/demo", "visibility", { from: "private", to: "public", approve: true }, { headers }), 403, "cross_origin");
      expectError(await manage("@alpha/demo", "delete", {}, { headers }), 403, "cross_origin");
    }
    expect(packageAudit(h)).toEqual([]);
  });
});

describe("package visibility: making a private package unlisted", () => {
  beforeEach(() => setVisibility("@alpha/demo", "private"));

  it("refuses an owner API key, because unlisted is readable anonymously", async () => {
    for (const approve of [false, true]) {
      expectError(await manage("@alpha/demo", "visibility", { from: "private", to: "unlisted", approve }, { key: ownerKey }), 403, "visibility.approval_required");
    }
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
    expect(packageAudit(h)).toEqual([]);
    expect(await readStatuses("@alpha/demo", digest)).toEqual([404, 404, 404, 404]);
  });

  it("refuses a web session without approve: true and accepts one with it", async () => {
    session.user = { id: "user-a" };
    expectError(await manage("@alpha/demo", "visibility", { from: "private", to: "unlisted" }, { headers: SAME_ORIGIN }), 403, "visibility.approval_required");
    const res = await manage("@alpha/demo", "visibility", { from: "private", to: "unlisted", approve: true }, { headers: SAME_ORIGIN });
    expect(res).toMatchObject({ status: 200, body: { visibility: "unlisted" } });
    expect(packageAudit(h)).toEqual([expect.objectContaining({ actor_kind: "user", from_value: "private", to_value: "unlisted" })]);
    expect(await readStatuses("@alpha/demo", digest)).toEqual([200, 200, 200, 200]);
  });

  it("lets an owner API key make an unlisted package private again", async () => {
    setVisibility("@alpha/demo", "unlisted");
    expect((await manage("@alpha/demo", "visibility", { from: "unlisted", to: "private" }, { key: ownerKey })).status).toBe(200);
    expect(visibilityOf(h, "@alpha/demo").visibility).toBe("private");
  });
});

describe("package visibility: who may change it", () => {
  it("answers 404 to another account and to an unknown package", async () => {
    const otherKey = await h.createKey("user-b", null);
    expectError(await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { key: otherKey }), 404, "not_found");
    expectError(await manage("@alpha/none", "visibility", { from: "public", to: "private" }, { key: ownerKey }), 404, "not_found");
  });

  it("refuses scoped keys, anonymous callers and the admin", async () => {
    const scoped = await h.createKey("user-a", [releasePublishScope("alpha")]);
    expect((await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { key: scoped })).status).toBe(401);
    expect((await manage("@alpha/demo", "visibility", { from: "public", to: "private" })).status).toBe(401);
    expectError(await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { admin: ADMIN }), 403, "visibility.owner_only");
    expect(packageAudit(h)).toEqual([]);
  });

  it("answers 403 publisher_revoked to the owner of a suspended publisher", async () => {
    h.d1.raw.prepare("UPDATE publishers SET state = 'suspended' WHERE handle = 'alpha'").run();
    expectError(await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { key: ownerKey }), 403, "publisher_revoked");
  });

  it("is 404 while the releases API is off, 405 for other methods", async () => {
    expect((await manage("@alpha/demo", "visibility", {}, { key: ownerKey, env: { SKILLX_RELEASES_API: undefined } })).status).toBe(404);
    expect((await manage("@alpha/demo", "visibility", {}, { key: ownerKey, method: "PUT" })).status).toBe(405);
  });
});

describe("package management route", () => {
  const call = async (path: string, body: unknown) => {
    const request = new Request(`${ORIGIN}${path}`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerKey}` }, body: JSON.stringify(body) });
    return routeAction({ request, params: { scope: "@alpha", slug: "demo" }, context: { cloudflare: { env: envOf() } } } as never);
  };

  it("dispatches on the last path segment", async () => {
    expect((await call("/api/v1/packages/@alpha/demo/visibility", { from: "public", to: "unlisted" })).status).toBe(200);
    expect((await call("/api/v1/packages/@alpha/demo/delete", {})).status).toBe(200);
    expect((await call("/api/v1/packages/@alpha/demo/restore", {})).status).toBe(200);
    expect((await call("/api/v1/packages/@alpha/demo/purge", {})).status).toBe(404);
  });

  it("answers GET with 405, or 404 while the releases API is off", async () => {
    const get = (env: Record<string, unknown>) => routeLoader({ request: new Request(`${ORIGIN}/api/v1/packages/@alpha/demo/delete`), params: {}, context: { cloudflare: { env } } } as never);
    expect((await get(envOf())).status).toBe(405);
    expect((await get(envOf({ SKILLX_RELEASES_API: undefined }))).status).toBe(404);
  });
});
