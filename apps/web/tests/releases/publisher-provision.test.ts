import { beforeEach, describe, expect, it, vi } from "vitest";
import { action as provisionAction, loader as provisionLoader } from "~/routes/api.v1.publishers";
import { action as keysAction } from "~/routes/api.user-api-keys";
import { releasePublishScope } from "~/lib/auth/api-key-scopes";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { tarOf } from "./release-harness";
import { ADMIN, audit, envOf, expectError, holdBatches, skillFiles, useStateHarness } from "./release-state-helpers";
import type { ChangeOptions, Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let h: Harness;
const admin = { admin: ADMIN };
const carol = { handle: "carol", ownerUserId: "user-c" };

function addUser(id: string) {
  h.d1.raw.prepare('INSERT INTO "user" (id, name, email, createdAt, updatedAt) VALUES (?, ?, ?, 1, 1)').run(id, id, `${id}@example.test`);
}

async function provision(body: unknown, o: ChangeOptions = {}) {
  const headers = new Headers({ "Content-Type": "application/json", ...o.headers });
  if (o.key !== undefined) headers.set("Authorization", `Bearer ${o.key}`);
  if (o.admin !== undefined) headers.set("X-Admin-Secret", o.admin);
  const method = o.method ?? "POST";
  const payload = method === "GET" ? undefined : (o.rawBody ?? JSON.stringify(body));
  const request = new Request("https://skillx.test/api/v1/publishers", { method, headers, body: payload });
  const args = { request, params: {}, context: { cloudflare: { env: envOf(o.env) } } } as never;
  const res = method === "GET" ? await provisionLoader(args) : await provisionAction(args);
  return { status: res.status, headers: res.headers, body: (await res.json()) as Record<string, any> };
}

const publisherRows = (handle: string) =>
  h.d1.raw.prepare("SELECT id, handle, display_name, owner_user_id, state FROM publishers WHERE handle = ?").all(handle) as Array<Record<string, unknown>>;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  addUser("user-a");
  addUser("user-c");
  addUser("user-d");
});

