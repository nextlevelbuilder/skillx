import { beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN, audit, change, expectError, publish, useStateHarness } from "./release-state-helpers";

/**
 * A state change in a web session (no `Authorization`, no `X-Admin-Secret`) rides
 * the ambient cookie, so it must come from this origin; a key or the admin secret
 * is never ambient and is not checked.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let ownerKey: string;

beforeEach(async () => {
  const h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
});

describe("release state: same-origin web sessions", () => {
  it("refuses a cross-origin web-session request before the session or limiter decides", async () => {
    await publish();
    session.user = { id: "user-a" };
    const yank = { from: "published", to: "yanked" };
    for (const headers of [{ Origin: "https://evil.example" }, { Origin: "https://sub.skillx.test" }, { "Sec-Fetch-Site": "cross-site" }]) {
      expectError(await change("@alpha/demo", "1.0.0", yank, { headers }), 403, "cross_origin");
    }
    expect(audit()).toEqual([]);
    // An API key or the admin secret is not ambient, so a foreign Origin does not matter there.
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, headers: { Origin: "https://evil.example" } })).status).toBe(200);
    expect((await change("@alpha/demo", "1.0.0", { from: "yanked", to: "quarantined" }, { admin: ADMIN, headers: { Origin: "https://evil.example" } })).status).toBe(200);
  });

  it("accepts a same-origin web-session request", async () => {
    await publish();
    session.user = { id: "user-a" };
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { headers: { Origin: "https://skillx.test" } })).status).toBe(200);
  });
});
