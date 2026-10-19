import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

let k: KitHarness;
const DEMO = { "SKILL.md": skillText(BODY) };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")), "notes.md": "my notes\n" };

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", DEMO);
});

async function createKit(files = MINE) {
  const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", files)]) });
  expect(res.status).toBe(201);
  return res.body;
}

describe("personal kit revisions", () => {
  it("is 404 kit.api_disabled everywhere while the flag is off, before any auth or lookup", async () => {
    const off = { env: { SKILLX_PERSONAL_KITS_API: "0" } };
    for (const res of [
      await k.call("", undefined, off),
      await k.call("revisions", {}, off),
      await k.call("lock", undefined, { ...off, key: null }),
      await k.call("", undefined, { ...off, kit: "@nobody/missing" }),
    ]) {
      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("kit.api_disabled");
      expect(res.headers.get("Cache-Control")).toBe("no-store");
    }
    expect(k.count("personal_kits") + k.count("personal_kit_audit")).toBe(0);
  });

  it("stores a draft whose composition the server re-derives, then activates it only with approval", async () => {
    const created = await createKit();
    expect(created).toMatchObject({ generation: 1, replayed: false, revision: { number: 1, state: "draft", origin: "manual" } });
    const kit = await k.call("");
    expect(kit.body).toMatchObject({ kit: "@alpha/my-kit", visibility: "private", generation: 1, effectiveRevision: null });
    expect(kit.headers.get("ETag")).toBe('"g1"');
    expect(kit.headers.get("Cache-Control")).toBe("no-store");

    const wrong = await k.call("activate", { expectedGeneration: 1, revisionId: created.revision.id, approval: { revisionDigest: `sha256:${"0".repeat(64)}` } });
    expect(wrong.status).toBe(409);
    expect(wrong.body.error.code).toBe("kit.approval_required");
    const ok = await k.call("activate", { expectedGeneration: 1, revisionId: created.revision.id, approval: { revisionDigest: created.revision.digest } });
    expect(ok.status).toBe(200);
    expect(ok.body.lock).toMatchObject({ schema: "skillx.personal-kit-lock/v1", kit: "@alpha/my-kit", localId: "local/my-kit", revisionNumber: 1 });
    expect(ok.body.lock.entries[0]).toMatchObject({ identity: "@alpha/demo", alias: "demo", owner: "personal:@alpha/my-kit", version: "1.0.0" });

    const lock = await k.call("lock");
    expect(lock.status).toBe(200);
    expect(lock.body.lock).toEqual(ok.body.lock);
    expect(lock.body.documents).toHaveLength(1);
  });

  it("refuses a client compositionDigest that the pinned bytes do not give, writing nothing", async () => {
    const bad = { ...(await k.entry("@alpha/demo", "1.0.0", MINE)), compositionDigest: `sha256:${"1".repeat(64)}` };
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([bad]) });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe("kit.composition_digest_mismatch");
    expect(k.count("personal_kits") + k.count("personal_kit_revisions") + k.count("personal_kit_audit")).toBe(0);
  });

  it("enforces generation compare-and-set and idempotency", async () => {
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]);
    const first = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: "same-key-0001", document });
    expect(first.status).toBe(201);
    const replay = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: "same-key-0001", document });
    expect(replay.status).toBe(200);
    expect(replay.body).toMatchObject({ replayed: true, revision: { id: first.body.revision.id } });
    const other = k.doc([await k.entry("@alpha/demo", "1.0.0")]);
    const reused = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: "same-key-0001", document: other });
    expect(reused.body.error.code).toBe("kit.idempotency_conflict");
    const stale = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: other });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe("kit.generation_conflict");
    const dup = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document });
    expect(dup.body.error.code).toBe("kit.revision_exists");
    expect(k.count("personal_kit_revisions")).toBe(1);
  });

  it("hides a kit from everyone but its owner and needs an owned publisher", async () => {
    await createKit();
    expect((await k.call("", undefined, { key: k.otherKey })).status).toBe(404);
    expect((await k.call("revisions", undefined, { key: k.otherKey })).status).toBe(404);
    const foreign = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: { ...k.doc([]), kit: "@beta/x", localId: "local/x" } }, { kit: "@beta/x" });
    expect(foreign.status).toBe(403);
    expect(foreign.body.error.code).toBe("kit.publisher_not_owned");
    expect((await k.call("", undefined, { key: null })).status).toBe(401);
    const scoped = await k.call("", undefined, { key: k.h.alphaKey });
    expect(scoped.status).toBe(401);
  });

  it("refuses a public kit over a private base and overlays of official shared skills", async () => {
    await k.publish("@beta/paid", "1.0.0", { "SKILL.md": skillText(BODY, "name: paid\ndescription: Paid") });
    k.sql("UPDATE packages SET visibility = 'private' WHERE name = '@beta/paid'");
    k.sql("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at) SELECT 'ent-1', 'user-a', id, NULL, 'purchase', 1 FROM packages WHERE name = '@beta/paid'");
    const document = k.doc([await k.entry("@beta/paid", "1.0.0")], { visibility: "public" });
    const pub = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document });
    expect(pub.status).toBe(422);
    expect(pub.body.error.code).toBe("kit.public_derivative_forbidden");
    const priv = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: { ...document, visibility: "private" } });
    expect(priv.status).toBe(201);

    const mine = await k.entry("@alpha/demo", "1.0.0", MINE);
    const official = k.doc([{ ...mine, identity: "@agentkit/plan", base: { ...mine.base, package: "@agentkit/plan" } }]);
    const shared = { env: { SKILLX_SHARED_SKILL_ALIASES: "@agentkit/plan, @agentkit/cook" } };
    const res = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document: official }, shared);
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("overlay.shared_alias");

    // Unset, the guard fails closed on AgentKit's ak- / ak: skills; set, the list adds to that default.
    const ak = (name: string) => k.doc([{ ...mine, identity: `@agentkit/${name}`, base: { ...mine.base, package: `@agentkit/${name}` } }]);
    for (const [document, o] of [[ak("ak-plan"), {}], [ak("ak-cook"), {}], [ak("ak-plan"), shared]] as const) {
      const refused = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document }, o);
      expect(refused.status).toBe(422);
      expect(refused.body.error.code).toBe("overlay.shared_alias");
    }
    // Other official skills pass the guard unless listed (this one then fails only on its unpublished base).
    const unlisted = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document: official });
    expect(unlisted.body.error.code).toBe("kit.base_unavailable");
  });

  it("resolves a pin by package, not by a tree another package also ships", async () => {
    await k.publish("@alpha/twin", "1.0.0", DEMO); // same bytes, so the same tree digest as @alpha/demo
    const twin = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/twin", "1.0.0", MINE)]) });
    expect(twin.status).toBe(201);
    const demo = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) });
    expect(demo.status).toBe(201);
    const wrongVersion = k.doc([await k.entry("@alpha/twin", "1.0.0", MINE, { base: { package: "@alpha/twin", version: "9.9.9", releaseDigest: (await k.treeOf("@alpha/twin", "1.0.0")).digest } })]);
    const res = await k.call("revisions", { expectedGeneration: 2, idempotencyKey: k.idem(), document: wrongVersion });
    expect(res.body.error.code).toBe("kit.base_unavailable");
  });

  it("keeps revisions immutable and the audit append-only", async () => {
    await createKit();
    expect(() => k.sql("UPDATE personal_kit_revisions SET document_json = '{}'")).toThrow(/immutable/);
    expect(() => k.sql("DELETE FROM personal_kit_revisions")).toThrow(/never deleted/);
    expect(() => k.sql("UPDATE personal_kit_audit SET action = 'x'")).toThrow(/append-only/);
    expect(k.count("personal_kit_audit")).toBe(1);
  });

  it("rejects drafts, rolls back to an earlier effective revision and diffs revisions", async () => {
    const r1 = (await createKit()).revision;
    await k.call("activate", { expectedGeneration: 1, revisionId: r1.id, approval: { revisionDigest: r1.digest } });
    const r2 = (await k.call("revisions", { expectedGeneration: 2, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0")]) })).body.revision;
    const diff = await k.call(`diff?from=${r1.id}&to=${r2.id}`);
    expect(diff.body.changed).toEqual([{ identity: "@alpha/demo", fields: ["compositionDigest"], overlayPaths: ["SKILL.md", "notes.md"] }]);
    await k.call("activate", { expectedGeneration: 3, revisionId: r2.id, approval: { revisionDigest: r2.digest } });
    const back = await k.call("rollback", { expectedGeneration: 4, revisionId: r1.id, approval: { revisionDigest: r1.digest } });
    expect(back.status).toBe(200);
    expect((await k.call("")).body.effectiveRevision.id).toBe(r1.id);
    const effectiveReject = await k.call(`revisions/${r1.id}/reject`, { expectedGeneration: 5 });
    expect(effectiveReject.body.error.code).toBe("kit.revision_effective");
    const r3 = (await k.call("revisions", { expectedGeneration: 5, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", DEMO)]) })).body;
    expect(r3.error?.code).toBe("kit.revision_exists");
  });
});
