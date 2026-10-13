import { beforeEach, describe, expect, it } from "vitest";
import { getDb } from "~/lib/db";
import { authenticateApiKey } from "~/lib/auth/authenticate-api-key";
import { verifyApiKey } from "~/lib/auth/api-key-utils";
import { action as usageReport } from "~/routes/api.usage-report";
import { action as skillInstall } from "~/routes/api.skill-install";
import { createHarness } from "./release-harness";

/**
 * A scoped release key must never act as a full-account key: not on the
 * legacy routes, and not on code that predates scopes (a rollback), because
 * it is stored under a domain-separated hash.
 */
type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;
let scoped: string;
let legacy: string;

beforeEach(async () => {
  h = await createHarness();
  scoped = await h.createKey("user-a", ["releases:publish:@alpha"]);
  legacy = await h.createKey("user-a", null);
});

const keyRow = (plaintext: string) =>
  h.d1.raw.prepare("SELECT key_hash FROM api_keys WHERE key_prefix = ?").all(plaintext.slice(0, 8)) as Array<{ key_hash: string }>;

const routeContext = () => ({ cloudflare: { env: { DB: h.deps.db } } });

function post(url: string, key: string, body: unknown): Request {
  return new Request(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("scoped key isolation", () => {
  it("authenticates an unscoped key but not a scoped or revoked one", async () => {
    const db = getDb(h.deps.db);
    expect(await authenticateApiKey(db, legacy)).toMatchObject({ userId: "user-a" });
    expect(await authenticateApiKey(db, scoped)).toBeNull();
    const revoked = await h.createKey("user-a", null, true);
    expect(await authenticateApiKey(db, revoked)).toBeNull();
    expect(await authenticateApiKey(db, "")).toBeNull();
  });

  it("stays rejected by pre-scope code that verifies the plain key hash (rollback safety)", async () => {
    // Pre-scope routes load rows by key prefix, then compare the plain SHA-256.
    const verifies = async (plaintext: string) =>
      (await Promise.all(keyRow(plaintext).map((row) => verifyApiKey(plaintext, row.key_hash)))).some(Boolean);
    expect(keyRow(scoped).length).toBeGreaterThan(0);
    expect(await verifies(scoped)).toBe(false);
    expect(await verifies(legacy)).toBe(true);
  });

  it("is rejected by the usage report route (401)", async () => {
    const res = await usageReport({
      request: post("https://skillx.test/api/report", scoped, { skill_slug: "x", outcome: "success" }),
      params: {},
      context: routeContext(),
    } as never);
    expect(res.status).toBe(401);
  });

  it("gives no identity on the skill install route", async () => {
    const res = await skillInstall({
      request: post("https://skillx.test/api/skills/x/install", scoped, {}),
      params: { slug: "x" },
      context: routeContext(),
    } as never);
    // Without a recognised key or a device id the route refuses to count the install.
    expect(res.status).toBe(400);
  });
});
