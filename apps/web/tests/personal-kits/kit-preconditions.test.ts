import { beforeEach, describe, expect, it, vi } from "vitest";
import { BODY, createKitHarness, skillText } from "./kit-harness";
import type { KitHarness } from "./kit-harness";

vi.mock("~/lib/auth/session-helpers", () => ({ getSession: async () => null }));

let k: KitHarness;
const V1 = { "SKILL.md": skillText(BODY) };
const V2 = { "SKILL.md": skillText(BODY.replace("eight\n", "eight (v2)\n")) };
const MINE = { "SKILL.md": skillText(BODY.replace("two\n", "two (mine)\n")) };

beforeEach(async () => {
  k = await createKitHarness();
  await k.publish("@alpha/demo", "1.0.0", V1);
});

const store = async (document: unknown, body: Record<string, unknown>, headers?: Record<string, string>) =>
  k.call("revisions", { idempotencyKey: k.idem(), document, ...body }, { headers });

describe("If-Match on kit writes", () => {
  it("takes the generation from If-Match, as the kit ETag or a bare number, without a body field", async () => {
    const first = await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), {}, { "If-Match": '"g0"' });
    expect(first.status).toBe(201);
    const etag = (await k.call("")).headers.get("ETag")!;
    expect(etag).toBe('"g1"');
    const second = await store(k.doc([await k.entry("@alpha/demo", "1.0.0")]), {}, { "If-Match": etag });
    expect(second.status).toBe(201);
    const activate = await k.call("activate", { revisionId: second.body.revision.id, approval: { revisionDigest: second.body.revision.digest } }, { headers: { "If-Match": "2" } });
    expect(activate.status).toBe(200);
  });

  it("accepts the weak form of the ETag that a compressing proxy hands back, and still checks the generation", async () => {
    const first = await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), {}, { "If-Match": 'W/"g0"' });
    expect(first.status).toBe(201);
    const stale = await store(k.doc([await k.entry("@alpha/demo", "1.0.0")]), {}, { "If-Match": 'W/"g0"' });
    expect(stale.status).toBe(412);
    expect(stale.body.error.code).toBe("kit.generation_conflict");
    const second = await store(k.doc([await k.entry("@alpha/demo", "1.0.0")]), {}, { "If-Match": 'W/"g1"' });
    expect(second.status).toBe(201);
  });

  it("answers a stale If-Match with 412 and writes nothing, while a stale body field stays 409", async () => {
    await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), { expectedGeneration: 0 });
    const before = k.count("personal_kit_revisions") + k.count("personal_kit_audit");
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0")]);
    const stale = await store(document, {}, { "If-Match": '"g0"' });
    expect(stale.status).toBe(412);
    expect(stale.body.error.code).toBe("kit.generation_conflict");
    const legacy = await store(document, { expectedGeneration: 0 });
    expect(legacy.status).toBe(409);
    expect(legacy.body.error.code).toBe("kit.generation_conflict");
    expect(k.count("personal_kit_revisions") + k.count("personal_kit_audit")).toBe(before);
  });

  it("guards every generation-checked write, not only revision stores", async () => {
    const rev = (await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), { expectedGeneration: 0 })).body.revision;
    const activate = await k.call("activate", { revisionId: rev.id, approval: { revisionDigest: rev.digest } }, { headers: { "If-Match": '"g7"' } });
    expect(activate.status).toBe(412);
    await k.publish("@alpha/demo", "2.0.0", V2);
    const rebase = await k.call("rebase", { idempotencyKey: k.idem(), updates: [{ package: "@alpha/demo", version: "2.0.0" }] }, { headers: { "If-Match": '"g5"' } });
    expect(rebase.status).toBe(412);
  });

  it("refuses a malformed If-Match or one that disagrees with the body, before any write", async () => {
    const document = k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]);
    for (const value of ["*", 'W/g0', 'w/"g0"', '"g0", "g1"', "-1", "g"]) {
      const res = await store(document, {}, { "If-Match": value });
      expect(res.status, value).toBe(400);
      expect(res.body.error.code).toBe("invalid_request");
    }
    const split = await store(document, { expectedGeneration: 1 }, { "If-Match": '"g0"' });
    const weakSplit = await store(document, { expectedGeneration: 1 }, { "If-Match": 'W/"g0"' });
    expect(weakSplit.status).toBe(400);
    expect(split.status).toBe(400);
    const agree = await store(document, { expectedGeneration: 0 }, { "If-Match": '"g0"' });
    expect(agree.status).toBe(201);
  });
});

describe("base pins", () => {
  it("accepts any published release of a package as a pin, not only the newest", async () => {
    await k.publish("@alpha/demo", "2.0.0", V2);
    const old = await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), { expectedGeneration: 0 });
    expect(old.status).toBe(201);
    expect(old.body.warnings).toEqual([]);
    const activate = await k.call("activate", { expectedGeneration: 1, revisionId: old.body.revision.id, approval: { revisionDigest: old.body.revision.digest } });
    expect(activate.status).toBe(200);
    expect(activate.body.lock.entries[0]).toMatchObject({ identity: "@alpha/demo", version: "1.0.0" });
  });

  it("keeps resolving a yanked pin with a warning, and refuses an unknown version", async () => {
    await k.publish("@alpha/demo", "2.0.0", V2);
    k.sql("UPDATE package_releases SET release_state = 'yanked' WHERE version = '1.0.0'");
    const yanked = await store(k.doc([await k.entry("@alpha/demo", "1.0.0", MINE)]), { expectedGeneration: 0 });
    expect(yanked.status).toBe(201);
    expect(yanked.body.warnings).toEqual(["@alpha/demo@1.0.0 is yanked; the pin still resolves"]);
    const entry = await k.entry("@alpha/demo", "1.0.0", MINE);
    const unknown = await store(k.doc([{ ...entry, base: { ...entry.base, version: "1.5.0" } }]), { expectedGeneration: 1 });
    expect(unknown.body.error.code).toBe("kit.base_unavailable");
  });
});
