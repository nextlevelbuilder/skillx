import { beforeEach, describe, expect, it } from "vitest";
import { loader as statusLoader } from "~/routes/api.v1.release-status";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { TEST_KEY_ID, createHarness } from "./release-harness";
import { at, statusHelpers } from "./release-status-helpers";
import type { Harness } from "./release-status-helpers";

const HOUR = 3600_000;
let h: Harness;
let s: ReturnType<typeof statusHelpers>;

beforeEach(async () => {
  h = await createHarness();
  s = statusHelpers(h);
});

function audit(toState: string, reason: string) {
  const id = (h.d1.raw.prepare("SELECT id FROM package_releases WHERE version = '1.0.0'").get() as { id: string }).id;
  s.sql(
    `INSERT INTO release_state_audit (id, subject_kind, subject_id, actor_kind, actor_id, from_state, to_state, outcome, reason, created_at)
     VALUES (?, 'release', ?, 'admin', 'admin', 'published', ?, 'applied', ?, ?)`,
    `aud-${toState}-${Math.random()}`, id, toState, reason, Date.now(),
  );
}

describe("signed release status endpoint", () => {
  it("issues a verifiable published status and reuses it while fresh", async () => {
    await s.publish();
    const first = await s.status(at(1));
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get("X-SkillX-Release-State")).toBe("published");
    expect(first.res.headers.get("Cache-Control")).toBe("public, max-age=60, no-transform");
    expect(first.doc).toMatchObject({ schemaVersion: "skillx.release-status/v1", state: "published", sequence: 1, keyId: TEST_KEY_ID });
    expect(first.doc.reason).toBeUndefined();
    expect(Date.parse(first.doc.expiresAt) - Date.parse(first.doc.issuedAt)).toBe(24 * HOUR);
    expect(await s.verify(first.bytes, at(1))).toEqual({ valid: true, issues: [] });

    const again = await s.status(at(11));
    expect(again.bytes).toEqual(first.bytes);
    const stored = h.d1.raw.prepare("SELECT status_sequence, status_key FROM package_releases").get() as Record<string, unknown>;
    expect(stored.status_sequence).toBe(1);
    expect(stored.status_key).toMatch(/^statuses\/sha256\/[0-9a-f]{64}\.json$/);
  });

  it("re-signs with a higher sequence when stale and follows yank and unyank with a reason code only", async () => {
    await s.publish();
    const first = await s.status(at(1));
    const refreshed = await s.status(at(14));
    expect(refreshed.doc.sequence).toBe(2);
    expect(await s.verify(refreshed.bytes, at(14), first.doc)).toMatchObject({ valid: true });

    s.sql("UPDATE package_releases SET release_state = 'yanked', yanked_at = 2");
    audit("yanked", "reported by jane@example.com: broken install script");
    const yanked = await s.status(at(15));
    expect(yanked.doc).toMatchObject({ state: "yanked", reason: "yanked", sequence: 3 });
    expect(new TextDecoder().decode(yanked.bytes)).not.toContain("jane");
    expect(yanked.res.headers.get("X-SkillX-Release-State")).toBe("yanked");
    expect(await s.verify(yanked.bytes, at(15), refreshed.doc)).toMatchObject({ valid: true });

    s.sql("UPDATE package_releases SET release_state = 'published', yanked_at = NULL");
    const back = await s.status(at(15));
    expect(back.doc).toMatchObject({ state: "published", sequence: 4 });
    expect(back.doc.reason).toBeUndefined();
    expect(Date.parse(back.doc.issuedAt)).toBe(Date.parse(yanked.doc.issuedAt) + 1000);
    expect(await s.verify(back.bytes, at(15), yanked.doc)).toMatchObject({ valid: true });
  });

  it("reports a quarantined release with the quarantine code", async () => {
    await s.publish();
    s.sql("UPDATE package_releases SET release_state = 'quarantined'");
    audit("quarantined", "internal malware ticket 1234");
    const quarantined = await s.status(at(1));
    expect(quarantined.doc).toMatchObject({ state: "quarantined", reason: "quarantined", sequence: 2 });
    expect(await s.verify(quarantined.bytes, at(1))).toMatchObject({ valid: true });
  });

  it("reports quarantine of the tree elsewhere and leaves it with a reachable sequence gap", async () => {
    await s.publish();
    await s.publish("@bestagentkits/demo");
    const first = await s.status(at(1));
    s.sql("UPDATE package_releases SET release_state = 'quarantined' WHERE package_id = (SELECT id FROM packages WHERE name = '@bestagentkits/demo')");
    const blocked = await s.status(at(2));
    expect(blocked.doc).toMatchObject({ state: "quarantined", reason: "tree_quarantined", sequence: 2 });
    expect(await s.verify(blocked.bytes, at(2), first.doc)).toMatchObject({ valid: true });

    s.sql("UPDATE package_releases SET release_state = 'yanked' WHERE package_id = (SELECT id FROM packages WHERE name = '@bestagentkits/demo')");
    const cleared = await s.status(at(3));
    // quarantined -> yanked -> published: two transitions, so the sequence advances by two.
    expect(cleared.doc).toMatchObject({ state: "published", sequence: 4 });
    expect(await s.verify(cleared.bytes, at(3), blocked.doc)).toMatchObject({ valid: true });
  });

  it("reports a suspended publisher as quarantined, and a first non-published status after sequence 1", async () => {
    await s.publish();
    s.sql("UPDATE publishers SET state = 'revoked' WHERE handle = 'alpha'");
    const revoked = await s.status(at(1));
    expect(revoked.doc).toMatchObject({ state: "quarantined", reason: "publisher_revoked", sequence: 2 });
    expect(await s.verify(revoked.bytes, at(1))).toMatchObject({ valid: true });
  });

  it("answers 404 for unknown versions and unentitled private packages", async () => {
    await s.publish();
    await expect(s.status(at(1), { version: "9.9.9" })).rejects.toMatchObject({ status: 404, code: "not_found" });
    s.sql("UPDATE packages SET visibility = 'private'");
    await expect(s.status(at(1))).rejects.toMatchObject({ status: 404, code: "not_found" });
    s.sql("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at) SELECT 'ent-1', 'user-b', id, NULL, 'manual', 1, NULL FROM packages");
    const entitled = await s.status(at(1), { userId: "user-b" });
    expect(entitled.res.headers.get("Cache-Control")).toBe("private, max-age=60, no-transform");
  });

  it("is served through the route behind the flag, and 503 without a signing key", async () => {
    await s.publish();
    const call = (env: Record<string, unknown>) =>
      statusLoader({
        request: new Request("https://skillx.test/api/v1/packages/@alpha/demo/releases/1.0.0/status"),
        params: { scope: "@alpha", slug: "demo", version: "1.0.0" },
        context: { cloudflare: { env: { DB: h.deps.db, R2: h.deps.bucket, RELEASE_READ_LIMITER: new FakeRateLimiter(100), ...env } } },
      } as never);
    expect((await call({})).status).toBe(404);
    const res = await call({ SKILLX_RELEASES_API: "1" });
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ error: { code: "release.signing_unavailable" } });
  });
});
