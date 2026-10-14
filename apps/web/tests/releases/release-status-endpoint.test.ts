import { beforeEach, describe, expect, it } from "vitest";
import { verifyReleaseStatus } from "@skillx/contracts";
import type { SkillxReleaseManifest, SkillxReleaseStatus } from "@skillx/contracts";
import { readReleaseStatus } from "~/lib/releases/release-status-issue";
import type { StatusDeps } from "~/lib/releases/release-status-issue";
import { PUBLISHER_REVOKED_REASON, TREE_QUARANTINED_REASON } from "~/lib/releases/release-status-state";
import { loader as statusLoader } from "~/routes/api.v1.release-status";
import { FakeRateLimiter } from "./fake-rate-limiter";
import { NOW, TEST_KEY_ID, createHarness, file, tarOf } from "./release-harness";

type Harness = Awaited<ReturnType<typeof createHarness>>;
let h: Harness;

const HOUR = 3600_000;
const at = (hours: number) => new Date(NOW.getTime() + hours * HOUR);
const files = () => [file("SKILL.md", "---\nname: demo\ndescription: Demo skill\n---\n# Demo\n")];
const sql = (statement: string, ...params: Array<string | number | null>) => h.d1.raw.prepare(statement).run(...params);

beforeEach(async () => {
  h = await createHarness();
});

async function publish(name = "@alpha/demo", version = "1.0.0") {
  const res = await h.upload(name, tarOf(files()), { version });
  expect(res.status).toBe(200);
  return res.body;
}

function deps(now: Date): StatusDeps {
  return { loadSigner: h.deps.loadSigner, activeKeyId: TEST_KEY_ID, now: () => now };
}

async function status(now: Date, name = "@alpha/demo", version = "1.0.0", userId: string | null = null) {
  const [scope, slug] = name.split("/") as [string, string];
  const ctx = { db: h.deps.db, bucket: h.deps.bucket, userId, request: new Request(`https://skillx.test/api/v1/packages/${name}/releases/${version}/status`) };
  const res = await readReleaseStatus(ctx, { scope, slug, version }, deps(now));
  const bytes = new Uint8Array(await res.arrayBuffer());
  return { res, bytes, doc: JSON.parse(new TextDecoder().decode(bytes)) as SkillxReleaseStatus };
}

async function manifestOf(name = "@alpha/demo", version = "1.0.0"): Promise<SkillxReleaseManifest> {
  const row = h.releaseRows().find((r) => r.name === name && r.version === version)!;
  const object = await h.deps.bucket.get(row.signed_manifest_key as string);
  return JSON.parse(new TextDecoder().decode(await object!.arrayBuffer())) as SkillxReleaseManifest;
}

async function verify(bytes: Uint8Array, now: Date, previous: SkillxReleaseStatus | null = null) {
  const keys = new Map([[TEST_KEY_ID, h.signingKey.publicKey]]);
  return verifyReleaseStatus(bytes, keys, { manifest: await manifestOf(), now, previous });
}

function audit(releaseVersion: string, toState: string, reason: string) {
  const id = (h.d1.raw.prepare("SELECT id FROM package_releases WHERE version = ?").get(releaseVersion) as { id: string }).id;
  sql(
    `INSERT INTO release_state_audit (id, subject_kind, subject_id, actor_kind, actor_id, from_state, to_state, outcome, reason, created_at)
     VALUES (?, 'release', ?, 'admin', 'admin', 'published', ?, 'applied', ?, ?)`,
    `aud-${toState}-${Math.random()}`, id, toState, reason, Date.now(),
  );
}

