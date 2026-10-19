import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { file, tarOf } from "./release-harness";
import {
  ADMIN,
  audit,
  change,
  changePublisher,
  expectError,
  holdBatches,
  immutableSnapshot,
  publish,
  read,
  skillFiles,
  sql,
  stateOf,
  useStateHarness,
} from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

/** The web session is the only part of authentication that is faked; API keys run the real lookup. */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let h: Harness;
let ownerKey: string;
let otherKey: string;

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  otherKey = await h.createKey("user-b", null);
});

describe("release state: owner and admin transitions", () => {
  it("lets the owner yank with an account key, audits it, and never touches bytes or digests", async () => {
    const digest = await publish();
    const before = immutableSnapshot();
    const res = await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked", reason: "broken install script" }, { key: ownerKey });
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.body).toEqual({
      identity: "@alpha/demo",
      version: "1.0.0",
      releaseDigest: digest,
      from: "published",
      to: "yanked",
      state: "yanked",
      changedAt: expect.any(String),
    });
    expect(stateOf("1.0.0")).toBe("yanked");
    expect(immutableSnapshot()).toEqual(before);
    expect(audit()).toEqual([
      { subject_kind: "release", actor_kind: "user", actor_id: "user-a", from_state: "published", to_state: "yanked", outcome: "applied", reason: "broken install script" },
    ]);
    // The read API applies the new state; the same version can never get another tree.
    expect((await read(manifestLoader, "/x", { scope: "@alpha", slug: "demo", version: "1.0.0" })).status).toBe(410);
    const byDigest = await read(manifestLoader, "/x", { digest });
    expect(byDigest.headers.get("X-SkillX-Release-State")).toBe("yanked");
    expect((await h.upload("@alpha/demo", tarOf([...skillFiles(), file("extra.md", "new\n")]), { version: "1.0.0" })).body.error.code).toBe("release.version_exists");
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { version: "1.0.0" })).body).toMatchObject({ created: false, state: "yanked", releaseDigest: digest });
  });

  it("lets the owner yank through the web session", async () => {
    await publish();
    session.user = { id: "user-a" };
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" })).status).toBe(200);
    expect(audit()[0]).toMatchObject({ actor_kind: "user", actor_id: "user-a", reason: null, outcome: "applied" });
  });

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

  it("lets an admin quarantine and lift the quarantine in two steps, bytes unchanged throughout", async () => {
    const digest = await publish();
    const before = immutableSnapshot();
    const admin = { admin: ADMIN };
    expect((await change("@alpha/demo", "1.0.0", { from: "published", to: "quarantined", reason: "malware report" }, admin)).status).toBe(200);
    expect((await read(artifactLoader, "/x", { digest })).status).toBe(403);
    expect((await change("@alpha/demo", "1.0.0", { from: "quarantined", to: "yanked", reason: "report rejected" }, admin)).status).toBe(200);
    expect((await change("@alpha/demo", "1.0.0", { from: "yanked", to: "published" }, admin)).status).toBe(200);
    const res = await read(artifactLoader, "/x", { digest });
    expect(res.status).toBe(200);
    expect(res.headers.get("X-SkillX-Release-State")).toBe("published");
    expect(immutableSnapshot()).toEqual(before);
    expect(audit().map((row) => [row.actor_kind, row.from_state, row.to_state, row.outcome])).toEqual([
      ["admin", "published", "quarantined", "applied"],
      ["admin", "quarantined", "yanked", "applied"],
      ["admin", "yanked", "published", "applied"],
    ]);
    const times = h.d1.raw.prepare("SELECT published_at, yanked_at, quarantined_at, created_at FROM package_releases").get() as Record<string, number>;
    // published_at keeps the first publication; the other timestamps record the last entry.
    expect(times.published_at).toBe(times.created_at);
    expect(times.yanked_at).not.toBeNull();
    expect(times.quarantined_at).not.toBeNull();
  });

  it("publishes a draft that has a signed manifest, and refuses one without", async () => {
    await publish();
    sql("UPDATE package_releases SET release_state = 'draft', published_at = NULL");
    expect((await change("@alpha/demo", "1.0.0", { from: "draft", to: "published" }, { key: ownerKey })).status).toBe(200);
    expect(stateOf("1.0.0")).toBe("published");

    sql("UPDATE package_releases SET release_state = 'draft', signed_manifest_key = NULL");
    expectError(await change("@alpha/demo", "1.0.0", { from: "draft", to: "published" }, { key: ownerKey }), 422, "release.incomplete");
    expect(stateOf("1.0.0")).toBe("draft");
    expect(audit().at(-1)).toMatchObject({ outcome: "invalid" });
  });
});

