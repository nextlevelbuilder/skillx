import { beforeEach, describe, expect, it } from "vitest";
import { DASHBOARD_REVISIONS_PER_KIT, listOwnedKits, listOwnedPackages } from "~/lib/creator/creator-dashboard";
import { RESTORE_WINDOW_MS } from "~/lib/creator/owner-audit";
import { BODY, createKitHarness, skillText } from "../personal-kits/kit-harness";
import type { KitHarness } from "../personal-kits/kit-harness";

/**
 * Dashboard data: the owner's packages with every release state and the
 * owner's kits with their newest revisions, deleted ones included with their
 * restore deadline, and nothing of anyone else.
 * Fixtures: `user-a` owns `@alpha` and the suspended `@gone`, `user-b` owns `@beta`.
 */
let k: KitHarness;

const tree = (name: string) => ({ "SKILL.md": skillText(BODY, `name: ${name}\ndescription: ${name}`) });
const setState = (name: string, version: string, state: string) =>
  k.sql("UPDATE package_releases SET release_state = ? WHERE version = ? AND package_id = (SELECT id FROM packages WHERE name = ?)", state, version, name);

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", tree("demo"));
  await k.publish("@alpha/demo", "1.1.0", tree("demo"));
  await k.publish("@alpha/old", "1.0.0", tree("old"));
  await k.publish("@beta/hidden", "1.0.0", tree("hidden"));
});

describe("dashboard packages", () => {
  it("lists the owner's packages with all releases, quarantined ones included", async () => {
    setState("@alpha/demo", "1.1.0", "quarantined");
    const { items, truncated } = await listOwnedPackages(k.h.deps.db, "user-a");
    expect(truncated).toBe(false);
    expect(items.map((p) => p.identity)).toEqual(["@alpha/demo", "@alpha/old"]);
    const demo = items[0];
    expect(demo).toMatchObject({ kind: "skill", visibility: "public", publisherHandle: "alpha", publisherState: "active", deletedAt: null, restoreDeadline: null });
    expect(demo.releases.map((r) => [r.version, r.state]).sort()).toEqual([
      ["1.0.0", "published"],
      ["1.1.0", "quarantined"],
    ]);
    expect(demo.releasesTruncated).toBe(false);
  });

  it("shows nothing of another account's packages", async () => {
    setState("@beta/hidden", "1.0.0", "quarantined");
    expect((await listOwnedPackages(k.h.deps.db, "user-b")).items.map((p) => p.identity)).toEqual(["@beta/hidden"]);
    expect((await listOwnedPackages(k.h.deps.db, "user-c")).items).toEqual([]);
    expect((await listOwnedPackages(k.h.deps.db, "")).items).toEqual([]);
  });

  it("includes a deleted package with its restore deadline", async () => {
    k.sql("UPDATE packages SET deleted_at = 1000 WHERE name = '@alpha/old'");
    const old = (await listOwnedPackages(k.h.deps.db, "user-a")).items.find((p) => p.identity === "@alpha/old");
    expect(old).toMatchObject({ deletedAt: 1000, restoreDeadline: 1000 + RESTORE_WINDOW_MS });
    expect(old?.releases).toHaveLength(1);
  });
});

describe("dashboard kits", () => {
  async function revise(times: number) {
    for (let generation = 0; generation < times; generation++) {
      const document = k.doc([await k.entry("@alpha/demo", "1.0.0", { "SKILL.md": skillText(`${BODY}revision ${generation}\n`, "name: demo\ndescription: demo") })]);
      const res = await k.call("revisions", { expectedGeneration: generation, idempotencyKey: k.idem(), document });
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
  }

  it("lists the owner's kits with their newest revisions first", async () => {
    await revise(2);
    const { items } = await listOwnedKits(k.h.deps.db, "user-a");
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ identity: "@alpha/my-kit", visibility: "private", latestRevisionNumber: 2, effectiveRevision: null, deletedAt: null });
    expect(items[0].revisions.map((r) => r.number)).toEqual([2, 1]);
    expect((await listOwnedKits(k.h.deps.db, "user-b")).items).toEqual([]);
  });

  it("caps the revisions per kit and includes a deleted kit with its deadline", async () => {
    await revise(DASHBOARD_REVISIONS_PER_KIT + 2);
    k.sql("UPDATE personal_kits SET deleted_at = 5000");
    const [kit] = (await listOwnedKits(k.h.deps.db, "user-a")).items;
    expect(kit.revisions).toHaveLength(DASHBOARD_REVISIONS_PER_KIT);
    expect(kit.revisions[0].number).toBe(DASHBOARD_REVISIONS_PER_KIT + 2);
    expect(kit).toMatchObject({ deletedAt: 5000, restoreDeadline: 5000 + RESTORE_WINDOW_MS });
  });
});