describe("signed release status endpoint", () => {
  it("issues a verifiable published status and reuses it while fresh", async () => {
    await publish();
    const first = await status(at(1));
    expect(first.res.status).toBe(200);
    expect(first.res.headers.get("X-SkillX-Release-State")).toBe("published");
    expect(first.res.headers.get("Cache-Control")).toBe("public, max-age=60, no-transform");
    expect(first.doc).toMatchObject({ schemaVersion: "skillx.release-status/v1", state: "published", sequence: 1, keyId: TEST_KEY_ID });
    expect(first.doc.reason).toBeUndefined();
    expect(Date.parse(first.doc.expiresAt) - Date.parse(first.doc.issuedAt)).toBe(24 * HOUR);
    expect(await verify(first.bytes, at(1))).toEqual({ valid: true, issues: [] });

    const again = await status(at(11));
    expect(again.bytes).toEqual(first.bytes);
    const stored = h.d1.raw.prepare("SELECT status_sequence, status_key FROM package_releases").get() as Record<string, unknown>;
    expect(stored.status_sequence).toBe(1);
    expect(stored.status_key).toMatch(/^statuses\/sha256\/[0-9a-f]{64}\.json$/);
  });

  it("re-signs with a higher sequence when stale and follows yank and unyank", async () => {
    await publish();
    const first = await status(at(1));
    const refreshed = await status(at(14));
    expect(refreshed.doc.sequence).toBe(2);
    expect(await verify(refreshed.bytes, at(14), first.doc)).toMatchObject({ valid: true });

    sql("UPDATE package_releases SET release_state = 'yanked', yanked_at = 2");
    audit("1.0.0", "yanked", "broken install script");
    const yanked = await status(at(15));
    expect(yanked.doc).toMatchObject({ state: "yanked", reason: "broken install script", sequence: 3 });
    expect(yanked.res.headers.get("X-SkillX-Release-State")).toBe("yanked");
    expect(await verify(yanked.bytes, at(15), refreshed.doc)).toMatchObject({ valid: true });

    sql("UPDATE package_releases SET release_state = 'published', yanked_at = NULL");
    const back = await status(at(15));
    expect(back.doc).toMatchObject({ state: "published", sequence: 4 });
    expect(Date.parse(back.doc.issuedAt)).toBe(Date.parse(yanked.doc.issuedAt) + 1000);
    expect(await verify(back.bytes, at(15), yanked.doc)).toMatchObject({ valid: true });
  });

  it("reports quarantine of the tree elsewhere and leaves it with a reachable sequence gap", async () => {
    await publish();
    await publish("@bestagentkits/demo");
    const first = await status(at(1));
    sql("UPDATE package_releases SET release_state = 'quarantined' WHERE package_id = (SELECT id FROM packages WHERE name = '@bestagentkits/demo')");
    const blocked = await status(at(2));
    expect(blocked.doc).toMatchObject({ state: "quarantined", reason: TREE_QUARANTINED_REASON, sequence: 2 });
    expect(await verify(blocked.bytes, at(2), first.doc)).toMatchObject({ valid: true });

    sql("UPDATE package_releases SET release_state = 'yanked' WHERE package_id = (SELECT id FROM packages WHERE name = '@bestagentkits/demo')");
    const cleared = await status(at(3));
    // quarantined -> yanked -> published: two transitions, so the sequence advances by two.
    expect(cleared.doc).toMatchObject({ state: "published", sequence: 4 });
    expect(await verify(cleared.bytes, at(3), blocked.doc)).toMatchObject({ valid: true });
  });

  it("reports a suspended publisher as quarantined, and a first non-published status after sequence 1", async () => {
    await publish();
    sql("UPDATE publishers SET state = 'revoked' WHERE handle = 'alpha'");
    const revoked = await status(at(1));
    expect(revoked.doc).toMatchObject({ state: "quarantined", reason: PUBLISHER_REVOKED_REASON, sequence: 2 });
    expect(await verify(revoked.bytes, at(1))).toMatchObject({ valid: true });
  });

  it("drops an audit reason that is not a valid status reason", async () => {
    await publish();
    sql("UPDATE package_releases SET release_state = 'yanked', yanked_at = 2");
    audit("1.0.0", "yanked", "bad‮reason");
    const yanked = await status(at(1));
    expect(yanked.doc.state).toBe("yanked");
    expect(yanked.doc.reason).toBeUndefined();
    expect(await verify(yanked.bytes, at(1))).toMatchObject({ valid: true });
  });

  it("answers 404 for unknown versions and unentitled private packages", async () => {
    await publish();
    await expect(status(at(1), "@alpha/demo", "9.9.9")).rejects.toMatchObject({ status: 404, code: "not_found" });
    sql("UPDATE packages SET visibility = 'private'");
    await expect(status(at(1))).rejects.toMatchObject({ status: 404, code: "not_found" });
    sql("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at) SELECT 'ent-1', 'user-b', id, NULL, 'manual', 1, NULL FROM packages");
    const entitled = await status(at(1), "@alpha/demo", "1.0.0", "user-b");
    expect(entitled.res.headers.get("Cache-Control")).toBe("private, max-age=60, no-transform");
  });

  it("serves one document per sequence when requests race", async () => {
    await publish();
    const [a, b] = await Promise.all([status(at(1)), status(at(2))]);
    expect(a.bytes).toEqual(b.bytes);
    expect(a.doc.sequence).toBe(1);
  });

  it("is served through the route behind the flag, and 503 without a signing key", async () => {
    await publish();
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
