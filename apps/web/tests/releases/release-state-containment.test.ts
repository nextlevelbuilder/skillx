import { beforeEach, describe, expect, it, vi } from "vitest";
import { loader as artifactLoader } from "~/routes/api.v1.release-artifact";
import { loader as manifestLoader } from "~/routes/api.v1.release-manifest";
import { checkReleaseRateLimit, resetRateLimitWarning } from "~/lib/releases/release-rate-limit";
import { FakeRateLimiter } from "./fake-rate-limiter";
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
  sql,
  stateOf,
  useStateHarness,
} from "./release-state-helpers";
import type { Harness } from "./release-state-helpers";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let h: Harness;
let ownerKey: string;
let otherKey: string;
const admin = { admin: ADMIN };
const yank = { from: "published", to: "yanked" };
const contain = { from: "yanked", to: "quarantined", reason: "malware in a yanked release" };
const edges = () => audit().map((row) => [row.actor_kind, row.from_state, row.to_state, row.outcome]);

beforeEach(async () => {
  h = await useStateHarness();
  session.user = null;
  ownerKey = await h.createKey("user-a", null);
  otherKey = await h.createKey("user-b", null);
});

describe("release state: rate limit", () => {
  it("answers 429 before any audit write, for users and the admin alike", async () => {
    await publish();
    const limiter = new FakeRateLimiter(1);
    // The first attempt is counted and audited as a denial; the next one is refused before D1.
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: otherKey, env: { RELEASE_WRITE_LIMITER: limiter } }), 403, "transition.not_owner");
    expect(audit()).toHaveLength(1);
    const limited = await change("@alpha/demo", "1.0.0", yank, { key: otherKey, env: { RELEASE_WRITE_LIMITER: limiter } });
    expectError(limited, 429, "rate_limited");
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limited.headers.get("Cache-Control")).toBe("no-store");

    const exhausted = { env: { RELEASE_WRITE_LIMITER: new FakeRateLimiter(0) } };
    expectError(await change("@alpha/demo", "1.0.0", yank, { ...admin, ...exhausted }), 429, "rate_limited");
    expectError(await changePublisher("@alpha", { from: "active", to: "suspended" }, { ...admin, ...exhausted }), 429, "rate_limited");
    expect(audit()).toHaveLength(1);
    expect(stateOf("1.0.0")).toBe("published");
    expect(h.d1.raw.prepare("SELECT state FROM publishers WHERE handle = 'alpha'").get()).toEqual({ state: "active" });
  });

  it("counts writes on their own limiter, never the read limiter", async () => {
    await publish();
    const reads = new FakeRateLimiter(0);
    const writes = new FakeRateLimiter(10_000);
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, env: { RELEASE_READ_LIMITER: reads, RELEASE_WRITE_LIMITER: writes } })).status).toBe(200);
    expect(reads.counts.size).toBe(0);
    expect(writes.counts.size).toBe(1);
  });

  it("refuses account writes with 503 when the write limiter is missing or failing, before any audit write", async () => {
    await publish();
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, env: { RELEASE_WRITE_LIMITER: undefined } }), 503, "rate_limit_unavailable");
    const failing = new FakeRateLimiter(10_000);
    failing.failing = true;
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, env: { RELEASE_WRITE_LIMITER: failing } }), 503, "rate_limit_unavailable");
    expect(audit()).toHaveLength(0);
    expect(stateOf("1.0.0")).toBe("published");
  });

  it("lets the admin contain a release when the write limiter is missing or failing", async () => {
    await publish();
    expect((await change("@alpha/demo", "1.0.0", yank, { ...admin, env: { RELEASE_WRITE_LIMITER: undefined } })).status).toBe(200);
    const failing = new FakeRateLimiter(10_000);
    failing.failing = true;
    expect((await change("@alpha/demo", "1.0.0", contain, { ...admin, env: { RELEASE_WRITE_LIMITER: failing } })).status).toBe(200);
    expect(stateOf("1.0.0")).toBe("quarantined");
  });

  it("refuses a limited request before reading its body", async () => {
    await publish();
    const exhausted = { env: { RELEASE_WRITE_LIMITER: new FakeRateLimiter(0) } };
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, rawBody: "{not json", ...exhausted }), 429, "rate_limited");
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, headers: { "Content-Type": "text/plain" }, ...exhausted }), 429, "rate_limited");
    expect(audit()).toHaveLength(0);
  });

  it("answers 401, not 503, to a wrong admin secret when the write limiter is missing", async () => {
    await publish();
    expectError(await change("@alpha/demo", "1.0.0", yank, { admin: "wrong", env: { RELEASE_WRITE_LIMITER: undefined } }), 401, "invalid_admin_secret");
  });

  it("refuses account publisher changes with 503 when the write limiter is missing", async () => {
    expectError(await changePublisher("@alpha", { from: "active", to: "suspended" }, { key: ownerKey, env: { RELEASE_WRITE_LIMITER: undefined } }), 503, "rate_limit_unavailable");
  });

  it("warns about a missing write limiter even after the read limiter warned", async () => {
    resetRateLimitWarning();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      await publish();
      await checkReleaseRateLimit(undefined, "ip:198.51.100.1");
      expect(String(warn.mock.calls[0]![0])).toContain("no RELEASE_READ_LIMITER binding");
      await change("@alpha/demo", "1.0.0", yank, { key: ownerKey, env: { RELEASE_READ_LIMITER: undefined, RELEASE_WRITE_LIMITER: undefined } });
      expect(warn.mock.calls.map((call) => String(call[0])).filter((line) => line.includes("no RELEASE_WRITE_LIMITER binding"))).toHaveLength(1);
    } finally {
      warn.mockRestore();
      resetRateLimitWarning();
    }
  });

  it("throttles X-Admin-Secret guesses by client IP before checking the secret", async () => {
    await publish();
    const limiter = new FakeRateLimiter(2);
    const guess = (secret: string, ip: string) =>
      change("@alpha/demo", "1.0.0", yank, { admin: secret, headers: { "CF-Connecting-IP": ip }, env: { RELEASE_WRITE_LIMITER: limiter } });
    expectError(await guess("wrong-1", "203.0.113.7"), 401, "invalid_admin_secret");
    expectError(await guess("wrong-2", "203.0.113.7"), 401, "invalid_admin_secret");
    const limited = await guess(ADMIN, "203.0.113.7");
    expectError(limited, 429, "rate_limited");
    expect(limited.headers.get("Retry-After")).toBe("60");
    expect(limiter.counts.get("ip:203.0.113.7")).toBe(3);
    // Another address still has its own budget; the admin itself is then counted as user:admin.
    expect((await guess(ADMIN, "198.51.100.9")).status).toBe(200);
    expect(limiter.counts.get("user:admin")).toBe(1);
    expect(audit()).toHaveLength(1);
  });
});