describe("release state: negative cases", () => {
  it("answers 403 to a non-owner yank, audits the denial and changes nothing", async () => {
    await publish();
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: otherKey }), 403, "transition.not_owner");
    expect(stateOf("1.0.0")).toBe("published");
    expect(audit()).toEqual([expect.objectContaining({ actor_id: "user-b", outcome: "denied", to_state: "yanked" })]);
  });

  it("answers a non-owner of a private package exactly like an unknown release", async () => {
    await publish();
    sql("UPDATE packages SET visibility = 'private'");
    const unknown = await change("@alpha/nope", "1.0.0", { from: "published", to: "yanked" }, { key: otherKey });
    const res = await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: otherKey });
    expect(res).toEqual(expect.objectContaining({ status: 404, body: unknown.body }));
    expect(stateOf("1.0.0")).toBe("published");
  });

  it.each([
    ["un-quarantine", "quarantined", "yanked"],
    ["quarantine", "published", "quarantined"],
    ["un-yank", "yanked", "published"],
  ])("answers 403 transition.admin_only when the publisher tries to %s", async (_label, from, to) => {
    await publish();
    sql("UPDATE package_releases SET release_state = ?", from);
    expectError(await change("@alpha/demo", "1.0.0", { from, to }, { key: ownerKey }), 403, "transition.admin_only");
    expect(stateOf("1.0.0")).toBe(from);
    expect(audit()).toEqual([expect.objectContaining({ actor_kind: "user", from_state: from, to_state: to, outcome: "denied" })]);
  });

  it("answers 404 for an unknown release or package and audits nothing", async () => {
    await publish();
    expectError(await change("@alpha/demo", "9.9.9", { from: "published", to: "yanked" }, { key: ownerKey }), 404, "not_found");
    expectError(await change("@alpha/none", "1.0.0", { from: "published", to: "yanked" }, { admin: ADMIN }), 404, "not_found");
    expectError(await changePublisher("@nobody", { from: "active", to: "suspended" }, { admin: ADMIN }), 404, "not_found");
    expect(audit()).toEqual([]);
  });

  it("answers 409 to a replay with a stale state and audits the failed compare-and-set", async () => {
    await publish();
    const yank = { from: "published", to: "yanked" };
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey })).status).toBe(200);
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey }), 409, "state_conflict");
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "quarantined" }, { admin: ADMIN }), 409, "state_conflict");
    expect(stateOf("1.0.0")).toBe("yanked");
    expect(audit().map((row) => row.outcome)).toEqual(["applied", "stale", "stale"]);
  });

  it.each([
    ["published", "draft"],
    ["quarantined", "published"],
    ["draft", "yanked"],
    ["published", "published"],
  ])("answers 422 transition.invalid for %s -> %s, even for an admin", async (from, to) => {
    await publish();
    sql("UPDATE package_releases SET release_state = ?", from);
    expectError(await change("@alpha/demo", "1.0.0", { from, to }, { admin: ADMIN }), 422, "transition.invalid");
    expect(stateOf("1.0.0")).toBe(from);
    expect(audit()).toEqual([expect.objectContaining({ outcome: "invalid" })]);
  });

  it("answers 401 without a credential, to a scoped publish key and to a wrong or unconfigured admin secret", async () => {
    await publish();
    const yank = { from: "published", to: "yanked" };
    const noAuth = await change("@alpha/demo", "1.0.0", yank);
    expectError(noAuth, 401, "auth.required");
    expect(noAuth.headers.get("WWW-Authenticate")).toBe("Bearer");
    // A CI publish key may publish but never change state.
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: h.alphaKey }), 401, "invalid_api_key");
    expectError(await change("@alpha/demo", "1.0.0", yank, { admin: "wrong" }), 401, "invalid_admin_secret");
    // A wrong admin secret never falls back to the key or session.
    expectError(await change("@alpha/demo", "1.0.0", yank, { admin: "wrong", key: ownerKey }), 401, "invalid_admin_secret");
    for (const secret of [undefined, ""]) {
      expectError(await change("@alpha/demo", "1.0.0", yank, { admin: "", env: { ADMIN_SECRET: secret } }), 401, "invalid_admin_secret");
    }
    expect(stateOf("1.0.0")).toBe("published");
    expect(audit()).toEqual([]);
  });

  it.each([
    ["not JSON", { rawBody: "{nope" }, 400, "invalid_request"],
    ["an array", { rawBody: "[]" }, 400, "invalid_request"],
    ["an unknown field", { rawBody: JSON.stringify({ from: "published", to: "yanked", force: true }) }, 400, "invalid_request"],
    ["an unknown state", { rawBody: JSON.stringify({ from: "published", to: "deleted" }) }, 400, "invalid_request"],
    ["a reason with a control character", { rawBody: JSON.stringify({ from: "published", to: "yanked", reason: "a\u0007b" }) }, 400, "invalid_request"],
    ["a bidi override in the reason", { rawBody: JSON.stringify({ from: "published", to: "yanked", reason: "a‮b" }) }, 400, "invalid_request"],
    ["an empty reason", { rawBody: JSON.stringify({ from: "published", to: "yanked", reason: "" }) }, 400, "invalid_request"],
    ["a reason over 512 bytes", { rawBody: JSON.stringify({ from: "published", to: "yanked", reason: "é".repeat(257) }) }, 400, "invalid_request"],
    ["another content type", { headers: { "Content-Type": "text/plain" } }, 415, "unsupported_media_type"],
    ["an oversized body", { rawBody: JSON.stringify({ from: "published", to: "yanked", reason: "x".repeat(5000) }) }, 413, "request_too_large"],
  ])("answers %s with %i", async (_label, options, status, code) => {
    await publish();
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey, ...options }), status, code);
    expect(stateOf("1.0.0")).toBe("published");
  });

  it("answers 404 while the flag is off and 405 to other methods", async () => {
    await publish();
    for (const flag of [undefined, "0"]) {
      const res = await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { admin: ADMIN, env: { SKILLX_RELEASES_API: flag } });
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: { code: "not_found", message: "Not found" } });
    }
    expect((await change("@alpha/demo", "1.0.0", null, { admin: ADMIN, method: "GET" })).status).toBe(405);
    expect(stateOf("1.0.0")).toBe("published");
  });

  it("keeps the audit append-only at the database level", async () => {
    await publish();
    await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey });
    expect(() => sql("UPDATE release_state_audit SET outcome = 'stale'")).toThrow(/append-only/);
    expect(() => sql("DELETE FROM release_state_audit")).toThrow(/append-only/);
    expect(audit()).toHaveLength(1);
  });
});

