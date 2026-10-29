import { beforeEach, describe, expect, it, vi } from "vitest";
import { kitsWriteScope } from "~/lib/auth/api-key-scopes";
import { serveKitAction } from "~/lib/creator/owner-actions-http";
import { callTool } from "~/lib/mcp/tools";
import { loader as libraryLoader } from "~/routes/api.v1.library";
import { FakeRateLimiter } from "../releases/fake-rate-limiter";
import { BODY, NOW, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";

/**
 * Kit soft delete: a deleted kit is invisible to the kit API, the library and
 * MCP `get_kit`, its name cannot be reused, and the owner (or the admin) can
 * restore it for 30 days.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const ADMIN = "test-admin-secret-0123456789";
const DAY = 24 * 60 * 60 * 1000;
let k: KitHarness;

const env = () => ({
  SKILLX_RELEASES_API: "1",
  SKILLX_PERSONAL_KITS_API: "1",
  DB: k.h.deps.db,
  R2: k.h.deps.bucket,
  ADMIN_SECRET: ADMIN,
  RELEASE_READ_LIMITER: new FakeRateLimiter(10_000),
  RELEASE_WRITE_LIMITER: new FakeRateLimiter(10_000),
});

beforeEach(async () => {
  k = await createKitHarness();
  session.user = null;
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
  const document = k.doc([await k.entry("@alpha/demo", "1.0.0")]);
  expect((await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document })).status).toBe(201);
});

const kitAudit = () => k.h.d1.raw.prepare("SELECT subject_kind, subject_name, actor_kind, action FROM package_audit ORDER BY created_at, rowid").all();

async function libraryKits(key: string): Promise<string[]> {
  const request = new Request("https://skillx.test/api/v1/library", { headers: { Authorization: `Bearer ${key}` } });
  const res = await libraryLoader({ request, params: {}, context: { cloudflare: { env: env() } } } as never);
  const body = (await res.json()) as { items: Array<{ kind: string; identity: string }> };
  return body.items.filter((i) => i.kind === "kit").map((i) => i.identity);
}

const getKit = async (userId: string | null) => {
  const result = await callTool("get_kit", { kit: "@alpha/my-kit" }, { env: env() as unknown as Env, userId });
  return JSON.parse(result.content[0].text) as { found: boolean };
};

async function kitAction(action: "delete" | "restore", now: Date) {
  const request = new Request(`https://skillx.test/api/v1/kits/@alpha/my-kit/${action}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${k.ownerKey}` },
    body: "{}",
  });
  const res = await serveKitAction(request, env() as never, { scope: "@alpha", name: "my-kit" }, action, () => now);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

describe("kit deletion", () => {
  it("hides the kit from the kit API, the library and MCP get_kit", async () => {
    expect(await libraryKits(k.ownerKey)).toEqual(["@alpha/my-kit"]);
    expect((await getKit("user-a")).found).toBe(true);
    const res = await k.call("delete", {});
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body).toMatchObject({ kit: "@alpha/my-kit", deletedAt: expect.any(String), restoreDeadline: expect.any(String) });
    expect((await k.call("")).status).toBe(404);
    expect((await k.call("revisions")).status).toBe(404);
    expect(await libraryKits(k.ownerKey)).toEqual([]);
    expect((await getKit("user-a")).found).toBe(false);
    expect(kitAudit()).toEqual([{ subject_kind: "kit", subject_name: "@alpha/my-kit", actor_kind: "user", action: "delete" }]);
  });

  it("answers 409 kit.deleted to a new revision under the deleted name", async () => {
    await k.call("delete", {});
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0")]);
    for (const expectedGeneration of [0, 1, 2]) {
      const res = await k.call("revisions", { expectedGeneration, idempotencyKey: k.idem(), document });
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("kit.deleted");
    }
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("refuses scoped keys and other accounts, and lets the admin delete and restore", async () => {
    const scoped = await k.h.createKey("user-a", [kitsWriteScope("alpha")]);
    expect((await k.call("delete", {}, { key: scoped })).status).toBe(401);
    expect((await k.call("delete", {}, { key: k.otherKey })).status).toBe(404);
    expect((await k.call("delete", {}, { key: null, headers: { "X-Admin-Secret": ADMIN } })).status).toBe(200);
    expect((await k.call("restore", {}, { key: k.otherKey })).status).toBe(404);
    expect((await k.call("restore", {}, { key: null, headers: { "X-Admin-Secret": ADMIN } })).status).toBe(200);
    expect(kitAudit().map((a: any) => [a.actor_kind, a.action])).toEqual([
      ["admin", "delete"],
      ["admin", "restore"],
    ]);
  });

  it("refuses a cross-origin web session and accepts a same-origin one", async () => {
    session.user = { id: "user-a" };
    const res = await k.call("delete", {}, { key: null, headers: { Origin: "https://evil.example" } });
    expect(res).toMatchObject({ status: 403, body: { error: { code: "cross_origin" } } });
    expect(kitAudit()).toEqual([]);
    expect((await k.call("delete", {}, { key: null, headers: { Origin: "https://skillx.test" } })).status).toBe(200);
  });

  it("is unavailable while either flag is off", async () => {
    expect((await k.call("delete", {}, { env: { SKILLX_PERSONAL_KITS_API: undefined } })).status).toBe(404);
    expect((await k.call("delete", {}, { env: { SKILLX_RELEASES_API: undefined } })).status).toBe(404);
    expect(kitAudit()).toEqual([]);
  });
});

describe("kit restore", () => {
  it("restores within 30 days, bumps the generation and serves the kit again", async () => {
    const before = (await k.call("")).body;
    expect((await kitAction("delete", NOW)).status).toBe(200);
    const res = await kitAction("restore", new Date(NOW.getTime() + 30 * DAY));
    expect(res).toMatchObject({ status: 200, body: { kit: "@alpha/my-kit", generation: Number(before.generation) + 2 } });
    expect((await k.call("")).status).toBe(200);
    expect(await libraryKits(k.ownerKey)).toEqual(["@alpha/my-kit"]);
  });

  it("answers 410 after the window and keeps the tombstone", async () => {
    await kitAction("delete", NOW);
    const res = await kitAction("restore", new Date(NOW.getTime() + 30 * DAY + 1));
    expect(res).toMatchObject({ status: 410, body: { error: { code: "restore_window_expired" } } });
    expect((await k.call("")).status).toBe(404);
  });

  it("refuses the owner restoring an admin delete with 403 restore.admin_deleted", async () => {
    const admin = { key: null, headers: { "X-Admin-Secret": ADMIN } };
    expect((await k.call("delete", {}, admin)).status).toBe(200);
    expect(await kitAction("restore", NOW)).toMatchObject({ status: 403, body: { error: { code: "restore.admin_deleted" } } });
    expect((await k.call("")).status).toBe(404);
    expect(kitAudit().map((a: any) => [a.actor_kind, a.action])).toEqual([["admin", "delete"]]);
    expect((await k.call("restore", {}, admin)).status).toBe(200);
    expect((await k.call("")).status).toBe(200);
  });

  it("answers 409 kit.not_deleted to a live kit and kit.deleted to a second delete", async () => {
    expect((await k.call("restore", {})).body.error.code).toBe("kit.not_deleted");
    await k.call("delete", {});
    expect((await k.call("delete", {})).body.error.code).toBe("kit.deleted");
  });
});
