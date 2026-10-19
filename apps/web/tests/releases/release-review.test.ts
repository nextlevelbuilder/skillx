import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { action as reviewAction } from "~/routes/api.v1.release-review";
import { loader as queueLoader } from "~/routes/api.v1.admin-quarantine";
import { ADMIN, audit, change, envOf, expectError, holdBatches, publish, sql, stateOf, useStateHarness } from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let h: Harness;
let ownerKey: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
});

afterEach(() => {
  vi.useRealTimers();
});

const admin = { admin: ADMIN };

async function review(body: unknown, auth: { key?: string; admin?: string } = admin) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (auth.key !== undefined) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.admin !== undefined) headers.set("X-Admin-Secret", auth.admin);
  const request = new Request("https://skillx.test/api/v1/packages/@alpha/demo/releases/1.0.0/review", { method: "POST", headers, body: JSON.stringify(body) });
  const res = await reviewAction({ request, params: { scope: "@alpha", slug: "demo", version: "1.0.0" }, context: { cloudflare: { env: envOf() } } } as never);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function queue(auth: { key?: string; admin?: string } = admin) {
  const headers = new Headers();
  if (auth.key !== undefined) headers.set("Authorization", `Bearer ${auth.key}`);
  if (auth.admin !== undefined) headers.set("X-Admin-Secret", auth.admin);
  const res = await queueLoader({ request: new Request("https://skillx.test/api/v1/admin/quarantine", { headers }), params: {}, context: { cloudflare: { env: envOf() } } } as never);
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function quarantine() {
  await publish();
  expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "quarantined", reason: "report" }, admin)).status).toBe(200);
}

const reviews = () => h.d1.raw.prepare("SELECT decision, actor_kind, reason FROM release_reviews ORDER BY rowid").all();

describe("quarantine review", () => {
  it("lists the queue and records a reject without changing the release", async () => {
    await quarantine();
    const listed = await queue();
    expect(listed.status).toBe(200);
    expect(listed.body.releases).toMatchObject([{ identity: "@alpha/demo", version: "1.0.0", lastReview: null }]);
    const res = await review({ decision: "reject", reason: "confirmed malicious" });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ decision: "reject", state: "quarantined" });
    expect(stateOf("1.0.0")).toBe("quarantined");
    expect(reviews()).toEqual([{ decision: "rejected", actor_kind: "admin", reason: "confirmed malicious" }]);
    expect((await queue()).body.releases[0].lastReview).toMatchObject({ decision: "rejected", reason: "confirmed malicious" });
  });

  it("approves by publishing again, with both edges audited and one review row", async () => {
    await quarantine();
    const res = await review({ decision: "approve", reason: "false positive" });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("published");
    expect(stateOf("1.0.0")).toBe("published");
    expect(audit().slice(-2).map((r) => [r.from_state, r.to_state, r.outcome])).toEqual([
      ["quarantined", "yanked", "applied"],
      ["yanked", "published", "applied"],
    ]);
    expect(reviews()).toEqual([{ decision: "approved", actor_kind: "admin", reason: "false positive" }]);
    expect((await queue()).body.releases).toEqual([]);
  });

  it("restores a yanked release to yanked unless the admin asks to publish it", async () => {
    await publish();
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked", reason: "owner yank" }, admin)).status).toBe(200);
    expect((await change("@alpha/demo", "1.0.0", { from: "yanked", to: "quarantined", reason: "report" }, admin)).status).toBe(200);
    const res = await review({ decision: "approve", reason: "false positive" });
    expect(res.status).toBe(200);
    expect(res.body.state).toBe("yanked");
    expect(stateOf("1.0.0")).toBe("yanked");
    expect(audit().at(-1)).toMatchObject({ from_state: "quarantined", to_state: "yanked", outcome: "applied" });
    expect(reviews()).toHaveLength(1);

    expect((await change("@alpha/demo", "1.0.0", { from: "yanked", to: "quarantined", reason: "again" }, admin)).status).toBe(200);
    expectError(await review({ decision: "approve", restoreTo: "draft" }), 400, "invalid_request");
    expectError(await review({ decision: "reject", restoreTo: "published" }), 400, "invalid_request");
    const published = await review({ decision: "approve", restoreTo: "published" });
    expect(published.body.state).toBe("published");
    expect(stateOf("1.0.0")).toBe("published");
  });

  it("keeps a yank when the yank and the quarantine land in the same millisecond", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-19T12:00:00Z"));
    await publish();
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked", reason: "owner yank" }, admin)).status).toBe(200);
    expect((await change("@alpha/demo", "1.0.0", { from: "yanked", to: "quarantined", reason: "report" }, admin)).status).toBe(200);
    const res = await review({ decision: "approve" });
    expect(res.body.state).toBe("yanked");
    expect(stateOf("1.0.0")).toBe("yanked");
  });

  it("refuses an approval when the release was quarantined again after it was read", async () => {
    await quarantine();
    holdBatches(1, () => sql("UPDATE package_releases SET quarantined_at = quarantined_at + 1"));
    expectError(await review({ decision: "approve" }), 409, "state_conflict");
    expect(stateOf("1.0.0")).toBe("quarantined");
    expect(reviews()).toEqual([]);
  });

  it("answers 409 for a release that is not quarantined and writes no review", async () => {
    await publish();
    expectError(await review({ decision: "approve" }), 409, "state_conflict");
    expectError(await review({ decision: "reject" }), 409, "state_conflict");
    expect(reviews()).toEqual([]);
  });

  it("is admin only and validates the decision", async () => {
    await quarantine();
    expectError(await review({ decision: "approve" }, { key: ownerKey }), 403, "review.admin_only");
    expectError(await queue({ key: ownerKey }), 403, "review.admin_only");
    expect((await review({ decision: "approve" }, {})).status).toBe(401);
    expectError(await review({ decision: "maybe" }), 400, "invalid_request");
    expect(stateOf("1.0.0")).toBe("quarantined");
  });

  it("keeps review rows append-only", async () => {
    await quarantine();
    await review({ decision: "reject" });
    expect(() => sql("UPDATE release_reviews SET decision = 'approved'")).toThrow(/append-only/);
    expect(() => sql("DELETE FROM release_reviews")).toThrow(/append-only/);
  });
});
