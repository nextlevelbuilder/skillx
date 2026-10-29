import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

/**
 * A kit write in a web session (no `Authorization`) rides the ambient cookie,
 * so it must come from this origin; an API key is never ambient and is not checked.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let k: KitHarness;
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")), "notes.md": "my notes\n" };

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", { "SKILL.md": skillText(BODY) });
});

describe("personal kits: same-origin web sessions", () => {
  it("refuses a cross-origin web-session write, then accepts the same write from this origin", async () => {
    session.user = { id: "user-a" };
    const write = async (headers: Record<string, string>) =>
      k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) }, { key: null, headers });
    for (const headers of [{ Origin: "https://evil.example" }, { "Sec-Fetch-Site": "same-site" }]) {
      const refused = await write(headers);
      expect(refused.status).toBe(403);
      expect(refused.body.error.code).toBe("cross_origin");
    }
    // Nothing was written: generation 0 is still the current one.
    expect((await write({ Origin: "https://skillx.test" })).status).toBe(201);
  });

  it("refuses a cross-origin web-session write on every write sub-route", async () => {
    session.user = { id: "user-a" };
    for (const sub of ["proposals", "proposals/validate", "preview-update", "activate", "rollback", "rebase", "conflicts/c-1/resolve", "revisions/rev-1/reject", "revisions/rev-1/review", "revisions/rev-1/quarantine"]) {
      const refused = await k.call(sub, {}, { key: null, headers: { Origin: "https://evil.example" } });
      expect(refused.status, sub).toBe(403);
      expect(refused.body.error.code, sub).toBe("cross_origin");
    }
  });

  it("accepts a header-less web-session write", async () => {
    session.user = { id: "user-a" };
    const body = { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) };
    expect((await k.call("revisions", body, { key: null })).status).toBe(201);
  });

  it("does not check the origin of an API-key write", async () => {
    const body = { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) };
    expect((await k.call("revisions", body, { headers: { Origin: "https://evil.example" } })).status).toBe(201);
  });
});