describe("release state: concurrent yank and quarantine", () => {
  it("lets exactly one compare-and-set win, and audits both attempts", async () => {
    const digest = await publish();
    const before = immutableSnapshot();
    holdBatches(2);
    const [yank, quarantine] = await Promise.all([
      change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey }),
      change("@alpha/demo", "1.0.0", { from: "published", to: "quarantined", reason: "report" }, { admin: ADMIN }),
    ]);
    expect([yank.status, quarantine.status].sort()).toEqual([200, 409]);
    const winner = yank.status === 200 ? "yanked" : "quarantined";
    const loser = (yank.status === 409 ? yank : quarantine).body;
    expect(loser.error.code).toBe("state_conflict");
    expect(stateOf("1.0.0")).toBe(winner);

    const rows = audit();
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.outcome).sort()).toEqual(["applied", "stale"]);
    expect(rows.find((row) => row.outcome === "applied")?.to_state).toBe(winner);
    expect(new Set(rows.map((row) => row.actor_kind))).toEqual(new Set(["user", "admin"]));
    expect(immutableSnapshot()).toEqual(before);
    expect((await read(artifactLoader, "/x", { digest })).status).toBe(winner === "yanked" ? 200 : 403);
  });
});

describe("publisher state", () => {
  it("lets an admin suspend, reinstate, suspend and revoke, with reads and publishes following", async () => {
    const digest = await publish();
    const admin = { admin: ADMIN };
    expect((await changePublisher("@alpha", { from: "active", to: "suspended", reason: "abuse report" }, admin)).body).toMatchObject({
      handle: "alpha",
      state: "suspended",
    });
    expect((await read(manifestLoader, "/x", { digest })).status).toBe(403);
    expect((await h.upload("@alpha/demo", tarOf(skillFiles()), { version: "1.0.1" })).body.error.code).toBe("publisher.inactive");
    // The owner of a suspended publisher cannot change release state either.
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "yanked" }, { key: ownerKey }), 403, "publisher_revoked");

    expect((await changePublisher("@alpha", { from: "suspended", to: "active" }, admin)).status).toBe(200);
    expect((await read(manifestLoader, "/x", { digest })).status).toBe(200);
    expect((await changePublisher("@alpha", { from: "active", to: "suspended" }, admin)).status).toBe(200);
    expect((await changePublisher("@alpha", { from: "suspended", to: "revoked" }, admin)).status).toBe(200);
    expectError(await changePublisher("@alpha", { from: "revoked", to: "active" }, admin), 422, "transition.invalid");
    expectError(await changePublisher("@alpha", { from: "suspended", to: "revoked" }, admin), 409, "state_conflict");

    const publisherRows = audit().filter((row) => row.subject_kind === "publisher");
    expect(publisherRows.map((row) => [row.from_state, row.to_state, row.outcome])).toEqual([
      ["active", "suspended", "applied"],
      ["suspended", "active", "applied"],
      ["active", "suspended", "applied"],
      ["suspended", "revoked", "applied"],
      ["revoked", "active", "invalid"],
      ["suspended", "revoked", "stale"],
    ]);
  });

  it("answers 403 to a publisher's own owner and 400 to a malformed handle", async () => {
    expectError(await changePublisher("@alpha", { from: "active", to: "suspended" }, { key: ownerKey }), 403, "transition.admin_only");
    expect(audit()).toEqual([expect.objectContaining({ subject_kind: "publisher", outcome: "denied" })]);
    expectError(await changePublisher("alpha", { from: "active", to: "suspended" }, { admin: ADMIN }), 400, "identity.invalid");
    expectError(await changePublisher("@alpha", { from: "active", to: "gone" }, { admin: ADMIN }), 400, "invalid_request");
  });
});
