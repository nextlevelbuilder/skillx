/**
 * Safety rules of personal kits: foreign parents, rejected re-store,
 * publisher state on every write, rebase idempotency, upstream checks on
 * unmodified skills, the diff bound and the per-request base budget.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadPinnedBase, newBaseCache } from "~/lib/personal-kits/base-loader";
import { ReleaseHttpError } from "~/lib/releases/release-http";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

let k: KitHarness;
const V1 = { "SKILL.md": skillText(BODY) };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")) };
const UPDATE = [{ package: "@alpha/demo", version: "2.0.0" }];
const BETA = { kit: "@beta/base" };

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", V1);
});

/** A revision of user-b's kit `@beta/base`; activated when `activate` is set. */
async function betaRevision(generation: number, visibility: "private" | "public", activate: boolean, files = MINE) {
  const document = { ...k.doc([await k.entry("@alpha/demo", "1.0.0", files)], { visibility }), kit: "@beta/base", localId: "local/base" };
  const res = await k.call("revisions", { expectedGeneration: generation, idempotencyKey: k.idem(), document }, { ...BETA, key: k.otherKey });
  expect(res.status).toBe(201);
  const rev = res.body.revision as { id: string; digest: string };
  if (activate) {
    const ok = await k.call("activate", { expectedGeneration: generation + 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } }, { ...BETA, key: k.otherKey });
    expect(ok.status).toBe(200);
  }
  return rev;
}

const child = (parentDigest: string) => k.doc([], { parent: { kit: "@beta/base", revisionDigest: parentDigest } });

/** An active kit over `@alpha/demo@1.0.0`; `null` files means no overlay. */
async function activeKit(files: Record<string, string> | null = MINE) {
  const created = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", files ?? undefined)]) });
  const rev = created.body.revision;
  expect((await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } })).status).toBe(200);
  return rev as { id: string };
}

describe("foreign parents", () => {
  it("accepts only a public, activated revision authored public, and returns it as a reference", async () => {
    const draft = await betaRevision(0, "public", false);
    const refused = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: child(draft.digest) });
    expect(refused.status).toBe(422);
    expect(refused.body.error.code).toBe("kit.base_unavailable");

    const active = await betaRevision(1, "public", true, { ...MINE, "notes.md": "n\n" });
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: child(active.digest) });
    expect(res.status).toBe(201);
    const rev = res.body.revision;
    const ok = await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(ok.status).toBe(200);
    const lock = await k.call("lock");
    expect(lock.body.documents).toHaveLength(2);
    expect(lock.body.documents[1]).toEqual({ kit: "@beta/base", revisionDigest: active.digest, foreign: true });
    expect(JSON.stringify(lock.body.documents)).not.toContain("overlay");
  });

  it("fails the lock and activation with kit.locked_incompatible once a parent is no longer available", async () => {
    const active = await betaRevision(0, "public", true);
    const rev = (await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: child(active.digest) })).body.revision;
    expect((await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } })).status).toBe(200);
    const again = (await k.call("revisions", { expectedGeneration: 2, idempotencyKey: k.idem(), document: { ...child(active.digest), exclude: ["@alpha/demo"] } })).body.revision;
    // The owner makes the parent kit private: the foreign parent is gone for this user.
    k.sql("UPDATE personal_kits SET visibility = 'private' WHERE name = '@beta/base'");
    const lock = await k.call("lock");
    expect(lock.status).toBe(409);
    expect(lock.body.error.code).toBe("kit.locked_incompatible");
    expect(lock.body.error.reasons).toEqual([`parent revision ${active.digest} of @beta/base is not available`]);
    const act = await k.call("activate", { expectedGeneration: 3, revisionId: again.id, approval: { revisionDigest: again.digest } });
    expect(act.status).toBe(409);
    expect(act.body.error.code).toBe("kit.locked_incompatible");
  });

  it("refuses a foreign revision that was authored while the kit was private", async () => {
    const early = await betaRevision(0, "private", true);
    await betaRevision(2, "public", true, { ...MINE, "notes.md": "n\n" });
    const res = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: child(early.digest) });
    expect(res.body.error.code).toBe("kit.base_unavailable");
  });
});

describe("revision writes", () => {
  it("stores a rejected document again as a new revision", async () => {
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]);
    const first = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document });
    expect((await k.call(`revisions/${first.body.revision.id}/reject`, { expectedGeneration: 1 })).status).toBe(200);
    const again = await k.call("revisions", { expectedGeneration: 2, idempotencyKey: k.idem(), document });
    expect(again.status).toBe(201);
    expect(again.body.revision).toMatchObject({ number: 2, digest: first.body.revision.digest, state: "draft" });
  });

  it("checks the publisher on every write, not only on create", async () => {
    const created = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]) });
    k.sql("UPDATE publishers SET state = 'suspended' WHERE handle = 'alpha'");
    const rev = created.body.revision;
    const res = await k.call("activate", { expectedGeneration: 1, revisionId: rev.id, approval: { revisionDigest: rev.digest } });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("kit.publisher_not_owned");
    const store = await k.call("revisions", { expectedGeneration: 1, idempotencyKey: k.idem(), document: k.doc([await k.entry("@alpha/demo", "1.0.0")]) });
    expect(store.body.error.code).toBe("kit.publisher_not_owned");
  });

  it("refuses foreign-key deletes of a publisher that has kits", async () => {
    await activeKit();
    expect(() => k.sql("DELETE FROM publishers WHERE handle = 'alpha'")).toThrow();
  });
});