describe("publisher provisioning: access", () => {
  it("answers 404 to every method while the release API is off", async () => {
    const off = { env: { SKILLX_RELEASES_API: undefined } };
    expectError(await provision(carol, { ...admin, ...off }), 404, "not_found");
    expectError(await provision(carol, { ...admin, ...off, method: "GET" }), 404, "not_found");
    expect(publisherRows("carol")).toHaveLength(0);
  });

  it("answers 405 to a GET", async () => {
    const res = await provision(carol, { ...admin, method: "GET" });
    expectError(res, 405, "method_not_allowed");
    expect(res.headers.get("Allow")).toBe("POST");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("answers 401 without credentials and to a wrong admin secret", async () => {
    const anonymous = await provision(carol);
    expectError(anonymous, 401, "auth.required");
    expect(anonymous.headers.get("Cache-Control")).toBe("no-store");
    expectError(await provision(carol, { admin: "wrong" }), 401, "invalid_admin_secret");
    expect(publisherRows("carol")).toHaveLength(0);
  });

  it("refuses an account API key and a web session with 403", async () => {
    const key = await h.createKey("user-c", null);
    expectError(await provision(carol, { key }), 403, "publisher.admin_only");
    session.user = { id: "user-c" };
    expectError(await provision(carol), 403, "publisher.admin_only");
    expect(publisherRows("carol")).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });

  it("answers 429 before reading the body, and counts the client IP before the admin", async () => {
    const exhausted = { env: { RELEASE_WRITE_LIMITER: new FakeRateLimiter(0) } };
    const limited = await provision(carol, { ...admin, rawBody: "{not json", ...exhausted });
    expectError(limited, 429, "rate_limited");
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");
    expectError(await provision(carol, { ...admin, headers: { "Content-Type": "text/plain" }, ...exhausted }), 429, "rate_limited");

    const limiter = new FakeRateLimiter(10_000);
    expect((await provision(carol, { ...admin, headers: { "CF-Connecting-IP": "203.0.113.7" }, env: { RELEASE_WRITE_LIMITER: limiter } })).status).toBe(200);
    expect(limiter.counts.get("ip:203.0.113.7")).toBe(1);
    expect(limiter.counts.get("user:admin")).toBe(1);
    expect(publisherRows("carol")).toHaveLength(1);
  });
});

describe("publisher provisioning: body", () => {
  it("rejects unknown fields, bad handles, bad owners and bad verification with 400", async () => {
    expectError(await provision({ ...carol, displayName: "Carol" }, admin), 400, "invalid_request");
    for (const handle of ["@carol", "Carol", "-carol", "", "a".repeat(65), 7]) {
      expectError(await provision({ ...carol, handle }, admin), 400, "invalid_request");
    }
    for (const ownerUserId of ["", "user c", 42, null]) {
      expectError(await provision({ ...carol, ownerUserId }, admin), 400, "invalid_request");
    }
    expectError(await provision({ ...carol, verifiedBy: "github" }, admin), 400, "invalid_request");
    expectError(await provision({ ...carol, reason: "line\nbreak" }, admin), 400, "invalid_request");
    expectError(await provision([carol], admin), 400, "invalid_request");
    expectError(await provision(carol, { ...admin, headers: { "Content-Type": "text/plain" } }), 415, "unsupported_media_type");
    expect(publisherRows("carol")).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });

  it("answers 404 user.not_found for an unknown owner", async () => {
    expectError(await provision({ ...carol, ownerUserId: "user-missing" }, admin), 404, "user.not_found");
    expect(publisherRows("carol")).toHaveLength(0);
    expect(audit()).toHaveLength(0);
  });
});

describe("publisher provisioning: creation", () => {
  it("creates an active publisher owned by the user and audits the creation", async () => {
    const res = await provision({ ...carol, verifiedBy: "admin", reason: "smoke publisher" }, admin);
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body).toEqual({ handle: "carol", ownerUserId: "user-c", verifiedBy: "admin", state: "active", created: true });
    expect(publisherRows("carol")).toEqual([{ id: expect.stringMatching(/^pub_/), handle: "carol", display_name: "carol", owner_user_id: "user-c", state: "active" }]);
    expect(audit()).toEqual([
      { subject_kind: "publisher", actor_kind: "admin", actor_id: "admin", from_state: "none", to_state: "active", outcome: "applied", reason: "smoke publisher" },
    ]);
  });

  it("treats an identical replay as created:false and writes nothing", async () => {
    expect((await provision(carol, admin)).body.created).toBe(true);
    const replay = await provision(carol, admin);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual({ handle: "carol", ownerUserId: "user-c", verifiedBy: "admin", state: "active", created: false });
    expect(publisherRows("carol")).toHaveLength(1);
    expect(audit()).toHaveLength(1);
  });

  it("reports the stored state on a replay of a suspended publisher", async () => {
    const res = await provision({ handle: "gone", ownerUserId: "user-a" }, admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ handle: "gone", state: "suspended", created: false });
  });

  it("answers 409 publisher.conflict for the same handle with another owner", async () => {
    expect((await provision(carol, admin)).status).toBe(200);
    expectError(await provision({ ...carol, ownerUserId: "user-d" }, admin), 409, "publisher.conflict");
    expectError(await provision({ handle: "alpha", ownerUserId: "user-c" }, admin), 409, "publisher.conflict");
    expect(publisherRows("carol")).toEqual([expect.objectContaining({ owner_user_id: "user-c" })]);
    expect(audit()).toHaveLength(1);
  });

  it("creates exactly one publisher and one audit row under concurrent identical requests", async () => {
    holdBatches(2);
    const results = await Promise.all([provision(carol, admin), provision(carol, admin)]);
    expect(results.map((r) => r.status)).toEqual([200, 200]);
    expect(results.map((r) => r.body.created).sort()).toEqual([false, true]);
    expect(publisherRows("carol")).toHaveLength(1);
    expect(audit()).toHaveLength(1);
  });

  it("lets exactly one owner win concurrent requests for one handle", async () => {
    holdBatches(2);
    const [first, second] = await Promise.all([provision(carol, admin), provision({ ...carol, ownerUserId: "user-d" }, admin)]);
    expect([first.status, second.status].sort()).toEqual([200, 409]);
    const winner = first.status === 200 ? "user-c" : "user-d";
    expect(publisherRows("carol")).toEqual([expect.objectContaining({ owner_user_id: winner })]);
    expect(audit()).toHaveLength(1);
  });
});

describe("publisher provisioning: end to end", () => {
  it("lets the owner create a scoped key and publish a release", async () => {
    expect((await provision(carol, admin)).status).toBe(200);

    session.user = { id: "user-c" };
    const keyRequest = new Request("https://skillx.test/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ci", scopes: [releasePublishScope("carol")] }),
    });
    const keyRes = await keysAction({ request: keyRequest, params: {}, context: { cloudflare: { env: envOf() } } } as never);
    expect(keyRes.status).toBe(200);
    const { key } = (await keyRes.json()) as { key: string };

    const published = await h.upload("@carol/demo", tarOf(skillFiles()), { key, version: "1.0.0" });
    expect(published.status).toBe(200);
    expect(published.body.releaseDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it("refuses a scoped key for a handle the user was never provisioned for", async () => {
    session.user = { id: "user-c" };
    const keyRequest = new Request("https://skillx.test/api/user/api-keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "ci", scopes: [releasePublishScope("carol")] }),
    });
    const keyRes = await keysAction({ request: keyRequest, params: {}, context: { cloudflare: { env: envOf() } } } as never);
    expect(keyRes.status).toBe(403);
  });
});
