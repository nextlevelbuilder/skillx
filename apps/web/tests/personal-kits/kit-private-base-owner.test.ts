import { beforeEach, describe, expect, it, vi } from "vitest";
import { baseFailure, loadPinnedBase, loadUpstream, newBaseCache } from "~/lib/personal-kits/base-loader";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

/**
 * A personal kit may pin a private skill of the same account as its base:
 * the owner of the base's publisher loads it without an entitlement. Other
 * accounts, a revoked key and a suspended publisher stay denied, and a
 * public kit still may not derive from it.
 */
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));
vi.mock("~/lib/auth/session-helpers", () => ({
  getSession: async () => (session.user === null ? null : { user: session.user }),
}));

const SECRET = "@alpha/secret";
const FILES = { "SKILL.md": skillText(BODY, "name: secret\ndescription: Secret") };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n"), "name: secret\ndescription: Secret"), "notes.md": "my notes\n" };

let k: KitHarness;
let pin: { package: string; version: string; releaseDigest: string };

beforeEach(async () => {
  session.user = null;
  k = await createKitHarness();
  pin = { package: SECRET, version: "1.0.0", releaseDigest: await k.publish(SECRET, "1.0.0", FILES) };
  k.sql("UPDATE packages SET visibility = 'private' WHERE name = ?", SECRET);
});

const env = () => ({ DB: k.h.deps.db, R2: k.h.deps.bucket }) as unknown as Env;

/** The failure category of loading the pinned base as `userId`, or "loaded". */
async function loadAs(userId: string, load: "pin" | "upstream" = "pin"): Promise<string> {
  try {
    const loaded = load === "pin" ? await loadPinnedBase(env(), userId, pin, newBaseCache()) : await loadUpstream(env(), userId, SECRET, "1.0.0", newBaseCache());
    expect(loaded.release.identity).toBe(SECRET);
    expect(loaded.tree.digest).toBe(pin.releaseDigest);
    return "loaded";
  } catch (error) {
    const failure = baseFailure(error);
    if (failure === null) throw error;
    return failure;
  }
}

async function write(kit: string, files: Record<string, string> | undefined, key: string | null, extra: Record<string, unknown> = {}, expectedGeneration = 0) {
  const document = k.doc([await k.entry(SECRET, "1.0.0", files)], { kit, localId: `local/${kit.split("/")[1]}`, ...extra });
  return k.call("revisions", { expectedGeneration, idempotencyKey: k.idem(), document }, { kit, key });
}

describe("personal kit base: a private skill of the same account", () => {
  it("denies other accounts and the anonymous subject before the owner case is checked", async () => {
    for (const userId of ["user-b", "user-c", ""]) {
      expect(await loadAs(userId)).toBe("entitlement");
      expect(await loadAs(userId, "upstream")).toBe("entitlement");
    }
  });

  it("denies a grantee whose entitlement was revoked", async () => {
    k.sql("INSERT INTO entitlements (id, subject_id, package_id, release_id, source, granted_at, revoked_at) SELECT 'ent-b', 'user-b', id, NULL, 'grant', 1, 7 FROM packages WHERE name = ?", SECRET);
    expect(await loadAs("user-b")).toBe("entitlement");
  });

  it("loads the pinned base and the upstream release for the owner of the publisher", async () => {
    expect(await loadAs("user-a")).toBe("loaded");
    expect(await loadAs("user-a", "upstream")).toBe("loaded");
  });

  it.each(["suspended", "revoked"])("refuses the owner's base once its publisher is %s", async (state) => {
    k.sql("UPDATE publishers SET state = ? WHERE handle = 'alpha'", state);
    expect(await loadAs("user-a")).toBe("revoked_base");
    expect(await loadAs("user-b")).toBe("entitlement");
  });

  it("stops loading for the previous owner when the publisher changes hands", async () => {
    k.sql("UPDATE publishers SET owner_user_id = 'user-c' WHERE handle = 'alpha'");
    expect(await loadAs("user-a")).toBe("entitlement");
    expect(await loadAs("user-c")).toBe("loaded");
  });

  it("refuses another account's kit over the private base, and a revoked owner key", async () => {
    const foreign = await write("@beta/x", MINE, k.otherKey);
    expect(foreign.status).toBe(422);
    expect(foreign.body.error.code).toBe("kit.base_unavailable");
    expect(foreign.body.error.message).toContain("(entitlement)");
    const revoked = await k.h.createKey("user-a", null, true);
    expect((await write("@alpha/my-kit", MINE, revoked)).status).toBe(401);
    expect(k.count("personal_kits") + k.count("personal_kit_revisions")).toBe(0);
  });

  it("stores, activates and locks the owner's private kit over the private base", async () => {
    const created = await write("@alpha/my-kit", MINE, k.ownerKey);
    expect(created.status).toBe(201);
    const { revision } = created.body;
    const activated = await k.call("activate", { expectedGeneration: 1, revisionId: revision.id, approval: { revisionDigest: revision.digest } });
    expect(activated.status).toBe(200);
    expect(activated.body.lock.entries[0]).toMatchObject({ identity: SECRET, version: "1.0.0" });
    // Another account cannot see the kit either.
    expect((await k.call("", undefined, { key: k.otherKey })).status).toBe(404);
  });

  it("still refuses a public kit that derives from the owner's private base", async () => {
    const res = await write("@alpha/my-kit", undefined, k.ownerKey, { visibility: "public" });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe("kit.public_derivative_forbidden");
  });
});