describe("release state: containing a yanked release", () => {
  it("quarantines a yanked release in one step, auditing both v1 edges", async () => {
    const digest = await publish();
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey })).status).toBe(200);
    const before = immutableSnapshot();
    const yankedAt = (h.d1.raw.prepare("SELECT yanked_at FROM package_releases").get() as { yanked_at: number }).yanked_at;

    const res = await change("@alpha/demo", "1.0.0", contain, admin);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: "yanked", to: "quarantined", state: "quarantined", releaseDigest: digest });
    expect(stateOf("1.0.0")).toBe("quarantined");
    expect((await read(artifactLoader, "/x", { digest })).status).toBe(403);
    expect(immutableSnapshot()).toEqual(before);
    expect(edges()).toEqual([
      ["user", "published", "yanked", "applied"],
      ["admin", "yanked", "published", "applied"],
      ["admin", "published", "quarantined", "applied"],
    ]);
    expect(audit().slice(1).map((row) => row.reason)).toEqual([contain.reason, contain.reason]);
    const times = h.d1.raw.prepare("SELECT yanked_at, quarantined_at FROM package_releases").get() as Record<string, number | null>;
    expect(times.yanked_at).toBe(yankedAt);
    expect(times.quarantined_at).not.toBeNull();
  });

  it("never stores published as an intermediate state", async () => {
    await publish();
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey })).status).toBe(200);
    sql("CREATE TEMP TABLE state_log (state TEXT NOT NULL)");
    sql("CREATE TEMP TRIGGER log_release_state AFTER UPDATE OF release_state ON package_releases BEGIN INSERT INTO state_log VALUES (NEW.release_state); END");
    expect((await read(manifestLoader, "/x", { scope: "@alpha", slug: "demo", version: "1.0.0" })).status).toBe(410);

    expect((await change("@alpha/demo", "1.0.0", contain, admin)).status).toBe(200);
    expect(h.d1.raw.prepare("SELECT state FROM state_log ORDER BY rowid").all()).toEqual([{ state: "quarantined" }]);
    expect((await read(manifestLoader, "/x", { scope: "@alpha", slug: "demo", version: "1.0.0" })).status).not.toBe(200);
  });

  it("stays atomic against a concurrent un-yank: all edges applied, or none", async () => {
    await publish();
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey })).status).toBe(200);
    holdBatches(2);
    const [contained, unyanked] = await Promise.all([
      change("@alpha/demo", "1.0.0", contain, admin),
      change("@alpha/demo", "1.0.0", { from: "yanked", to: "published" }, admin),
    ]);
    expect([contained.status, unyanked.status].sort()).toEqual([200, 409]);
    const rows = edges().slice(1);
    if (contained.status === 200) {
      expect(stateOf("1.0.0")).toBe("quarantined");
      expect(rows.filter((row) => row[3] === "applied")).toEqual([
        ["admin", "yanked", "published", "applied"],
        ["admin", "published", "quarantined", "applied"],
      ]);
      expect(rows.filter((row) => row[3] === "stale")).toEqual([["admin", "yanked", "published", "stale"]]);
    } else {
      expect(unyanked.status).toBe(200);
      expectError(contained, 409, "state_conflict");
      expect(stateOf("1.0.0")).toBe("published");
      expect(rows.filter((row) => row[3] === "applied")).toEqual([["admin", "yanked", "published", "applied"]]);
      // The losing composite leaves one stale row of the requested edge and no partial edge rows.
      expect(rows.filter((row) => row[3] === "stale")).toEqual([["admin", "yanked", "quarantined", "stale"]]);
    }
    expect(rows).toHaveLength(contained.status === 200 ? 3 : 2);
  });

  it("refuses the owner and a non-owner, auditing the denial", async () => {
    await publish();
    expect((await change("@alpha/demo", "1.0.0", yank, { key: ownerKey })).status).toBe(200);
    expectError(await change("@alpha/demo", "1.0.0", contain, { key: ownerKey }), 403, "transition.admin_only");
    expectError(await change("@alpha/demo", "1.0.0", contain, { key: otherKey }), 403, "transition.not_owner");
    expect(stateOf("1.0.0")).toBe("yanked");
    expect(edges().slice(1)).toEqual([
      ["user", "yanked", "quarantined", "denied"],
      ["user", "yanked", "quarantined", "denied"],
    ]);
  });
});

describe("release state: publisher standing of an owner", () => {
  it("answers a suspended owner 403 publisher_revoked before judging the edge", async () => {
    await publish();
    sql("UPDATE publishers SET state = 'suspended'");
    expectError(await change("@alpha/demo", "1.0.0", { from: "published", to: "draft" }, { key: ownerKey }), 403, "publisher_revoked");
    expect(edges()).toEqual([["user", "published", "draft", "denied"]]);
  });

  it("refuses an owner whose publisher is suspended after the pre-check, inside the batch", async () => {
    await publish();
    holdBatches(1, () => sql("UPDATE publishers SET state = 'suspended'"));
    expectError(await change("@alpha/demo", "1.0.0", yank, { key: ownerKey }), 403, "publisher_revoked");
    expect(stateOf("1.0.0")).toBe("published");
    expect(edges()).toEqual([["user", "published", "yanked", "denied"]]);
  });
});
