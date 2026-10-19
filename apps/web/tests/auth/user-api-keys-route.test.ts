import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Settings key API: a key may only hold scopes its owner holds (active
 * publishers they own), unknown scopes are refused, and the default is an
 * account key that can never publish releases.
 */
const session = vi.hoisted(() => ({ userId: "user-a" as string | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.userId ? { user: { id: session.userId } } : null),
}));

import { action, loader } from "~/routes/api.user-api-keys";
import { FakeD1 } from "../releases/fake-d1";

let d1: FakeD1;

beforeEach(() => {
  session.userId = "user-a";
  d1 = new FakeD1();
  d1.raw.exec(`
    INSERT INTO publishers (id, handle, display_name, owner_user_id, created_at, state) VALUES
      ('pub-alpha', 'alpha', 'Alpha', 'user-a', 1, 'active'),
      ('pub-alpha2', 'alpha2', 'Alpha Two', 'user-a', 1, 'active'),
      ('pub-beta', 'beta', 'Beta', 'user-b', 1, 'active'),
      ('pub-gone', 'gone', 'Suspended', 'user-a', 1, 'suspended');
  `);
});

const context = () => ({ cloudflare: { env: { DB: d1.asD1() } } });

async function call(method: string, body: unknown) {
  const request = new Request("https://skillx.test/api/user/api-keys", {
    method,
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
  const res = (await action({ request, params: {}, context: context() } as never)) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function list() {
  const request = new Request("https://skillx.test/api/user/api-keys");
  const res = (await loader({ request, params: {}, context: context() } as never)) as Response;
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

const storedScopes = () =>
  (d1.raw.prepare("SELECT scopes FROM api_keys ORDER BY created_at").all() as Array<{ scopes: string | null }>).map((r) => r.scopes);

describe("POST /api/user/api-keys", () => {
  it("creates an unscoped account key by default and returns the plaintext once", async () => {
    const res = await call("POST", { name: "CLI" });
    expect(res.status).toBe(200);
    expect(res.body.key).toMatch(/^sx_/);
    expect(res.body.scopes).toBeNull();
    expect(storedScopes()).toEqual([null]);

    const listed = await list();
    expect(listed.body.keys).toHaveLength(1);
    expect(listed.body.keys[0]).toMatchObject({ name: "CLI", scopes: null });
    expect(JSON.stringify(listed.body)).not.toContain(res.body.key);
  });

  it("creates a key scoped to owned active publishers, sorted and de-duplicated", async () => {
    const res = await call("POST", {
      name: "CI",
      scopes: ["releases:publish:@alpha2", "releases:publish:@alpha", "releases:publish:@alpha"],
    });
    expect(res.status).toBe(200);
    expect(res.body.scopes).toEqual(["releases:publish:@alpha", "releases:publish:@alpha2"]);
    expect(storedScopes()).toEqual([JSON.stringify(["releases:publish:@alpha", "releases:publish:@alpha2"])]);
    expect((await list()).body.keys[0].scopes).toEqual(["releases:publish:@alpha", "releases:publish:@alpha2"]);
  });

  it.each([
    ["an unknown scope", ["admin:*"]],
    ["a malformed handle", ["releases:publish:@Alpha"]],
    ["an empty list", []],
    ["a non-array", "releases:publish:@alpha"],
    ["more than 8 scopes", Array.from({ length: 9 }, (_, i) => `releases:publish:@p${i}`)],
  ])("rejects %s with 400 and stores nothing", async (_label, scopes) => {
    const res = await call("POST", { name: "CI", scopes });
    expect(res.status).toBe(400);
    expect(storedScopes()).toEqual([]);
  });

  it.each([
    ["another user's publisher", "beta"],
    ["a suspended publisher", "gone"],
    ["a publisher that does not exist", "nobody"],
  ])("refuses %s with 403 and stores nothing", async (_label, handle) => {
    const res = await call("POST", { name: "CI", scopes: ["releases:publish:@alpha", `releases:publish:@${handle}`] });
    expect(res.status).toBe(403);
    expect(res.body.error).toContain(`@${handle}`);
    expect(storedScopes()).toEqual([]);
  });

  it("rejects a body that is not a JSON object", async () => {
    expect((await call("POST", "not json")).status).toBe(400);
    expect((await call("POST", "[]")).status).toBe(400);
  });

  it("requires a session", async () => {
    session.userId = null;
    expect((await call("POST", { name: "CLI" })).status).toBe(401);
    expect((await list()).status).toBe(401);
  });
});

describe("DELETE /api/user/api-keys", () => {
  it("revokes only the caller's own key", async () => {
    await call("POST", { name: "CI", scopes: ["releases:publish:@alpha"] });
    const [{ id }] = (await list()).body.keys as Array<{ id: string }>;

    session.userId = "user-b";
    expect((await call("DELETE", { id })).status).toBe(404);

    session.userId = "user-a";
    expect((await call("DELETE", { id })).status).toBe(200);
    expect((await list()).body.keys).toEqual([]);
    expect((await call("DELETE", { id })).status).toBe(404);
  });

  it("answers a malformed or non-object JSON body with 400, not 500", async () => {
    expect((await call("DELETE", "{not json")).status).toBe(400);
    expect((await call("DELETE", "[]")).status).toBe(400);
    expect((await call("DELETE", "null")).status).toBe(400);
  });
});

describe("scopes: null", () => {
  it("is treated as an omitted field and creates an account key", async () => {
    const res = await call("POST", { name: "CLI", scopes: null });
    expect(res.status).toBe(200);
    expect(res.body.scopes).toBeNull();
    expect(storedScopes()).toEqual([null]);
  });
});

describe("same-origin check on mutating requests", () => {
  const send = async (method: string, headers: Record<string, string>, body: unknown) => {
    const request = new Request("https://skillx.test/api/user/api-keys", {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return (await action({ request, params: {}, context: context() } as never)) as Response;
  };

  it("refuses a foreign or sibling-subdomain Origin before touching the database", async () => {
    for (const origin of ["https://evil.example", "https://sub.skillx.test", "http://skillx.test"]) {
      expect((await send("POST", { Origin: origin }, { name: "x" })).status).toBe(403);
      expect((await send("DELETE", { Origin: origin }, { id: "k" })).status).toBe(403);
    }
    expect(storedScopes()).toEqual([]);
  });

  it("refuses a cross-site request that sends only Sec-Fetch-Site", async () => {
    expect((await send("POST", { "Sec-Fetch-Site": "same-site" }, { name: "x" })).status).toBe(403);
    expect((await send("POST", { "Sec-Fetch-Site": "cross-site" }, { name: "x" })).status).toBe(403);
  });

  it("accepts a same-origin browser request and a header-less non-browser client", async () => {
    expect((await send("POST", { Origin: "https://skillx.test" }, { name: "a" })).status).toBe(200);
    expect((await send("POST", { "Sec-Fetch-Site": "same-origin" }, { name: "b" })).status).toBe(200);
    expect((await send("POST", {}, { name: "c" })).status).toBe(200);
  });
});