describe("rebase safety", () => {
  it("replays a clean rebase and a recorded conflict by idempotency key before the generation check", async () => {
    await k.publish("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY.replace("two\n", "two (v2)\n")) });
    await activeKit();
    const first = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-01", updates: UPDATE });
    expect(first.body).toMatchObject({ status: "needs-review", generation: 3, replayed: false });
    const again = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-01", updates: UPDATE });
    expect(again.status).toBe(200);
    expect(again.body).toMatchObject({ status: "needs-review", conflictId: first.body.conflictId, replayed: true });
    expect(k.count("personal_kit_conflicts")).toBe(1);
    for (const changed of [{ updates: [{ package: "@alpha/demo", version: "2.0.1" }] }, { updates: UPDATE, includeForks: true }]) {
      const reused = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-01", ...changed });
      expect(reused.status).toBe(409);
      expect(reused.body.error.code).toBe("kit.idempotency_conflict");
    }
  });

  it("refuses a reused key with other updates instead of replaying a clean rebase", async () => {
    await k.publish("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY.replace("eight\n", "eight (v2)\n")) });
    await activeKit();
    const first = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-03", updates: UPDATE });
    expect(first.status).toBe(201);
    const reused = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-03", updates: [{ package: "@alpha/demo", version: "2.0.1" }] });
    expect(reused.status).toBe(409);
    expect(reused.body.error.code).toBe("kit.idempotency_conflict");
    const forks = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-03", updates: UPDATE, includeForks: true });
    expect(forks.body.error.code).toBe("kit.idempotency_conflict");
  });

  it("replays a clean rebase revision", async () => {
    await k.publish("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY.replace("eight\n", "eight (v2)\n")) });
    await activeKit();
    const first = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-02", updates: UPDATE });
    expect(first.status).toBe(201);
    const again = await k.call("rebase", { expectedGeneration: 2, idempotencyKey: "rebase-key-02", updates: UPDATE });
    expect(again.body).toMatchObject({ status: "clean", replayed: true, revision: { id: first.body.revision.id } });
  });

  it("blocks an unmodified skill whose upstream drops its allowed-tools restriction", async () => {
    await k.publish("@alpha/demo", "2.0.0", { "SKILL.md": skillText(BODY, "name: demo\ndescription: Demo") });
    await activeKit(null);
    const preview = await k.call("preview-update", { updates: UPDATE });
    expect(preview.body.report.entries[0]).toMatchObject({ status: "needs-review", findings: [{ category: "conflict.capability_escalation" }] });
  });

  it("records a diff past the edit bound as a conflict, not a failure", async () => {
    const lines = (tag: string) => Array.from({ length: 1200 }, (_, i) => `${tag} ${i}\n`).join("");
    await k.publish("@alpha/big", "1.0.0", { "SKILL.md": skillText(BODY), "big.md": lines("old") });
    await k.publish("@alpha/big", "2.0.0", { "SKILL.md": skillText(BODY), "big.md": lines("new") });
    const entry = await k.entry("@alpha/big", "1.0.0", { "SKILL.md": skillText(BODY), "big.md": lines("old").replace("old 0\n", "mine 0\n") });
    const created = await k.call("revisions", { expectedGeneration: 0, idempotencyKey: k.idem(), document: k.doc([entry]) });
    expect(created.status).toBe(201);
    const res = await k.call("rebase", { expectedGeneration: 1, fromRevisionId: created.body.revision.id, idempotencyKey: k.idem(), updates: [{ package: "@alpha/big", version: "2.0.0" }] });
    expect(res.status).toBe(200);
    expect(res.body.report.entries[0].findings).toEqual([{ category: "conflict.same_hunk", path: "big.md", detail: "diff_limit" }]);
  });
});

describe("base budget", () => {
  it("shares reads across phases and fails with 422 kit.request_too_large past the budget", async () => {
    const base = (await k.entry("@alpha/demo", "1.0.0")).base;
    const env = { DB: k.h.deps.db, R2: k.h.deps.bucket } as unknown as Env;
    const cache = newBaseCache(10);
    const a = await loadPinnedBase(env, "user-a", base, cache);
    expect(await loadPinnedBase(env, "user-a", base, cache)).toBe(a);
    expect(cache.spent).toBe(2); // one release lookup, one manifest read
    const tight = newBaseCache(1);
    const error = await loadPinnedBase(env, "user-a", base, tight).then(() => null, (e: unknown) => e);
    expect(error).toBeInstanceOf(ReleaseHttpError);
    expect(error).toMatchObject({ status: 422, code: "kit.request_too_large" });
  });
});
