import { beforeEach, describe, expect, it, vi } from "vitest";
import { readablePackageNames } from "~/lib/releases/release-access";
import { listQuarantine } from "~/lib/releases/release-review-queue";
import { action as promoteAction } from "~/routes/api.v1.release-promote";
import { action as reviewAction } from "~/routes/api.v1.release-review";
import { NOW, tarOf } from "../releases/release-harness";
import { ADMIN, change, envOf, expectError, publish, skillFiles, useStateHarness } from "../releases/release-state-helpers";
import type { Harness } from "../releases/release-state-helpers";
import { manage, mintDownload, packageAudit, readStatuses, setVisibility, visibilityOf } from "./creator-helpers";

/**
 * Soft delete: a deleted package disappears from every read path for every
 * viewer, refuses new versions and transitions, and can be restored for 30
 * days; afterwards its name stays reserved.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const DAY = 24 * 60 * 60 * 1000;
let h: Harness;
let ownerKey: string;
let digest: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  digest = await publish();
});

const at = (days: number) => new Date(NOW.getTime() + days * DAY);

describe("package deletion", () => {
  it("hides the package from every read, for anonymous callers and the owner", async () => {
    expect(await readStatuses("@alpha/demo", digest)).toEqual([200, 200, 200, 200]);
    const res = await manage("@alpha/demo", "delete", {}, { key: ownerKey, now: NOW });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body).toEqual({ identity: "@alpha/demo", deletedAt: NOW.toISOString(), restoreDeadline: at(30).toISOString() });
    expect(await readStatuses("@alpha/demo", digest)).toEqual([404, 404, 404, 404]);
    expect(await readStatuses("@alpha/demo", digest, ownerKey)).toEqual([404, 404, 404, 404]);
    expect(await readablePackageNames(h.deps.db, ["@alpha/demo"], "user-a")).toEqual(new Set());
    expect(await readablePackageNames(h.deps.db, ["@alpha/demo"], null)).toEqual(new Set());
    expect(packageAudit(h)).toEqual([expect.objectContaining({ actor_id: "user-a", action: "delete", from_value: "live", to_value: "deleted" })]);
  });

  it("invalidates a signed download URL minted before the delete", async () => {
    setVisibility("@alpha/demo", "private");
    const redeem = await mintDownload(digest, ownerKey);
    expect(await redeem()).toBe(200);
    expect((await manage("@alpha/demo", "delete", {}, { key: ownerKey })).status).toBe(200);
    expect(await redeem()).toBe(404);
  });

  it("refuses a new version with 409 package.deleted and writes nothing", async () => {
    await manage("@alpha/demo", "delete", {}, { key: ownerKey });
    const before = h.releaseRows();
    const objects = h.r2.objects.size;
    const res = await h.upload("@alpha/demo", tarOf(skillFiles()), { version: "2.0.0" });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("package.deleted");
    expect(h.releaseRows()).toEqual(before);
    expect(h.r2.objects.size).toBe(objects);
  });

  it("answers 404 to state transitions and promotions of its releases", async () => {
    await manage("@alpha/demo", "delete", {}, { key: ownerKey });
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey }), 404, "not_found");
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { admin: ADMIN }), 404, "not_found");
    const request = new Request("https://skillx.test/api/v1/packages/@alpha/demo/releases/1.0.0/promote", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${ownerKey}` },
      body: JSON.stringify({ to: "beta" }),
    });
    const res = await promoteAction({ request, params: { scope: "@alpha", slug: "demo", version: "1.0.0" }, context: { cloudflare: { env: envOf() } } } as never);
    expect(res.status).toBe(404);
  });

  it("drops its quarantined releases from the review queue and answers 404 to a review", async () => {
    h.d1.raw.prepare("UPDATE package_releases SET release_state = 'quarantined', quarantined_at = 1").run();
    expect(await listQuarantine(h.deps.db)).toHaveLength(1);
    await manage("@alpha/demo", "delete", {}, { key: ownerKey });
    expect(await listQuarantine(h.deps.db)).toEqual([]);
    const request = new Request("https://skillx.test/api/v1/packages/@alpha/demo/releases/1.0.0/review", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Admin-Secret": ADMIN },
      body: JSON.stringify({ decision: "approve", reason: "false positive" }),
    });
    const res = await reviewAction({ request, params: { scope: "@alpha", slug: "demo", version: "1.0.0" }, context: { cloudflare: { env: envOf() } } } as never);
    expect(res.status).toBe(404);
  });

  it("answers 409 package.deleted to a second delete and refuses visibility changes", async () => {
    await manage("@alpha/demo", "delete", {}, { key: ownerKey });
    expectError(await manage("@alpha/demo", "delete", {}, { key: ownerKey }), 409, "package.deleted");
    expectError(await manage("@alpha/demo", "visibility", { from: "public", to: "private" }, { key: ownerKey }), 404, "not_found");
  });

  it("requires an empty JSON body", async () => {
    expect((await manage("@alpha/demo", "delete", { force: true }, { key: ownerKey })).status).toBe(400);
    expect((await manage("@alpha/demo", "delete", undefined, { key: ownerKey, rawBody: "" })).status).toBe(400);
    expect(visibilityOf(h, "@alpha/demo").deleted_at).toBeNull();
  });

  it("answers 404 to another account and lets the admin delete and restore", async () => {
    const otherKey = await h.createKey("user-b", null);
    expectError(await manage("@alpha/demo", "delete", {}, { key: otherKey }), 404, "not_found");
    expect((await manage("@alpha/demo", "delete", {}, { admin: ADMIN })).status).toBe(200);
    expectError(await manage("@alpha/demo", "restore", {}, { key: otherKey }), 404, "not_found");
    expect((await manage("@alpha/demo", "restore", {}, { admin: ADMIN })).status).toBe(200);
    expect(packageAudit(h).map((a) => [a.actor_kind, a.action])).toEqual([
      ["admin", "delete"],
      ["admin", "restore"],
    ]);
  });
});

describe("package restore", () => {
  it("restores within 30 days with the same visibility", async () => {
    setVisibility("@alpha/demo", "unlisted");
    await manage("@alpha/demo", "delete", {}, { key: ownerKey, now: NOW });
    const res = await manage("@alpha/demo", "restore", {}, { key: ownerKey, now: at(30) });
    expect(res).toMatchObject({ status: 200, body: { identity: "@alpha/demo", visibility: "unlisted", restoredAt: at(30).toISOString() } });
    expect(await readStatuses("@alpha/demo", digest)).toEqual([200, 200, 200, 200]);
    expect(packageAudit(h).map((a) => a.action)).toEqual(["delete", "restore"]);
  });

  it("answers 410 after the window and keeps the tombstone", async () => {
    await manage("@alpha/demo", "delete", {}, { key: ownerKey, now: NOW });
    expectError(await manage("@alpha/demo", "restore", {}, { key: ownerKey, now: new Date(at(30).getTime() + 1) }), 410, "restore_window_expired");
    expect(visibilityOf(h, "@alpha/demo").deleted_at).toBe(NOW.getTime());
    const res = await h.upload("@alpha/demo", tarOf(skillFiles()), { version: "2.0.0" });
    expect(res.body.error.code).toBe("package.deleted");
  });

  it("refuses the owner restoring an admin delete with 403 restore.admin_deleted", async () => {
    expect((await manage("@alpha/demo", "delete", {}, { admin: ADMIN, now: NOW })).status).toBe(200);
    session.user = { id: "user-a" };
    expectError(await manage("@alpha/demo", "restore", {}, { key: ownerKey, now: at(1) }), 403, "restore.admin_deleted");
    expectError(await manage("@alpha/demo", "restore", {}, { headers: { Origin: "https://skillx.test" }, now: at(1) }), 403, "restore.admin_deleted");
    expect(visibilityOf(h, "@alpha/demo").deleted_at).toBe(NOW.getTime());
    expect(packageAudit(h).map((a) => [a.actor_kind, a.action])).toEqual([["admin", "delete"]]);
    expect((await manage("@alpha/demo", "restore", {}, { admin: ADMIN, now: at(1) })).status).toBe(200);
  });

  it("lets the owner restore their own delete after an earlier admin delete was restored", async () => {
    await manage("@alpha/demo", "delete", {}, { admin: ADMIN, now: NOW });
    await manage("@alpha/demo", "restore", {}, { admin: ADMIN, now: at(1) });
    expect((await manage("@alpha/demo", "delete", {}, { key: ownerKey, now: at(2) })).status).toBe(200);
    expect((await manage("@alpha/demo", "restore", {}, { key: ownerKey, now: at(3) })).status).toBe(200);
  });

  it("answers 409 package.not_deleted to a live package", async () => {
    expectError(await manage("@alpha/demo", "restore", {}, { key: ownerKey }), 409, "package.not_deleted");
  });
});
